import cron, { type ScheduledTask } from "node-cron";
import type { AppConfig } from "../config/env";
import type { ParkingNotifier } from "../teams/parkingNotifier";
import { logger } from "../utils/logger";

export interface DailyParkingJobs {
  stop(): void;
}

export function startDailyParkingJobs(
  notifier: ParkingNotifier,
  config: AppConfig
): DailyParkingJobs {
  const tasks: ScheduledTask[] = [
    cron.schedule(
      "0 8 * * *",
      () => {
        notifier.postDailyStatus().catch((error: unknown) => {
          logger.error("Daily 8 AM parking status failed", { error });
        });
      },
      { timezone: config.scheduler.timeZone }
    ),
    cron.schedule(
      "0 22 * * *",
      () => {
        notifier.runDailyClose().catch((error: unknown) => {
          logger.error("Daily 10 PM parking close job failed", { error });
        });
      },
      { timezone: config.scheduler.timeZone }
    )
  ];

  logger.info("Daily parking jobs started", {
    timeZone: config.scheduler.timeZone,
    dailyCloseMode: config.scheduler.dailyCloseMode
  });

  return {
    stop(): void {
      tasks.forEach((task) => task.stop());
    }
  };
}
