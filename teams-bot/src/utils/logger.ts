export const logger = {
  info(message: string, meta?: unknown): void {
    log("info", message, meta);
  },
  warn(message: string, meta?: unknown): void {
    log("warn", message, meta);
  },
  error(message: string, meta?: unknown): void {
    log("error", message, meta);
  }
};

function log(level: "info" | "warn" | "error", message: string, meta?: unknown): void {
  const payload = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString()
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
