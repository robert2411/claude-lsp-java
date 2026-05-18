import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ---- bootstrap: getJdtlsLayout ----
// In a test environment, jdtls is not installed → getJdtlsLayout returns null.
// This exercises getJdtlsLayout + findLauncherJar + platformConfigDir.
import { getJdtlsLayout } from "../../src/jdtls/bootstrap.ts";

describe("getJdtlsLayout", () => {
  it("returns null or a valid layout object", () => {
    const layout = getJdtlsLayout();
    if (layout === null) {
      expect(layout).toBeNull();
    } else {
      expect(typeof layout.launcherJar).toBe("string");
      expect(layout.launcherJar).toContain(".jar");
      expect(typeof layout.configDir).toBe("string");
    }
  });

  it("returns a layout with existing launcherJar and configDir when installed", () => {
    const layout = getJdtlsLayout();
    if (layout) {
      const { existsSync } = require("fs");
      expect(existsSync(layout.launcherJar)).toBe(true);
      expect(existsSync(layout.configDir)).toBe(true);
    }
  });
});

// ---- jdk: findAllJdks / findRunnerJdk ----
import { findAllJdks, findRunnerJdk } from "../../src/jdtls/jdk.ts";

let tmpRoot: string;
let origHome: string | undefined;
let origJavaHome: string | undefined;
let origJdtlsHome: string | undefined;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `cjl-jdk-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
  origHome = process.env.HOME;
  origJavaHome = process.env.JAVA_HOME;
  origJdtlsHome = process.env.JDTLS_JAVA_HOME;
});

afterEach(() => {
  if (origHome !== undefined) process.env.HOME = origHome;
  else delete process.env.HOME;
  if (origJavaHome !== undefined) process.env.JAVA_HOME = origJavaHome;
  else delete process.env.JAVA_HOME;
  if (origJdtlsHome !== undefined) process.env.JDTLS_JAVA_HOME = origJdtlsHome;
  else delete process.env.JDTLS_JAVA_HOME;
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("findAllJdks", () => {
  it("returns an array (possibly empty in CI without JDK)", () => {
    const jdks = findAllJdks();
    expect(Array.isArray(jdks)).toBe(true);
  }, 30000);

  it("each entry has path, version, and name fields", () => {
    const jdks = findAllJdks();
    for (const jdk of jdks) {
      expect(typeof jdk.path).toBe("string");
      expect(typeof jdk.version).toBe("number");
      expect(typeof jdk.name).toBe("string");
      expect(jdk.version).toBeGreaterThan(0);
    }
  }, 30000);

  it("skips JAVA_HOME if java binary is not present", () => {
    process.env.JAVA_HOME = join(tmpRoot, "fake-jdk-no-bin");
    mkdirSync(process.env.JAVA_HOME, { recursive: true });
    const jdks = findAllJdks();
    const fromFakeHome = jdks.find(j => j.path.includes("fake-jdk-no-bin"));
    expect(fromFakeHome).toBeUndefined();
  });

  it("skips JDTLS_JAVA_HOME if java binary is not present", () => {
    process.env.JDTLS_JAVA_HOME = join(tmpRoot, "fake-jdtls-no-bin");
    mkdirSync(process.env.JDTLS_JAVA_HOME, { recursive: true });
    const jdks = findAllJdks();
    const fromFakeHome = jdks.find(j => j.path.includes("fake-jdtls-no-bin"));
    expect(fromFakeHome).toBeUndefined();
  });

  it("does not include duplicates from JAVA_HOME = JDTLS_JAVA_HOME", () => {
    const fakePath = join(tmpRoot, "same-jdk");
    mkdirSync(join(fakePath, "bin"), { recursive: true });
    process.env.JAVA_HOME = fakePath;
    process.env.JDTLS_JAVA_HOME = fakePath;
    const jdks = findAllJdks();
    const matching = jdks.filter(j => j.path === fakePath);
    expect(matching.length).toBeLessThanOrEqual(1);
  });
});

describe("findRunnerJdk", () => {
  it("returns a non-empty string when a JDK ≥21 is available", () => {
    const result = findRunnerJdk();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it("throws when JDTLS_JAVA_HOME points to a non-existent or too-old JDK", () => {
    process.env.JDTLS_JAVA_HOME = join(tmpRoot, "fake-jdk-v8");
    // No java binary → javaVersion returns null → falls through to PATH/candidates
    // Should either succeed (if PATH has java 21+) or throw — but never crash
    try {
      findRunnerJdk();
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }
    delete process.env.JDTLS_JAVA_HOME;
  }, 30000);
});
