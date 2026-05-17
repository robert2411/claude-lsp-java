import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We need a fresh import of detect to avoid cache pollution
let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `cjl-test-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("findMavenRoot", () => {
  it("finds nearest pom.xml for a standalone project", async () => {
    const projectDir = join(tmpRoot, "myproject");
    const srcDir = join(projectDir, "src", "main", "java");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(projectDir, "pom.xml"), "<project></project>");
    const javaFile = join(srcDir, "Foo.java");
    writeFileSync(javaFile, "");

    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const root = findMavenRoot(javaFile);
    expect(root).toBe(projectDir);
  });

  it("finds reactor root for a multi-module project", async () => {
    const reactorDir = join(tmpRoot, "reactor");
    const coreDir = join(reactorDir, "core");
    const srcDir = join(coreDir, "src", "main", "java");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(reactorDir, { recursive: true });
    writeFileSync(join(reactorDir, "pom.xml"), "<project><modules><module>core</module></modules></project>");
    writeFileSync(join(coreDir, "pom.xml"), "<project></project>");
    const javaFile = join(srcDir, "Foo.java");
    writeFileSync(javaFile, "");

    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const root = findMavenRoot(javaFile);
    expect(root).toBe(reactorDir);
  });

  it("returns start dir when no pom.xml found", async () => {
    const dir = join(tmpRoot, "nopom", "src");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "Foo.java");
    writeFileSync(file, "");

    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const root = findMavenRoot(file);
    expect(root).toBe(dir);
  });
});
