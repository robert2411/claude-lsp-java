import { existsSync, readFileSync, realpathSync, statSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const HOME = homedir();
const cache = new Map<string, string>();

export function findMavenRoot(filePath: string): string {
  if (process.env.CLAUDE_JAVA_LSP_ROOT) {
    return realpathSync(process.env.CLAUDE_JAVA_LSP_ROOT);
  }

  const realFile = tryRealpath(filePath);
  // If path is a directory, search from it; if a file, search from its parent
  let isDir = false;
  try { isDir = statSync(realFile).isDirectory(); } catch {}
  const dir = isDir ? realFile : dirname(realFile);

  if (cache.has(dir)) return cache.get(dir)!;

  const root = detectRoot(dir);
  cache.set(dir, root);
  return root;
}

function detectRoot(startDir: string): string {
  const pomDirs: string[] = [];
  let current = startDir;

  while (current !== HOME && current !== "/" && current !== dirname(current)) {
    if (existsSync(join(current, "pom.xml"))) {
      pomDirs.push(current);
    }
    current = dirname(current);
  }

  if (pomDirs.length === 0) {
    // No pom.xml found; use the start dir
    return startDir;
  }

  // Topmost pom wins (last element = closest to root)
  const topmost = pomDirs[pomDirs.length - 1];

  // Verify it's actually a reactor by checking <modules> tag (lightweight)
  if (pomDirs.length > 1 && isReactor(topmost)) {
    return tryRealpath(topmost);
  }

  // Fall back to the nearest single pom (first element)
  return tryRealpath(pomDirs[0]);
}

function isReactor(dir: string): boolean {
  try {
    const pom = readFileSync(join(dir, "pom.xml"), "utf8");
    return pom.includes("<modules>");
  } catch {
    return false;
  }
}

function tryRealpath(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}
