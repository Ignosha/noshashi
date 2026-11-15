# NOSHASHI Operator for Mac

A separate native AppKit/WKWebView control app for the existing private hosted business-development operator. Targets macOS12.0, including Monterey12.7.6, on Intel and Apple Silicon. It uses bundled local UI and native bounded HTTPS networking. It does not require the Node24 local runner, whose prebuilt macOS distribution requires13.5+.

The hosted service continues scheduled work while this app is closed. This client reads the private pipeline and requests existing bounded source/report/billing operations. It does not add an outreach sender, change approval/suppression state, execute public-source instructions, negotiate terms or promise revenue.

Credentials: the owner enters a separate operator token; Keychain stores it. Stripe credentials remain server-side in Cloudflare. No credentials or pipeline data belong in a source commit or installer. Network paths, origins, methods and setup destinations are fixed in native code; redirects, remote WebView navigation and external scripts are denied.

## Build on a Mac

```sh
bash operator-desktop/build-mac.sh
```

Requires Apple's free Xcode Command Line Tools/Xcode for compilation. The standard public-repository GitHub macOS runner also builds the app through `.github/workflows/operator-desktop.yml`. Builds produce a universal `.app`, DMG, app ZIP, compatibility JSON and SHA256SUMS in `operator-desktop/dist`.

`verify-bundle.py` reads actual Mach-O deployment commands for both slices. `--native-self-test` exercises native request/navigation/credential policies without real secrets or Keychain mutation. UI tests cover the message bridge, response handling, untrusted text and bounded loading. A successful build targeting12.0 does not establish testing on physical12.7.6 hardware.

The free evaluation build is ad hoc signed only. It is not Developer ID signed or notarized; `INSTALL.md` explains Monterey's per-app Open workflow. No paid Apple credentials or new signing subscription is provisioned. This app has no auto-updater and does not replace the main NOSHASHI desktop app.
