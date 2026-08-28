#!/usr/bin/env bash
# Package the built .app into a DMG.
#
# Tauri's bundle_dmg.sh drives Finder over AppleScript to lay out the
# window, which fails on any machine where automation permission is not
# granted (CI, a locked-down Mac, this one). hdiutil needs no such
# permission and produces a DMG that installs identically.
set -euo pipefail

BUNDLE="src-tauri/target/release/bundle"
APP="$BUNDLE/macos/NOSHASHI.app"
OUT="$BUNDLE/dmg/NOSHASHI_0.1.0_x64.dmg"

[ -d "$APP" ] || { echo "No .app found. Run: npm run tauri:build" >&2; exit 1; }

hdiutil detach /Volumes/NOSHASHI >/dev/null 2>&1 || true
rm -f "$OUT" "$BUNDLE"/macos/rw.*.dmg
mkdir -p "$BUNDLE/dmg"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

hdiutil create -volname "NOSHASHI" -srcfolder "$STAGE" -ov -format UDZO "$OUT" >/dev/null
hdiutil verify "$OUT" >/dev/null
echo "Packaged: $OUT"
ls -lh "$OUT"
