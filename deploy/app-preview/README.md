# App preview

A Vercel project pointed at this folder builds the desktop app's web
build (`npm run build`, output `dist/`) instead of the public website,
which the root `vercel.json` builds. It exists so the app can be opened
in a browser for review.

Project settings: Root Directory `deploy/app-preview`, with "Include
source files outside of the Root Directory" on.

In a browser the app reads the live XRP Ledger as the desktop app does.
Desktop-only features (the OS keychain for API keys, the Rust model
proxy, the menu bar HUD) are not available there.
