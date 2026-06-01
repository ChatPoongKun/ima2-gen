#!/usr/bin/env bash
# ima2-gen one-click install (macOS)
#
# Usage:
#   curl -fsSL https://lidge-jun.github.io/ima2-gen/install-mac.sh | bash
#   or
#   bash install-mac.sh
#
# Steps:
#   1. Detect Node.js (nvm → fnm → brew → direct nvm install)
#   2. Verify Node >= 20
#   3. Kill stale ima2/node processes that hold file locks
#   4. Install ima2-gen globally
#   5. Launch ima2 serve

set -euo pipefail

MIN_NODE=20

print() { printf '\033[1;36m▸\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m✔\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m⚠\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

node_major() {
  node --version 2>/dev/null | sed 's/v\([0-9]*\).*/\1/'
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
}

# ── 1. Find or install Node.js ──────────────────────────────────────

if command -v node >/dev/null 2>&1; then
  print "Node.js detected: $(node --version)"
else
  warn "Node.js not found. Searching for version managers…"

  # Try nvm
  load_nvm
  if command -v nvm >/dev/null 2>&1; then
    print "nvm detected. Installing Node LTS…"
    nvm install --lts
    nvm use --lts
  # Try fnm
  elif command -v fnm >/dev/null 2>&1; then
    print "fnm detected. Installing Node LTS…"
    fnm install --lts
    eval "$(fnm env)"
  # Try Homebrew
  elif command -v brew >/dev/null 2>&1; then
    print "Installing Node.js via Homebrew…"
    brew install node
  # Last resort: install nvm
  else
    print "No package manager found. Installing nvm…"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    load_nvm
    nvm install --lts
    nvm use --lts
  fi
fi

# ── 2. Version gate ─────────────────────────────────────────────────

MAJOR="$(node_major)"
if [ -z "$MAJOR" ]; then
  fail "node is not on PATH after install. Open a new terminal and re-run this script."
fi
if [ "$MAJOR" -lt "$MIN_NODE" ]; then
  fail "Node $MAJOR is too old. ima2-gen requires Node >= $MIN_NODE. Run: nvm install --lts"
fi
ok "Node $(node --version), npm $(npm --version)"

# ── 3. Kill stale processes ─────────────────────────────────────────

if pgrep -f "ima2.*(serve|server)" >/dev/null 2>&1; then
  warn "Stopping stale ima2 processes…"
  pkill -f "ima2.*(serve|server)" 2>/dev/null || true
  sleep 1
fi

# ── 4. Install ima2-gen ─────────────────────────────────────────────

print "Installing ima2-gen globally…"
if npm install -g ima2-gen; then
  ok "ima2-gen $(ima2 --version 2>/dev/null || echo 'installed')"
else
  warn "Permission denied. Retrying with sudo…"
  sudo npm install -g ima2-gen || fail "Install failed. Check npm permissions or set a user prefix: npm config set prefix ~/.npm-global"
fi

# ── 5. Launch ────────────────────────────────────────────────────────

print "Starting image studio (Ctrl+C to stop)…"
print "If the browser doesn't open, visit http://localhost:3333"
echo
exec ima2 serve
