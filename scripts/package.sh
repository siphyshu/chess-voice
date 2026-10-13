#!/bin/sh
# Builds the Chrome Web Store upload: only the files the extension needs at runtime.
set -e
cd "$(dirname "$0")/.."

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
OUT="dist/chess-voice-$VERSION.zip"

mkdir -p dist
rm -f "$OUT"
zip -qr "$OUT" \
  manifest.json \
  background.js content.js \
  offscreen.html offscreen.js \
  permission.html permission.js \
  icons vendor \
  -x '*.DS_Store'

echo "$OUT"
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
