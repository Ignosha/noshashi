# NOSHASHI Academy on iPhone and iPad

There are two ways to put the Academy on an iPhone or iPad. Both are free.

## 1. Add it to the Home Screen (no Mac needed)

This is the way to give it to learners today.

1. On the iPhone or iPad, open **https://www.noshashi.app/academy/app/** in Safari.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.

The Academy then has its own icon and opens full screen, like an app. It keeps
working offline after the first visit: lessons, read-aloud, checks, the final
check and the certificate. Videos and live lab readings need a connection. The
labs run in the lab workstation, the same real NOSHASHI console as on the
desktop. In Safari the Academy shows a short tip with these steps; it goes away
once the Academy is installed or the tip is dismissed.

## 2. The iOS app, built with Xcode

The same Academy as the desktop app, built as a native iOS app from this
repository. Xcode is free, and installing on your own iPhone or iPad only
needs your Apple ID. An app installed this way with a free Apple ID stops
opening after 7 days; run it from Xcode again to renew it. TestFlight and the
App Store need an Apple Developer account ($99 a year) and are not covered here.

In the iOS app everything is bundled, videos included, so the whole course,
videos too, works with no connection. Certificates are saved to the Files app,
under **On My iPhone › NOSHASHI Academy**.

### One-time setup on your Mac

1. Install **Xcode** from the App Store, open it once, and accept the licence.
2. Install the command line tools and CocoaPods:

   ```bash
   xcode-select --install
   brew install cocoapods      # needs Homebrew: https://brew.sh
   ```

3. Install Rust and the two iOS targets:

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-apple-ios aarch64-apple-ios-sim
   ```

4. Install Node.js 20 or later (https://nodejs.org), then get the code:

   ```bash
   git clone https://github.com/Ignosha/noshashi.git
   cd noshashi
   npm install
   ```

5. Generate the Xcode project and the iOS icons (once):

   ```bash
   npm run academy:tauri ios init
   npm run academy:tauri icon src-tauri/icons/icon.png
   ```

### Try it in the simulator

```bash
npm run academy:tauri ios dev
```

Pick a simulator, for example an iPhone 16 or an iPad.

### Put it on your own iPhone or iPad

1. On the device: **Settings › Privacy & Security › Developer Mode**, turn it
   on and restart when asked. Connect it to the Mac with a cable and tap
   **Trust** if asked.
2. In Xcode: **Xcode › Settings › Accounts**, click **+** and sign in with your
   Apple ID. This creates your free "Personal Team".
3. Open the project in Xcode:

   ```bash
   npm run academy:tauri ios build -- --open
   ```

4. Select the **noshashi-academy_iOS** target, open **Signing & Capabilities**,
   and set **Team** to your Personal Team. If Xcode says the bundle identifier
   `app.noshashi.academy` is taken, change it to one only you use, such as
   `com.yourname.academy`.
5. Choose your device at the top of the window and press **Run** (▶).
6. The first time, the device refuses to open it. Go to **Settings › General ›
   VPN & Device Management**, tap your Apple ID under Developer App, and tap
   **Trust**. Then open NOSHASHI Academy.

## For whoever changes the code

- The native shell is `academy/src-tauri/src/lib.rs`; iOS enters through
  `run()`. Window sizing is desktop only (`#[cfg(desktop)]`). On iOS,
  `open_external` answers with the address to open in Safari (an iOS app
  cannot start another program), and certificates are written to the app's
  Documents folder.
- `academy/src-tauri/tauri.ios.conf.json` is laid over `tauri.conf.json` for
  iOS builds, and `Info.ios.plist` is merged into the app's Info.plist (it
  makes the Documents folder visible in the Files app).
- The website install (route 1) comes from `academy/pwa/` (manifest and
  icons), added by `academy/vite.web.config.mts`, with the offline copy kept
  by `academy/sw.js`.
- The **Academy iOS build** workflow compiles the shell for iPhone and the
  simulator and builds the whole app for the simulator, unsigned, on every
  pull request that touches `academy/`.
