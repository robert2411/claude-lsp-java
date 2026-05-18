import { execSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

export interface JdkInfo {
  path: string;
  version: number;
  name: string; // JavaSE-1.8, JavaSE-11, JavaSE-17, JavaSE-21, …
}

export function findRunnerJdk(): string {
  // Explicit override
  const override = process.env.JDTLS_JAVA_HOME ?? process.env.JAVA_HOME;
  if (override) {
    const v = javaVersion(join(override, "bin", "java"));
    if (v && v >= 21) return override;
    if (v) throw new Error(`JAVA_HOME ${override} is Java ${v}, but jdtls requires Java 21+. Set JDTLS_JAVA_HOME to a Java 21+ installation.`);
  }

  // PATH java
  const pathJava = javaVersion("java");
  if (pathJava && pathJava >= 21) return pathFromJava("java") ?? "";

  // Common roots
  for (const candidate of commonJdkRoots()) {
    const v = javaVersion(join(candidate, "bin", "java"));
    if (v && v >= 21) return candidate;
  }

  throw new Error(
    "No Java 21+ installation found. Install JDK 21 or later and set JDTLS_JAVA_HOME to its root.",
  );
}

export function findAllJdks(): JdkInfo[] {
  const found: JdkInfo[] = [];
  const seen = new Set<string>();

  const add = (root: string) => {
    if (seen.has(root)) return;
    seen.add(root);
    const v = javaVersion(join(root, "bin", "java"));
    if (v) found.push({ path: root, version: v, name: jdkName(v) });
  };

  if (process.env.JDTLS_JAVA_HOME) add(process.env.JDTLS_JAVA_HOME);
  if (process.env.JAVA_HOME) add(process.env.JAVA_HOME);
  const pathRoot = pathFromJava("java");
  if (pathRoot) add(pathRoot);
  for (const r of commonJdkRoots()) add(r);

  return found;
}

function commonJdkRoots(): string[] {
  const roots: string[] = [];
  // Linux
  if (existsSync("/usr/lib/jvm")) {
    try { readdirSync("/usr/lib/jvm").forEach(n => roots.push(join("/usr/lib/jvm", n))); } catch {}
  }
  // SDKMAN
  const sdkman = join(process.env.HOME ?? "", ".sdkman", "candidates", "java");
  if (existsSync(sdkman)) {
    try { readdirSync(sdkman).filter(n => n !== "current").forEach(n => roots.push(join(sdkman, n))); } catch {}
  }
  // macOS
  const jvmRoot = "/Library/Java/JavaVirtualMachines";
  if (existsSync(jvmRoot)) {
    try {
      readdirSync(jvmRoot).forEach(n => {
        const home = join(jvmRoot, n, "Contents", "Home");
        if (existsSync(home)) roots.push(home);
      });
    } catch {}
  }
  // Homebrew
  const brewOpt = "/opt/homebrew/opt";
  if (existsSync(brewOpt)) {
    try {
      readdirSync(brewOpt)
        .filter(n => n.startsWith("openjdk"))
        .forEach(n => {
          const home = join(brewOpt, n, "libexec", "openjdk.jdk", "Contents", "Home");
          if (existsSync(home)) roots.push(home);
        });
    } catch {}
  }
  return roots;
}

function javaVersion(javaBin: string): number | null {
  try {
    const out = execSync(`"${javaBin}" -version 2>&1`, { stdio: "pipe" }).toString();
    const m = /version "(?:1\.(\d+)|(\d+))/.exec(out);
    if (!m) return null;
    return Number.parseInt(m[1] ?? m[2]);
  } catch {
    return null;
  }
}

function pathFromJava(javaBin: string): string | null {
  try {
    const out = execSync(`which ${javaBin}`, { stdio: "pipe" }).toString().trim();
    if (!out) return null;
    const real = realpathSync(out);
    // bin/java → bin/ → jdk root
    return join(real, "..", "..");
  } catch {
    return null;
  }
}

function jdkName(version: number): string {
  if (version <= 8) return "JavaSE-1.8";
  return `JavaSE-${version}`;
}
