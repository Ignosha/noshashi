#!/usr/bin/env bash
#
# Build both NOSHASHI editions and stage each artefact as it is produced.
#
# Tauri cleans src-tauri/target/release/bundle/ before every bundle, so the
# second build deletes the first one's DMG. Building them back to back and
# collecting at the end silently loses whichever finished first — which is
# exactly what happened the first time. Each artefact is therefore copied
# out immediately after its own build, before the next one starts.
#
#   ./scripts/build-editions.sh          both
#   ./scripts/build-editions.sh full     only the real product
#   ./scripts/build-editions.sh demo     only the public early release
#
# Output lands in ./release/ — full and demo side by side, never
# overwriting each other.

set -euo pipefail
cd "$(dirname "$0")/.."

OUT="release"
mkdir -p "$OUT"
WHICH="${1:-both}"

# Remove the previous artefact BEFORE building. Otherwise a failed build
# leaves the old file sitting in release/ looking current — which is worse
# than an empty directory, because nothing tells you it is stale.
retire() { rm -f "$OUT/$1"; }

# Tauri's DMG step shells out to Finder via AppleScript and fails in any
# non-interactive or permission-restricted session. The .app is fine when
# this happens, so fall back to hdiutil rather than losing the build.
package_dmg() {     # package_dmg <app-path> <volume-name> <destination>
  local app="$1" vol="$2" dest="$3"
  local staging; staging="$(mktemp -d)"
  cp -R "$app" "$staging/"
  ln -s /Applications "$staging/Applications"
  hdiutil create -volname "$vol" -srcfolder "$staging" -ov -format UDZO "$dest" >/dev/null
  rm -rf "$staging"
}

stage() {           # stage <source-dmg> <destination-name> [app-path] [volume]
  local src="$1" dest="$OUT/$2" app="${3:-}" vol="${4:-}"
  if [[ ! -f "$src" && -n "$app" && -d "$app" ]]; then
    echo "  Tauri did not produce a DMG — packaging with hdiutil instead"
    package_dmg "$app" "$vol" "$dest"
  elif [[ ! -f "$src" ]]; then
    echo "  FAILED: no DMG at $src and no .app to fall back on" >&2
    return 1
  else
    cp "$src" "$dest"
  fi
  if [[ ! -f "$dest" ]]; then
    echo "  FAILED: $dest was not produced" >&2
    return 1
  fi
  local size
  size=$(python3 -c "import os;print(f'{os.path.getsize(\"$dest\")/1024/1024:.1f} MB')")
  echo "  staged  $dest  ($size)"
  echo "  sha256  $(shasum -a 256 "$dest" | cut -d' ' -f1)"
}

if [[ "$WHICH" == "full" || "$WHICH" == "both" ]]; then
  echo "==> FULL edition"
  retire "NOSHASHI_0.1.0.dmg"
  npm run tauri build || echo "  (tauri reported a bundling error — checking for the .app)"
  stage "src-tauri/target/release/bundle/dmg/NOSHASHI_0.1.0_x64.dmg" \
        "NOSHASHI_0.1.0.dmg" \
        "src-tauri/target/release/bundle/macos/NOSHASHI.app" \
        "NOSHASHI"
fi

if [[ "$WHICH" == "demo" || "$WHICH" == "both" ]]; then
  echo "==> DEMO edition"
  retire "NOSHASHI_Demo_0.1.0.dmg"
  npm run tauri:demo || echo "  (tauri reported a bundling error — checking for the .app)"
  stage "src-tauri/target/release/bundle/dmg/NOSHASHI Demo_0.1.0_x64.dmg" \
        "NOSHASHI_Demo_0.1.0.dmg" \
        "src-tauri/target/release/bundle/macos/NOSHASHI Demo.app" \
        "NOSHASHI Demo"
fi

echo
echo "==> release/"
ls -lh "$OUT" | tail -n +2 | awk '{printf "    %-34s %s\n", $9, $5}'
