import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
import { CLAUDE_SETTINGS } from "../core/paths.ts";
import { bootstrapJdtls } from "../jdtls/bootstrap.ts";
import { findRunnerJdk, findAllJdks } from "../jdtls/jdk.ts";
import { selfCommand } from "../util/self.ts";

async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  if (!process.stdin.isTTY) return defaultYes;
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} ${hint} `, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === "" ? defaultYes : a === "y" || a === "yes");
    });
  });
}

export async function runInstall(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const scope = args.includes("--scope") ? args[args.indexOf("--scope") + 1] : "user";
  const hookOnly = args.includes("--hook-only");
  const noHook = args.includes("--no-hook");

  const self = selfCommand();

  if (hookOnly) {
    console.log("=== claude-java-lsp install --hook-only ===\n");
    registerHook(self);
    console.log("\n✓ Hook registered!\n");
    console.log("Restart Claude Code for the hook to take effect.");
    return;
  }

  // 1. Preflight: verify tar, detect runner JDK
  console.log("=== claude-java-lsp install ===\n");
  checkTar();

  let runnerJdk: string;
  try {
    runnerJdk = findRunnerJdk();
    console.log(`✓ Runner JDK (≥21): ${runnerJdk}`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const allJdks = findAllJdks();
  if (allJdks.length > 0) {
    console.log(`✓ Project runtimes found: ${allJdks.map(j => j.name).join(", ")}`);
  }

  // 2. Bootstrap jdtls
  console.log("\nBootstrapping jdtls…");
  try {
    const layout = await bootstrapJdtls(force);
    console.log(`✓ jdtls launcher: ${layout.launcherJar}`);
    console.log(`✓ jdtls config:   ${layout.configDir}`);
  } catch (err) {
    console.error(`✗ jdtls bootstrap failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 3. Resolve our command (handles compiled binary vs dev mode)
  console.log(`\n✓ Binary: ${self}`);

  // 4. Optionally register PostToolUse hook in ~/.claude/settings.json
  const installHook = await resolveHookInstall(noHook);

  if (installHook) {
    registerHook(self);
  } else {
    console.log("  Hook skipped. Run `claude-java-lsp install --hook-only` later to add it.");
  }

  // 5. Register MCP server
  registerMcp(self, scope);

  // 6. Warm: try warming the current project if it's a Maven project
  const cwd = process.cwd();
  if (existsSync(`${cwd}/pom.xml`)) {
    console.log(`\nWarm-starting jdtls for ${cwd}…`);
    console.log(`Run: ${self} warm "${cwd}"`);
    console.log("(Or run it now in a separate terminal to pre-warm before your first edit.)");
  } else {
    console.log(`\nTo pre-warm jdtls (avoids cold-start on first edit), run:`);
    console.log(`  ${self} warm /path/to/your/maven/project`);
  }

  console.log("\n✓ Installation complete!\n");
  const needsRestart = installHook ? "hook and MCP server" : "MCP server";
  console.log(`Restart Claude Code for the ${needsRestart} to take effect.`);
}


async function resolveHookInstall(noHook: boolean): Promise<boolean> {
  if (noHook) return false;
  console.log("\nThe PostToolUse hook fires after every Java edit and injects diagnostics");
  console.log("into Claude's context so it can self-correct immediately.");
  return promptYesNo("Install the PostToolUse hook?", true);
}

function checkTar(): void {
  try {
    execSync("tar --version", { stdio: "pipe" });
    console.log("✓ tar: available");
  } catch {
    console.error("✗ 'tar' not found. Install it before continuing.");
    process.exit(1);
  }
}

function registerHook(binaryPath: string): void {
  const hookEntry = {
    matcher: "Edit|Write|MultiEdit",
    hooks: [{ type: "command", command: `${binaryPath} hook`, timeout: 15 }],
  };

  mkdirSync(dirname(CLAUDE_SETTINGS), { recursive: true });

  let settings: Record<string, unknown> = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try { settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8")); } catch {}
  }

  const hooks = (settings.hooks as Record<string, unknown[]> | undefined) ?? {};
  const ptu: typeof hookEntry[] = (hooks.PostToolUse as typeof hookEntry[] | undefined) ?? [];

  // Remove all previous claude-java-lsp hook entries (any command ending in " hook")
  // and insert the current one — ensures only one entry regardless of binary path changes.
  const matcher = hookEntry.matcher;
  const isOurs = (e: { matcher: string; hooks?: Array<{ command?: string }> }) =>
    e.matcher === matcher && e.hooks?.some(h => h.command?.endsWith(" hook") &&
      (h.command.includes("claude-java-lsp") || h.command.includes("index.ts")));

  const filtered = ptu.filter(e => !isOurs(e));
  filtered.push(hookEntry);

  hooks.PostToolUse = filtered;
  settings.hooks = hooks;

  // Atomic write
  const tmp = CLAUDE_SETTINGS + ".tmp";
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
  renameSync(tmp, CLAUDE_SETTINGS);

  console.log(`✓ Hook registered in ${CLAUDE_SETTINGS}`);
}

function registerMcp(binaryPath: string, scope: string): void {
  try {
    execSync(
      `claude mcp add --scope ${scope} --transport stdio java-lsp -- "${binaryPath}" mcp`,
      { stdio: "pipe" },
    );
    console.log(`✓ MCP server registered (scope: ${scope})`);
  } catch {
    // Fallback: write to ~/.claude.json
    console.log("  (claude CLI not found, writing MCP config directly)");
    const claudeJson = `${process.env.HOME}/.claude.json`;
    let config: Record<string, unknown> = {};
    if (existsSync(claudeJson)) {
      try { config = JSON.parse(readFileSync(claudeJson, "utf8")); } catch {}
    }
    const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
    servers["java-lsp"] = { command: binaryPath, args: ["mcp"] };
    config.mcpServers = servers;
    writeFileSync(claudeJson, JSON.stringify(config, null, 2) + "\n");
    console.log(`✓ MCP server written to ${claudeJson}`);
  }
}
