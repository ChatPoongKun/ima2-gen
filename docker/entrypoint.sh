#!/bin/sh
set -eu

mkdir -p "$IMA2_CONFIG_DIR" "$CODEX_HOME" "$IMA2_GENERATED_DIR" "$IMA2_TRASH_DIR"

CONFIG_FILE="$IMA2_CONFIG_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'JSON'
{
  "provider": "oauth",
  "server": {
    "host": "0.0.0.0",
    "allowExternalAccess": true
  },
  "oauth": {
    "disableAutoStart": false
  }
}
JSON
fi

exec "$@"

