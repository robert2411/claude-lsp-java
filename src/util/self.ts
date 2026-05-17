import { resolve } from "path";

/**
 * Returns [executablePath, ...extraArgs] to spawn this same process.
 * In compiled mode: [binaryPath]
 * In dev mode (bun run src/index.ts): [bunPath, srcIndexPath]
 */
export function selfArgv(): string[] {
  const main = process.argv[1];
  if (main && main.endsWith(".ts")) {
    return [resolve(process.execPath), resolve(main)];
  }
  return [resolve(process.execPath)];
}

/** The command string for shell/config use (e.g., hook entry in settings.json). */
export function selfCommand(): string {
  return selfArgv().join(" ");
}
