#!/usr/bin/env bash
set -euo pipefail

REPO="robert2411/claude-lsp-java"
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
  err "${BIN_NAME} is not installed. Run install.sh first."
fi

# Prefer the binary on PATH, fall back to INSTALL_DIR
if command -v "${BIN_NAME}" &>/dev/null; then
  BIN_PATH="$(command -v "${BIN_NAME}")"
fi

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux)  OS_KEY="linux"  ;;
  Darwin) OS_KEY="darwin" ;;
  *)      err "Unsupported OS: $OS (supported: Linux, macOS)" ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)  ARCH_KEY="x64"   ;;
  arm64|aarch64) ARCH_KEY="arm64" ;;
  *)             err "Unsupported architecture: $ARCH (supported: x86_64, arm64)" ;;
esac

PLATFORM="${OS_KEY}-${ARCH_KEY}"
ARTIFACT="${BIN_NAME}-${PLATFORM}"
URL="https://github.com/${REPO}/releases/latest/download/${ARTIFACT}"

info "Updating ${BIN_NAME} for ${PLATFORM}"
printf "Downloading from %s\n" "$URL"

TMPFILE="$(mktemp)"
trap 'rm -f "${TMPFILE}"' EXIT

if ! curl -fsSL --progress-bar "${URL}" -o "${TMPFILE}"; then
  err "Download failed. Make sure a release exists at https://github.com/${REPO}/releases"
fi

chmod +x "${TMPFILE}"
mv "${TMPFILE}" "${BIN_PATH}"

ok "Updated: ${BIN_PATH}"
printf "\n"
printf "Restart Claude Code for any changes to take effect.\n"
