# claude-java-lsp

Java LSP integration for Claude Code. Gives Claude an automatic feedback loop after every Java edit (compile errors appear instantly, like OpenCode), plus a full set of on-demand navigation tools via MCP.

## How it works

A long-lived **daemon** keeps one Eclipse JDT Language Server (jdtls) process warm per Maven project. Two thin clients talk to it:

- **PostToolUse hook** — fires after every Edit/Write/MultiEdit on a `.java` file, queries jdtls for diagnostics, and injects them into Claude's context so it can self-correct immediately.
- **MCP server** — exposes 8 LSP tools Claude can call on demand (hover, go-to-definition, references, completion, symbols, rename).

## Requirements

- Java 21+ (to run jdtls; your project can target any Java version)
- [Bun](https://bun.sh) (runtime + build tool)
- Maven projects only

## Install

```bash
git clone <this-repo> && cd claude-java-lsp
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
~/.bun/bin/bun install
~/.bun/bin/bun run build
./dist/claude-java-lsp-linux-x64 install
```

`install` will:
1. Verify Java 21+ and `tar` are available
2. Download and cache jdtls 1.58.0 (~90MB, one-time)
3. Register the PostToolUse hook in `~/.claude/settings.json`
4. Register the MCP server in `~/.claude.json`

Then **restart Claude Code** for the hook and MCP to take effect.

## Pre-warm (recommended)

jdtls takes 30–180s to import a Maven project on first run. Warm it before your first edit so that initial diagnostics are instant:

```bash
./dist/claude-java-lsp-linux-x64 warm /path/to/your/maven/project
```

After `warm` returns, every subsequent edit in that project returns real diagnostics in under a second.

## MCP tools

| Tool | What it does |
|---|---|
| `java_diagnostics` | Compiler + type errors/warnings for a file |
| `java_hover` | Javadoc and type signature at a position |
| `java_definition` | Go to definition (cross-module aware) |
| `java_references` | Find all references across the workspace |
| `java_completion` | Code completion suggestions |
| `java_document_symbols` | All symbols in a file (hierarchical) |
| `java_workspace_symbols` | Search symbols across the whole project |
| `java_rename` | Compute rename edits (returns diffs, doesn't apply them) |

All tools accept 0-based line/character positions and absolute `file_path` values. First call after daemon start may return `status: "indexing"` while jdtls imports the project.

## Other commands

```bash
# Check daemon status
./dist/claude-java-lsp-linux-x64 status

# Stop the daemon (it also auto-stops after 30min idle)
./dist/claude-java-lsp-linux-x64 stop

# Force re-download jdtls
./dist/claude-java-lsp-linux-x64 install --force
```

## Multi-machine setup

The daemon, jdtls cache, and workspace data all live under `~/.cache/claude-java-lsp/`. Clone the repo on each machine and run:

```bash
~/.bun/bin/bun install && ~/.bun/bin/bun run build
./dist/claude-java-lsp-linux-x64 install
```

jdtls is downloaded fresh per machine (90MB). The compiled binary is platform-specific (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`); build with `bun run build --all` to produce all four.

## Development

```bash
# Run without building
~/.bun/bin/bun run src/index.ts <command>

# Typecheck
~/.bun/bin/bun run typecheck

# Unit tests
~/.bun/bin/bun test test/unit

# Build compiled binary for current platform
~/.bun/bin/bun run build
```

## Updating jdtls

Edit `JDTLS_VERSION` and `JDTLS_TARBALL` in `src/core/config.ts`, then run `install --force`.

## Environment variables

| Variable | Purpose |
|---|---|
| `JDTLS_JAVA_HOME` | Override the Java 21+ installation used to run jdtls |
| `CLAUDE_JAVA_LSP_ROOT` | Override Maven workspace root detection |
| `CLAUDE_JAVA_LSP_VMARGS` | Extra JVM args for jdtls (e.g. lombok `-javaagent`) |
| `HOOK_HARD_TIMEOUT_MS` | Max ms the hook waits for diagnostics (default 6000) |
| `SETTLE_MS` | Settle window after last diagnostic publish (default 450) |
| `DAEMON_IDLE_MS` | Auto-shutdown after this many ms idle (default 1800000) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` (default `info`) |
