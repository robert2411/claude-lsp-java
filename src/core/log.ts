import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info";

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function format(level: Level, msg: string): string {
  return `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
}

let logFile: string | null = null;

export function setLogFile(path: string): void {
  try { mkdirSync(dirname(path), { recursive: true }); } catch {}
  logFile = path;
}

function emit(level: Level, msg: string): void {
  if (!shouldLog(level)) return;
  const line = format(level, msg);
  if (logFile) {
    try { appendFileSync(logFile, line + "\n"); } catch {}
  } else {
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
  }
}

export const log = {
  debug: (msg: string) => emit("debug", msg),
  info:  (msg: string) => emit("info", msg),
  warn:  (msg: string) => emit("warn", msg),
  error: (msg: string) => emit("error", msg),
};
