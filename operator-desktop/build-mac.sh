#!/bin/bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo 'This build requires macOS with Apple Command Line Tools or Xcode.' >&2
  exit 1
fi
TASK_ROOT="$(cd "$(dirname "$0")" && pwd)"
TASK_DIST="$TASK_ROOT/dist"
TASK_APP="$TASK_DIST/NOSHASHI Operator.app"
TASK_SDK="$(xcrun --sdk macosx --show-sdk-path)"
TASK_REPO="$(cd "$TASK_ROOT/.." && pwd)"

mkdir -p "$TASK_DIST" "$TASK_DIST/objects"
if [ -e "$TASK_APP" ]; then
  echo 'App output already exists; use a clean dist directory for a new build.' >&2
  exit 1
fi
mkdir -p "$TASK_APP/Contents/MacOS" "$TASK_APP/Contents/Resources"
cp "$TASK_ROOT/Info.plist" "$TASK_APP/Contents/Info.plist"
cp "$TASK_ROOT/ui/index.html" "$TASK_ROOT/ui/style.css" "$TASK_ROOT/ui/app.js" "$TASK_ROOT/SETUP.html" "$TASK_APP/Contents/Resources/"
if [ -f "$TASK_ROOT/assets/AppIcon.icns" ]; then
  cp "$TASK_ROOT/assets/AppIcon.icns" "$TASK_APP/Contents/Resources/AppIcon.icns"
elif [ -f "$TASK_REPO/src-tauri/icons/icon.icns" ]; then
  cp "$TASK_REPO/src-tauri/icons/icon.icns" "$TASK_APP/Contents/Resources/AppIcon.icns"
else
  echo 'Missing NOSHASHI app icon.' >&2
  exit 1
fi

for TASK_ARCH in arm64 x86_64; do
  xcrun swiftc -swift-version 5 -parse-as-library -O \
    -sdk "$TASK_SDK" -target "$TASK_ARCH-apple-macos12.0" \
    -framework AppKit -framework WebKit -framework Security \
    "$TASK_ROOT/Sources/OperatorApp.swift" "$TASK_ROOT/Tests/NativeSmoke.swift" \
    -o "$TASK_DIST/objects/NOSHASHIOperator-$TASK_ARCH"
done
xcrun lipo -create "$TASK_DIST/objects/NOSHASHIOperator-arm64" "$TASK_DIST/objects/NOSHASHIOperator-x86_64" \
  -output "$TASK_APP/Contents/MacOS/NOSHASHIOperator"
chmod 755 "$TASK_APP/Contents/MacOS/NOSHASHIOperator"
# Ad hoc signing makes the bundle internally consistent. It does not verify a publisher or notarize the app.
codesign --force --sign - --timestamp=none --options runtime --identifier com.noshashi.operator "$TASK_APP"
codesign --verify --deep --strict --verbose=2 "$TASK_APP"
"$TASK_APP/Contents/MacOS/NOSHASHIOperator" --native-self-test
python3 "$TASK_ROOT/verify-bundle.py" "$TASK_APP" > "$TASK_DIST/compatibility.json"

TASK_STAGE="$TASK_DIST/dmg-staging"
mkdir -p "$TASK_STAGE"
ditto "$TASK_APP" "$TASK_STAGE/NOSHASHI Operator.app"
ln -s /Applications "$TASK_STAGE/Applications"
cp "$TASK_ROOT/INSTALL.md" "$TASK_STAGE/Read before opening.txt"
hdiutil create -volname 'NOSHASHI Operator' -srcfolder "$TASK_STAGE" -format UDZO -ov \
  "$TASK_DIST/NOSHASHI-Operator-0.1.0-macOS12-universal.dmg"
ditto -c -k --sequesterRsrc --keepParent "$TASK_APP" "$TASK_DIST/NOSHASHI-Operator-0.1.0-macOS12-universal.zip"
(
  cd "$TASK_DIST"
  shasum -a 256 NOSHASHI-Operator-0.1.0-macOS12-universal.dmg NOSHASHI-Operator-0.1.0-macOS12-universal.zip > SHA256SUMS.txt
)
echo 'Built universal macOS 12+ app, DMG, ZIP, compatibility evidence and SHA-256 checksums.'
