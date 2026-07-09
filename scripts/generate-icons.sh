#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ICONS_DIR="$ROOT_DIR/icons"
MASTER_SVG="$ICONS_DIR/icon-master.svg"
MASTER_PNG="$ICONS_DIR/icon1024.png"

trap 'rm -f "$MASTER_PNG"' EXIT

sips -s format png "$MASTER_SVG" --out "$MASTER_PNG" >/dev/null

sips -z 128 128 "$MASTER_PNG" --out "$ICONS_DIR/icon128.png" >/dev/null
sips -z 48 48 "$MASTER_PNG" --out "$ICONS_DIR/icon48.png" >/dev/null
sips -z 32 32 "$MASTER_PNG" --out "$ICONS_DIR/icon32.png" >/dev/null
sips -z 16 16 "$MASTER_PNG" --out "$ICONS_DIR/icon16.png" >/dev/null