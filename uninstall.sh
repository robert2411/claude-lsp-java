#!/usr/bin/env bash
set -euo pipefail

BIN_NAME="claude-java-lsp"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info() { printf "${BOLD}%s${NC}\n" "$*"; }
ok()   { printf "${GREEN}%s${NC}\n" "$*"; }
err()  { printf "${RED}error: %s${NC}\n" "$*" >&2; exit 1; }

BIN_PATH="${INSTALL_DIR}/${BIN_NAME}"

if ! command -v "${BIN_NAME}" &>/dev/null && [ ! -f "${BIN_PATH}" ]; then
  err "${BIN_NAME} is not installed at ${BIN_PATH}"
fi

# Prefer the binary on PATH, fall back to INSTALL_DIR
if command -v "${BIN_NAME}" &>/dev/null; then
  BIN_PATH="$(command -v "${BIN_NAME}")"
fi

info "Uninstalling ${BIN_NAME}"

# Remove hook and MCP server registration
printf "\n"
"${BIN_PATH}" uninstall --purge

# Remove the binary
if [ -f "${BIN_PATH}" ]; then
  rm -f "${BIN_PATH}"
  ok "Removed binary: ${BIN_PATH}"
fi

printf "\n"
ok "Done! claude-java-lsp has been fully removed."
