import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tmpRoot: string;
let origEnv: string | undefined;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `cjl-test-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
  origEnv = process.env.CLAUDE_JAVA_LSP_ROOT;
  delete process.env.CLAUDE_JAVA_LSP_ROOT;
});

afterEach(() => {
  if (origEnv !== undefined) process.env.CLAUDE_JAVA_LSP_ROOT = origEnv;
  else delete process.env.CLAUDE_JAVA_LSP_ROOT;
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

  it("uses CLAUDE_JAVA_LSP_ROOT env var when set", async () => {
    process.env.CLAUDE_JAVA_LSP_ROOT = tmpRoot;
    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const result = findMavenRoot("/some/random/Foo.java");
    expect(result).toBe(tmpRoot);
    delete process.env.CLAUDE_JAVA_LSP_ROOT;
  });

  it("falls back to nearest pom when topmost is not a reactor", async () => {
    // Two pom.xml files but the topmost has no <modules> tag
    const outer = join(tmpRoot, "outer");
    const inner = join(outer, "inner", "src");
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(outer, "pom.xml"), "<project></project>");
    writeFileSync(join(outer, "inner", "pom.xml"), "<project></project>");
    const file = join(inner, "Foo.java");
    writeFileSync(file, "");

    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const root = findMavenRoot(file);
    // Should be inner (nearest pom), not outer (non-reactor topmost)
    expect(root).toBe(join(outer, "inner"));
  });

  it("treats unreadable topmost pom as non-reactor (falls back to nearest)", async () => {
    // pom.xml is a directory → readFileSync throws → isReactor returns false
    const outer = join(tmpRoot, "outer2");
    const inner = join(outer, "inner", "src");
    mkdirSync(inner, { recursive: true });
    // Make pom.xml a directory so readFileSync throws
    mkdirSync(join(outer, "pom.xml"), { recursive: true });
    writeFileSync(join(outer, "inner", "pom.xml"), "<project></project>");
    const file = join(inner, "Foo.java");
    writeFileSync(file, "");

    const { findMavenRoot } = await import("../../src/workspace/detect.ts");
    const root = findMavenRoot(file);
    // Topmost "pom.xml" is unreadable → isReactor returns false → falls back to nearest
    expect(root).toBe(join(outer, "inner"));
  });
});
