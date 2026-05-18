# claude-java-lsp

Java LSP integration for Claude Code. Gives Claude an automatic feedback loop after every Java edit (compile errors appear instantly, like OpenCode), plus a full set of on-demand navigation tools via MCP.

## How it works

A long-lived **daemon** keeps one Eclipse JDT Language Server (jdtls) process warm per Maven project. Two thin clients talk to it:

- **PostToolUse hook** — fires after every Edit/Write/MultiEdit on a `.java` file, queries jdtls for diagnostics, and injects them into Claude's context so it can self-correct immediately.
- **MCP server** — exposes 8 LSP tools Claude can call on demand (hover, go-to-definition, references, completion, symbols, rename).

## Requirements

- Java 21+ (to run jdtls; your project can target any Java version)
- Maven projects only

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/robert2411/claude-lsp-java/master/install.sh | bash
```

The script detects your OS and architecture (Linux/macOS, x86-64/ARM64), downloads the right pre-built binary from the [latest release](https://github.com/robert2411/claude-lsp-java/releases/latest) to `~/.local/bin`, and runs `install` automatically. No clone or build step needed.

To install to a different directory:

```bash
INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/robert2411/claude-lsp-java/master/install.sh | bash
```

`install` will:
1. Verify Java 21+ and `tar` are available
2. Download and cache jdtls 1.58.0 (~90MB, one-time)
3. Ask whether to register the PostToolUse hook in `~/.claude/settings.json` (optional)
4. Register the MCP server in `~/.claude.json`

Then **restart Claude Code** for the hook and MCP to take effect.

To skip the hook prompt and never install it:

```bash
claude-java-lsp install --no-hook
```

To add the hook later (after skipping it during install):

```bash
claude-java-lsp install --hook-only
```

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/robert2411/claude-lsp-java/master/uninstall.sh | bash
```

This removes the hook registration, the MCP server, the jdtls cache, and the binary. To uninstall without the curl one-liner:

```bash
claude-java-lsp uninstall --purge   # remove hook + MCP + jdtls cache
rm "$(command -v claude-java-lsp)"  # remove the binary
```

## Update

```bash
curl -fsSL https://raw.githubusercontent.com/robert2411/claude-lsp-java/master/update.sh | bash
```

This downloads the latest binary and replaces the existing one. Your existing configuration (hook, MCP, jdtls) is preserved. Restart Claude Code after updating.

To also force-refresh jdtls after updating the binary:

```bash
claude-java-lsp install --force
```

## Pre-warm (recommended)

jdtls takes 30–180s to import a Maven project on first run. Warm it before your first edit so that initial diagnostics are instant:

```bash
claude-java-lsp warm /path/to/your/maven/project
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
claude-java-lsp status

# Stop the daemon (it also auto-stops after 30min idle)
claude-java-lsp stop

# Force re-download jdtls
claude-java-lsp install --force

# Install only the PostToolUse hook (if you skipped it during install)
claude-java-lsp install --hook-only

# Remove hook and MCP registration (keeps binary + jdtls cache)
claude-java-lsp uninstall

# Remove everything including jdtls cache
claude-java-lsp uninstall --purge
```

## Multi-machine setup

Run the same install command on each machine — the script detects the platform automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/robert2411/claude-lsp-java/master/install.sh | bash
```

The daemon, jdtls cache, and workspace data all live under `~/.cache/claude-java-lsp/`. jdtls is downloaded fresh per machine (~90MB, one-time).

## Development (contributing)

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/robert2411/claude-lsp-java.git && cd claude-lsp-java
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
~/.bun/bin/bun install
```

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
