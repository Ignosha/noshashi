# Running NOSHASHI on iPhone and iPad

The desktop app also builds for iOS. Everything below is free: Xcode is
free, and putting the app on your own iPhone only needs your Apple ID. The
one limit of a free Apple ID is that an app installed this way stops opening
after 7 days. When that happens, run it from Xcode again.

TestFlight and the App Store need an Apple Developer account ($99 a year)
and are not covered here.

## What works on iOS, and what does not

Works: every screen, live XRPL mainnet data, the gate, receipts, sign-in,
saved settings, and keys stored in the iOS keychain.

Not on iOS, by design:
- the menu bar tray, the HUD panel and the global shortcut (iOS has no menu bar);
- launch at login;
- in-place updates (iOS apps are updated by reinstalling, or by TestFlight);
- the local AI model (Ollama and LM Studio do not run on a phone). A remote
  provider with your own API key still works.

Not yet on iOS:
- opening links in Safari, which includes checkout and the billing portal:
  those buttons do nothing on iOS yet. Buy or manage a plan from the desktop
  app or the website, and the iOS app picks it up when you sign in.
- a phone-sized layout. The screens are laid out for a desktop window, so an
  iPad is the comfortable size for now; on an iPhone they are cramped.

## One-time setup on your Mac

1. Install **Xcode** from the App Store, open it once, and accept the licence.
2. In Terminal, install the command line tools and CocoaPods:

   ```bash
   xcode-select --install
   brew install cocoapods      # needs Homebrew: https://brew.sh
   ```

3. Install Rust, and add the two iOS targets:

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

5. Generate the Xcode project (once):

   ```bash
   npm run tauri ios init
   ```

## Try it in the iPhone simulator

```bash
npm run tauri ios dev
```

Pick a simulator from the list, for example an iPad or iPhone 16. The app
builds and opens in it, and edits to the code reload live.

## Put it on your own iPhone or iPad

1. On the phone: **Settings › Privacy & Security › Developer Mode**, turn it
   on and restart when asked. Connect the phone to the Mac with a cable and
   tap **Trust** if it asks.
2. In Xcode: **Xcode › Settings › Accounts**, click **+** and sign in with
   your Apple ID. This creates your free "Personal Team".
3. Open the project in Xcode:

   ```bash
   npm run tauri ios build -- --open
   ```

4. In Xcode, select the **noshashi_iOS** target, open **Signing &
   Capabilities**, and set **Team** to your Personal Team. If Xcode says the
   bundle identifier is taken, change it to something only you use, such as
   `com.yourname.noshashi`.
5. Choose your phone as the run destination at the top of the window and
   press **Run** (▶).
6. The first time, the phone refuses to open it. Go to **Settings › General
   › VPN & Device Management**, tap your Apple ID under Developer App, and
   tap **Trust**. Then open NOSHASHI.

After 7 days, repeat step 5.

## For whoever changes the code

- The app lives in `src-tauri/src/lib.rs`. `main.rs` is only the desktop
  entry point, and iOS enters through `run()`.
- Anything that only exists on the desktop is behind `#[cfg(desktop)]`. The
  commands the web view calls keep the same names on iOS, in the `mobile`
  module, and answer that the feature is not available.
- `src-tauri/tauri.ios.conf.json` is laid over `tauri.conf.json` for iOS
  builds: one window, no tray, no updater.
- `src-tauri/capabilities/mobile.json` holds the iOS permissions. The
  desktop ones in `default.json` apply to macOS, Windows and Linux only.
- The **iOS build check** workflow compiles the app for iPhone and the
  simulator on every pull request that touches `src-tauri`.
