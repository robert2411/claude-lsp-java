import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Pull in module-only files for coverage — their initialization is the coverage target
import "../../src/core/config.ts";
import "../../src/core/paths.ts";
import "../../src/mcp/tools.ts";
import "../../src/daemon/protocol.ts";

// ---- debounce ----
import { debounce } from "../../src/util/debounce.ts";

describe("debounce", () => {
  it("calls the function after the delay", async () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 30);
    fn(1);
    await new Promise(r => setTimeout(r, 60));
    expect(calls).toEqual([1]);
  });

  it("only fires once when called multiple times within the window", async () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 50);
    fn(1);
    fn(2);
    fn(3);
    await new Promise(r => setTimeout(r, 100));
    expect(calls).toEqual([3]);
  });

  it("resets timer on each call", async () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 50);
    fn(1);
    await new Promise(r => setTimeout(r, 30));
    fn(2);
    await new Promise(r => setTimeout(r, 30));
    // Timer reset, first call should NOT have fired yet
    expect(calls).toHaveLength(0);
    await new Promise(r => setTimeout(r, 40));
    expect(calls).toEqual([2]);
  });
});

// ---- sha256 ----
import { sha256String, sha256File } from "../../src/util/sha256.ts";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `cjl-sha-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("sha256String", () => {
  it("returns a 64-char hex string", () => {
    const hash = sha256String("hello");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("is deterministic", () => {
    expect(sha256String("hello")).toBe(sha256String("hello"));
  });

  it("differs for different inputs", () => {
    expect(sha256String("hello")).not.toBe(sha256String("world"));
  });
});

describe("sha256File", () => {
  it("hashes a file correctly", () => {
    const file = join(tmpRoot, "test.txt");
    writeFileSync(file, "hello");
    const hash = sha256File(file);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(sha256String("hello"));
  });
});

// ---- selfArgv / selfCommand ----
import { selfArgv, selfCommand } from "../../src/util/self.ts";

describe("selfArgv", () => {
  it("returns an array with at least one element", () => {
    const argv = selfArgv();
    expect(Array.isArray(argv)).toBe(true);
    expect(argv.length).toBeGreaterThanOrEqual(1);
  });

  it("all elements are strings", () => {
    const argv = selfArgv();
    for (const a of argv) expect(typeof a).toBe("string");
  });
});

describe("selfCommand", () => {
  it("returns a non-empty string", () => {
    const cmd = selfCommand();
    expect(typeof cmd).toBe("string");
    expect(cmd.length).toBeGreaterThan(0);
  });

  it("matches selfArgv joined by space", () => {
    expect(selfCommand()).toBe(selfArgv().join(" "));
  });
});
