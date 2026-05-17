import { spawn } from "child_process";
import { mkdirSync } from "fs";
import { join } from "path";
import { JDTLS_JVM_ARGS } from "../core/config.ts";
import { WORKSPACES_DIR } from "../core/paths.ts";
import { sha256String } from "../util/sha256.ts";
import { findRunnerJdk, findAllJdks } from "./jdk.ts";
import { getJdtlsLayout, bootstrapJdtls } from "./bootstrap.ts";
import { LspClient } from "../lsp/client.ts";
import { fileToUri } from "../util/uri.ts";
import { log } from "../core/log.ts";
import type { ChildProcess } from "child_process";

export interface JdtlsSession {
  proc: ChildProcess;
  client: LspClient;
  rootUri: string;
}

export async function launchJdtls(rootPath: string, logStream: import("fs").WriteStream | null): Promise<JdtlsSession> {
  let layout = getJdtlsLayout();
  if (!layout) {
    log.info("jdtls not found in cache, bootstrapping…");
    layout = await bootstrapJdtls();
  }

  const runnerJdk = findRunnerJdk();
  const javaBin = join(runnerJdk, "bin", "java");
  const allJdks = findAllJdks();
  const runtimes = buildRuntimes(allJdks);

  const workspaceHash = sha256String(rootPath).slice(0, 16);
  const dataDir = join(WORKSPACES_DIR, workspaceHash);
  mkdirSync(dataDir, { recursive: true });

  const argv = [
    ...JDTLS_JVM_ARGS,
    "-jar", layout.launcherJar,
    "-configuration", layout.configDir,
    "-data", dataDir,
  ];

  log.info(`Launching jdtls for ${rootPath}`);
  log.debug(`argv: ${javaBin} ${argv.join(" ")}`);

  const proc = spawn(javaBin, argv, {
    stdio: ["pipe", "pipe", logStream ? "pipe" : "ignore"],
    cwd: rootPath,
  });

  if (logStream && proc.stderr) {
    proc.stderr.pipe(logStream, { end: false });
  }

  proc.on("exit", code => log.info(`jdtls exited (${code}) for ${rootPath}`));

  const rootUri = fileToUri(rootPath);
  const client = new LspClient(proc);

  await client.initialize(rootUri, runtimes);

  return { proc, client, rootUri };
}

function buildRuntimes(jdks: Array<{ path: string; version: number; name: string }>) {
  const sorted = [...jdks].sort((a, b) => b.version - a.version);
  const defaultJdk = sorted[0];
  return sorted.map(j => ({
    name: j.name,
    path: j.path,
    default: j === defaultJdk || undefined,
  })).filter((r, i, arr) => {
    // Dedupe by name (highest version wins, already sorted)
    return arr.findIndex(x => x.name === r.name) === i;
  });
}
