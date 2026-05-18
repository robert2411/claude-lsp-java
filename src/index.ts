#!/usr/bin/env bun
import { runDaemon } from "./cli/daemon.ts";
import { runHook } from "./cli/hook.ts";
import { runMcp } from "./cli/mcp.ts";
import { runInstall } from "./cli/install.ts";
import { runUninstall } from "./cli/uninstall.ts";
import { runWarm } from "./cli/warm.ts";
import { runStatus } from "./cli/status.ts";
import { runStop } from "./cli/stop.ts";

const [, , cmd, ...rest] = process.argv;

const commands: Record<string, () => Promise<void>> = {
  daemon:    () => runDaemon(),
  hook:      () => runHook(),
  mcp:       () => runMcp(),
  install:   () => runInstall(rest),
  uninstall: () => Promise.resolve(runUninstall(rest)),
  warm:      () => runWarm(rest[0]),
  status:    () => runStatus(),
  stop:      () => runStop(),
};

const handler = commands[cmd ?? ""];
if (!handler) {
  console.error(`claude-java-lsp <command> [args]

Commands:
  daemon       Start the background daemon (manages jdtls processes)
  hook         PostToolUse hook — read stdin, emit diagnostics to Claude
  mcp          Start the MCP stdio server
  install      Bootstrap jdtls and register hook + MCP with Claude Code
                 --no-hook        Skip hook registration
                 --hook-only      Register the hook only (no jdtls download)
  uninstall    Remove hook and MCP server registration
                 --purge          Also delete the jdtls cache (~/.cache/claude-java-lsp)
  warm         Pre-warm jdtls for a Maven project (avoids cold-start on first edit)
  status       Show daemon and jdtls status
  stop         Gracefully stop the daemon
`);
  process.exit(1);
}

try {
  await handler();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
