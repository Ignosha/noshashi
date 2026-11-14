NOSHASHI Operator 0.1.0 beta — macOS Monterey 12.7.6 and later

This app is a native desktop control desk for your existing hosted NOSHASHI bot. The universal binary includes Intel and Apple Silicon builds. No Node, Python, npm, Docker, paid AI subscription or browser extension is needed to RUN the app. It needs internet access to read the hosted bot. Scheduled research runs on Cloudflare even while the app is closed; this installer does not install a local research daemon.

1. Download the DMG, open it, and drag NOSHASHI Operator into Applications. You can alternatively extract the app ZIP and move the app to Applications.
2. This evaluation build is ad hoc signed and NOT Apple Developer ID signed or notarized. On Monterey, control-click the app and choose Open, then confirm Open if macOS offers it. If needed, use System Preferences > Security & Privacy > General > Open Anyway after reviewing the source/build evidence. A published SHA-256 checks changed bytes against the reference; it does not authenticate a publisher. Do not disable Gatekeeper globally.
3. Open the app and enter the operator admin token from your PRIVATE-ACCESS.md file. It is a separate credential from your Stripe key. The app verifies the connection and stores only the operator token in this Mac's Keychain. Disconnect removes that saved token and clears the app view.
4. Choose Refresh status to inspect the research queue, dated evidence, source health and founder report. Check one source and owner report buttons call the same bounded hosted operations; they do not send prospect messages.
5. For Stripe, open Secure Stripe setup in the app. Generate a restricted read-only key in the selected ignosha live account and save it DIRECTLY as STRIPE_READ_ONLY_KEY in the hosted Worker's Cloudflare secrets. Then choose Refresh Stripe reading. Never put the Stripe key into this desktop app, source code or chat.

The installer contains no private admin token, Stripe API key, contact pipeline export, model API key or analytics tracker. Local UI files are bundled. Native networking is limited to the fixed NOSHASHI operator service. Stripe readings are scoped to the entire ignosha account and become stale after 24 hours. Unknown data is not a pass, and revenue is never guaranteed.

Compatibility: the build targets macOS12.0 and verifies both binary slices and bundled minimum OS. Automated build and smoke checks run on a newer macOS runner. Actual operation on a physical Mac running12.7.6 must still be confirmed; report any launch or Keychain error without including credentials.
