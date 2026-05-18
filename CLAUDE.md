# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires [Bun](https://bun.sh). Use `~/.bun/bin/bun` if `bun` is not on PATH.

```bash
# Run from source (no build step)
bun run src/index.ts <command>

# Typecheck
bun run typecheck

# Unit tests
bun test test/unit

# Run a single test file
bun test test/unit/hook.test.ts

# Unit tests with lcov coverage
bun run test:coverage

# Build compiled binary for current platform
bun run build

# Build all platform binaries (linux-x64, linux-arm64, darwin-x64, darwin-arm64)
bun run build -- --all
```

## jdtls version

To upgrade: edit `JDTLS_VERSION` and `JDTLS_TARBALL` in `src/core/config.ts`, then run `claude-java-lsp install --force`.

## When your work is done

1. Run `/simplify` to review changed code for quality issues.
2. Use the SonarQube MCP tools to check for any new Sonar issues introduced by your changes.
3. Run `/security-review` to check for security vulnerabilities.
4. Commit, push to a new branch, and open a PR with `gh pr create`.

## Testing

Unit tests live in `test/unit/`. There is an e2e fixture Maven project at `test/e2e/fixture-maven/` (multi-module: `core` + `app`), used for manual/integration testing — it is not wired to the Bun test runner.

Coverage is reported as lcov (`coverage/lcov.info`) and analyzed by SonarCloud (see `sonar-project.properties`). Entry-point and CLI wiring files are excluded from coverage requirements.
