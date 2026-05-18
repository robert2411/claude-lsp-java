import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `cjl-log-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("log module", () => {
  it("setLogFile creates the directory and writes log entries to file", async () => {
    const { setLogFile, log } = await import("../../src/core/log.ts");
    const logPath = join(tmpRoot, "subdir", "test.log");
    setLogFile(logPath);
    log.info("hello from test");
    const content = readFileSync(logPath, "utf8");
    expect(content).toContain("[INFO]");
    expect(content).toContain("hello from test");
    // Reset to stderr output for other tests
    setLogFile("/dev/null");
  });

  it("log.warn writes warn-level entries", async () => {
    const { setLogFile, log } = await import("../../src/core/log.ts");
    const logPath = join(tmpRoot, "warn.log");
    setLogFile(logPath);
    log.warn("watch out");
    const content = readFileSync(logPath, "utf8");
    expect(content).toContain("[WARN]");
    expect(content).toContain("watch out");
    setLogFile("/dev/null");
  });

  it("log.error writes error-level entries", async () => {
    const { setLogFile, log } = await import("../../src/core/log.ts");
    const logPath = join(tmpRoot, "error.log");
    setLogFile(logPath);
    log.error("something failed");
    const content = readFileSync(logPath, "utf8");
    expect(content).toContain("[ERROR]");
    expect(content).toContain("something failed");
    setLogFile("/dev/null");
  });

  it("log.debug does not write when LOG_LEVEL is info", async () => {
    // Default level is 'info', so debug should be suppressed
    const { setLogFile, log } = await import("../../src/core/log.ts");
    const logPath = join(tmpRoot, "debug.log");
    setLogFile(logPath);
    log.debug("this is debug");
    // File might not exist or be empty since debug is filtered
    const exists = existsSync(logPath);
    if (exists) {
      const content = readFileSync(logPath, "utf8");
      expect(content).not.toContain("[DEBUG]");
    }
    setLogFile("/dev/null");
  });

  it("log entries include ISO timestamp prefix", async () => {
    const { setLogFile, log } = await import("../../src/core/log.ts");
    const logPath = join(tmpRoot, "ts.log");
    setLogFile(logPath);
    log.info("timestamp test");
    const content = readFileSync(logPath, "utf8");
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    setLogFile("/dev/null");
  });
});
