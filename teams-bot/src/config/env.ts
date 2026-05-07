import dotenv from "dotenv";
import type { PriorityUser } from "../domain/parking";

dotenv.config();

export type DailyCloseMode = "auto_checkout" | "notify_admins";

export interface AppConfig {
  port: number;
  publicBaseUrl: string;
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  microsoft: {
    appId: string;
    appPassword: string;
    appType: string;
    appTenantId: string;
  };
  parking: {
    adminUserIds: string[];
    priorityUsers: PriorityUser[];
    defaultPriorityLabels: string[];
  };
  scheduler: {
    enabled: boolean;
    timeZone: string;
    dailyCloseMode: DailyCloseMode;
    jobSecret: string;
  };
}

export const config: AppConfig = {
  port: numberEnv("PORT", 3978),
  publicBaseUrl: stringEnv("PUBLIC_BASE_URL", ""),
  supabase: {
    url: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  },
  microsoft: {
    appId: requiredEnv("MICROSOFT_APP_ID"),
    appPassword: requiredEnv("MICROSOFT_APP_PASSWORD"),
    appType: stringEnv("MICROSOFT_APP_TYPE", "MultiTenant"),
    appTenantId: stringEnv("MICROSOFT_APP_TENANT_ID", "")
  },
  parking: {
    adminUserIds: listEnv("ADMIN_USER_IDS"),
    priorityUsers: parsePriorityUsers(),
    defaultPriorityLabels: listEnv("DEFAULT_PRIORITY_LABELS", ["대표님", "상무님"])
  },
  scheduler: {
    enabled: booleanEnv("ENABLE_SCHEDULER", true),
    timeZone: stringEnv("TIME_ZONE", "Asia/Seoul"),
    dailyCloseMode: dailyCloseModeEnv("DAILY_CLOSE_MODE", "notify_admins"),
    jobSecret: stringEnv("JOB_SECRET", "")
  }
};

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function stringEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function listEnv(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function dailyCloseModeEnv(name: string, fallback: DailyCloseMode): DailyCloseMode {
  const raw = process.env[name];
  return raw === "auto_checkout" || raw === "notify_admins" ? raw : fallback;
}

function parsePriorityUsers(): PriorityUser[] {
  const raw = process.env.PRIORITY_USERS;

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [userId, label, role] = item.split(":").map((part) => part.trim());
      return {
        userId: userId || undefined,
        label: label || userId,
        role: role || undefined
      };
    })
    .filter((user): user is PriorityUser => Boolean(user.label));
}
