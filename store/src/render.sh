#!/bin/sh
# Renders an SVG to a transparent PNG with headless Chrome.
# usage: render.sh <svg> <out.png> <canvas px> <art px>
SVG="$1"; OUT="$2"; SIZE="$3"; ART="$4"; PAD=$(( (SIZE - ART) / 2 ))
TMP="$(mktemp -d)"
cat > "$TMP/p.html" <<HTML
<html><body style="margin:0;background:transparent">
<img src="file://$(cd "$(dirname "$SVG")" && pwd)/$(basename "$SVG")" style="display:block;width:${ART}px;height:${ART}px;margin:${PAD}px">
</body></html>
HTML
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --default-background-color=00000000 --allow-file-access-from-files \
  --window-size=${SIZE},${SIZE} --screenshot="$OUT" "file://$TMP/p.html" >/dev/null 2>&1
rm -rf "$TMP"
