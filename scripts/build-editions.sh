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

# The version and the host architecture both appear in the DMG filename
# Tauri produces. Both were hard-coded — the paths below still said 0.1.0
# and x64 long after package.json reached 0.2.2, so the real DMG was never
# found, every build silently fell through to the hdiutil fallback, and the
# staged artefact was named for a version that no longer existed. Read them
# from the source of truth instead.
VERSION="$(node -p "require('./package.json').version")"
case "$(uname -m)" in
  arm64|aarch64) ARCH="aarch64" ;;
  *)             ARCH="x64" ;;
esac

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
  # wc/awk rather than python3: a release script should not fail to report
  # a size because an interpreter it never otherwise needs is absent.
  local size
  size=$(wc -c < "$dest" | awk '{printf "%.1f MB", $1/1024/1024}')
  echo "  staged  $dest  ($size)"
  echo "  sha256  $(shasum -a 256 "$dest" | cut -d' ' -f1)"
}

if [[ "$WHICH" == "full" || "$WHICH" == "both" ]]; then
  echo "==> FULL edition"
  retire "NOSHASHI_${VERSION}.dmg"
  npm run tauri build || echo "  (tauri reported a bundling error — checking for the .app)"
  stage "src-tauri/target/release/bundle/dmg/NOSHASHI_${VERSION}_${ARCH}.dmg" \
        "NOSHASHI_${VERSION}.dmg" \
        "src-tauri/target/release/bundle/macos/NOSHASHI.app" \
        "NOSHASHI"
fi

if [[ "$WHICH" == "demo" || "$WHICH" == "both" ]]; then
  echo "==> DEMO edition"
  retire "NOSHASHI_Demo_${VERSION}.dmg"
  npm run tauri:demo || echo "  (tauri reported a bundling error — checking for the .app)"
  stage "src-tauri/target/release/bundle/dmg/NOSHASHI Demo_${VERSION}_${ARCH}.dmg" \
        "NOSHASHI_Demo_${VERSION}.dmg" \
        "src-tauri/target/release/bundle/macos/NOSHASHI Demo.app" \
        "NOSHASHI Demo"
fi

echo
echo "==> release/"
ls -lh "$OUT" | tail -n +2 | awk '{printf "    %-34s %s\n", $9, $5}'
