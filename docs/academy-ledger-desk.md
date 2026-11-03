# Academy identity and Ledger Desk styling

The Academy landing page, browser app and native frontend share the graphite
palette, Instrument Serif headings, Inter controls and ruled layouts used by
Ledger Desk. Course settings, progress keys, lessons, questions, labs and
certificate records retain their existing formats.

The Academy's `#root` is a scrolling document, unlike the regular console's
fixed viewport. Keep that override: removing it clips reading settings and
long lessons even when `body` itself permits scrolling.

## App identities

- Regular NOSHASHI: the circular seal from `site/brand/logos/seal.svg`, matching
  the owner's uploaded “5. SEAL” reference. The existing outlined vector keeps
  the lettering precise. Pixels outside the circle are transparent.
- NOSHASHI Academy: an outlined “Noshashi Academy” wordmark and separate circular
  launcher icon. The Academy build overrides the shared public favicon/icon;
  its workstation continues to show the regular NOSHASHI seal.
- Native launcher assets include PNG, ICO and ICNS. Menu-bar template assets
  simplify the seal to an N and ring for small-size contrast. PWA maskable and
  Apple touch icons have an opaque graphite ground as those platforms require.

Regenerate all native icon assets with:

```sh
# Python fontTools and brotli are the same prerequisites as gen-logo-variations.py.
# Playwright Chromium must be installed, or set CHROMIUM_PATH to a local executable.
npm run icons:build
```

The legacy website raster generator delegates launcher generation to the same
script so it cannot restore the former flower tile. Website and BIMI artwork
remain independent of the desktop launcher icons.

## Verification

```sh
npm run build
npm run academy:build
npm run site:academy
npm run site:noshx
npm run check:brand
npm test -- src/lib/academy src/lib/__tests__/brand-mark.test.ts tests/site-render.test.js tests/bimi-logo.test.js tests/csp.test.js

# Run the local preview, which applies production CSP headers:
node scripts/dev-site.mjs
# In a second terminal; screenshots/report default to the system temporary directory:
npm run academy:smoke -- http://localhost:4321
```

The browser smoke check exercises desktop/mobile layouts, keyboard access,
scrolling, local settings persistence, lesson navigation, caption loading and
the embedded workstation. The Academy-only CSP media override permits its
same-origin videos and local caption blobs; script and framing restrictions
remain unchanged. The workstation retains its existing separate framing rule.

Native installers still need the repository's platform build workflows. Source
and icon updates do not modify an already installed app. No new signing,
minimum-OS, release-version or publication claim is made by this design change.
