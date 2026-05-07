import { createClient } from "@supabase/supabase-js";
import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "./config/env";
import { SupabaseParkingRepository, type Database } from "./repositories/supabaseParkingRepository";
import { ParkingService } from "./services/parkingService";
import { startDailyParkingJobs } from "./scheduler/dailyParkingJobs";
import { createBotAdapter } from "./teams/createBotAdapter";
import { ParkingBot } from "./teams/parkingBot";
import { ParkingNotifier } from "./teams/parkingNotifier";
import { TeamsStateStore } from "./teams/teamsStateStore";
import { logger } from "./utils/logger";

const supabase = createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const repository = new SupabaseParkingRepository(supabase);
const parkingService = new ParkingService(repository, {
  priorityUsers: config.parking.priorityUsers
});
const teamsStateStore = new TeamsStateStore(repository);
const adapter = createBotAdapter(config);
const bot = new ParkingBot(parkingService, teamsStateStore, {
  adminUserIds: config.parking.adminUserIds,
  defaultPriorityLabels: config.parking.defaultPriorityLabels,
  timeZone: config.scheduler.timeZone
});
const notifier = new ParkingNotifier(adapter, parkingService, teamsStateStore, config);
const app = express();

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "biscat-parking-manager",
    schedulerEnabled: config.scheduler.enabled
  });
});

app.get(
  "/api/parking/status",
  asyncHandler(async (_request, response) => {
    response.json(await parkingService.getStatus());
  })
);

app.post("/api/messages", (request, response) => {
  adapter.process(request, response, async (context) => {
    await bot.run(context);
  });
});

app.post(
  "/api/jobs/morning-status",
  requireJobSecret,
  asyncHandler(async (_request, response) => {
    response.json(await notifier.postDailyStatus());
  })
);

app.post(
  "/api/jobs/daily-close",
  requireJobSecret,
  asyncHandler(async (_request, response) => {
    response.json(await notifier.runDailyClose());
  })
);

app.post(
  "/api/jobs/update-latest-status",
  requireJobSecret,
  asyncHandler(async (_request, response) => {
    response.json(await notifier.updateLatestStatus("최신 주차 현황입니다."));
  })
);

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  logger.error("HTTP request failed", {
    message: error.message,
    stack: error.stack
  });

  response.status(500).json({
    ok: false,
    error: "Internal server error"
  });
});

if (config.scheduler.enabled) {
  startDailyParkingJobs(notifier, config);
}

app.listen(config.port, () => {
  logger.info("BISCAT Parking Manager started", {
    port: config.port
  });
});

function requireJobSecret(request: Request, response: Response, next: NextFunction): void {
  if (!config.scheduler.jobSecret) {
    next();
    return;
  }

  const providedSecret = request.header("x-job-secret") ?? String(request.query.secret ?? "");

  if (providedSecret !== config.scheduler.jobSecret) {
    response.status(401).json({
      ok: false,
      error: "Unauthorized"
    });
    return;
  }

  next();
}

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}
