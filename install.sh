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

info "Installing ${BIN_NAME} for ${PLATFORM}"
printf "Downloading from %s\n" "$URL"

mkdir -p "${INSTALL_DIR}"

TMPFILE="$(mktemp)"
trap 'rm -f "${TMPFILE}"' EXIT

if ! curl -fsSL --progress-bar "${URL}" -o "${TMPFILE}"; then
  err "Download failed. Make sure a release exists at https://github.com/${REPO}/releases"
fi

chmod +x "${TMPFILE}"
mv "${TMPFILE}" "${INSTALL_DIR}/${BIN_NAME}"

ok "Installed to ${INSTALL_DIR}/${BIN_NAME}"

# Advise if not on PATH
if ! command -v "${BIN_NAME}" &>/dev/null; then
  printf "\n"
  printf "  ${BOLD}${INSTALL_DIR}${NC} is not in your PATH.\n"
  printf "  Add it to your shell profile:\n\n"

  if [ "$(basename "${SHELL:-bash}")" = "zsh" ]; then
    PROFILE="${HOME}/.zshrc"
  else
    PROFILE="${HOME}/.bashrc"
  fi

  printf '    echo '"'"'export PATH="$HOME/.local/bin:$PATH"'"'"' >> %s\n' "${PROFILE}"
  printf "    source %s\n\n" "${PROFILE}"
fi

# Run the tool's own install (downloads jdtls, registers hook + MCP)
printf "\n"
info "Running: ${BIN_NAME} install"
"${INSTALL_DIR}/${BIN_NAME}" install
