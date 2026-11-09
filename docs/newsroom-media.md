# Ledger Desk visual and video sources

Checked November 9, 2026. This change is local, not a published newsroom edition.

## Photographs

Two real photographs, downloaded from the identified Pexels source pages and served locally as optimized WebP. They show physical display coins with the Ripple symbol, not physical units of XRP. Neither is documentary evidence of a payment, reserve, issuer, customer or NOSHASHI partnership. Photographer credits and original links remain visible beside each image. No identifiable people appear in these photographs.

| Local asset | Photographer | Source |
| --- | --- | --- |
| `site/assets/editorial/xrp-silver.webp` | Rūdolfs Klintsons | https://www.pexels.com/photo/coin-in-grayscale-photography-7293819/ |
| `site/assets/editorial/xrp-gold.webp` | Moose Photos | https://www.pexels.com/photo/photo-of-round-gold-colored-coin-1036638/ |

Source pages identified each photo as Free. Pexels' https://www.pexels.com/license/ permits free use and modification on websites, with optional attribution, and prohibits implied endorsement or use as a trademark. Images are editorial topic illustrations, not NOSHASHI marks or implied endorsements. Combined WebP payload is approximately236KB. No stock-photo subscription, paid generation or image API was provisioned. Authenticated Stripe Directory/CLI was unavailable; source and licence checks used official public pages instead.

## Videos and broadcast links

The curated registry is `scripts/newsroom-media.mjs`. Public YouTube page metadata verified titles, descriptions and publisher-provided embed URLs for:

- Apex 2025: https://www.youtube.com/watch?v=AXN9-m0uXKk — recorded introduction to Ripple's XRPL community summit, not a live broadcast. Event affiliation is also described by https://xrpl.org/community/events.
- 30 Transactions — Sending Payments — Video1: https://www.youtube.com/watch?v=Zdze88QcAq4 — recorded XRPL developer lesson with Florent Uzio. Do not treat historical lesson content as current NOSHASHI claims or authoritative current protocol documentation.

No video was downloaded, rehosted or stripped of its publisher player. No thumbnail or provider iframe loads automatically. A visitor chooses Load video; one `youtube-nocookie.com` iframe is created, with autoplay off and captions requested. This is a third-party connection after choice, not a promise of zero tracking. Close removes the iframe and restores focus. Opening another player removes the first. Direct Watch at source links work without JavaScript and remain visible when embedding is blocked. Cross-origin iframe load does not establish playback, captions, uptime or current broadcast status. No YouTube API key was added.

The scoped CSP override permits only `https://www.youtube-nocookie.com` as a frame source on the exact `/intelligence` route and `/intelligence/(.*)` descendants (including `/intelligence/`); the public site and risk tools retain their previous policies. No external scripts are allowed by the parent page. No private founder data or business-development state is embedded.

Official Ripple and XRPL Commons broadcast-channel links and the XRPL event calendar are shown separately. No currently active XRPL broadcast was verified. There is no LIVE badge, active-viewer figure or invented stream status. Live broadcasting requires a fresh verified video URL and status before inclusion; do not silently relabel a recording. General market television and unrelated space photography were excluded following founder steering. This change does not install a broadcaster-monitoring job or a continuous video news feed.

## Validation

- 96 focused Vitest tests passed across CSP, editorial, globe and site-render suites. Existing Vite configuration warnings remain.
- 15 media browser checks passed, exercising local photo decoding and dimensions, mobile layouts, initial absence of third-party requests, deliberate player loading, fixed iframe URLs, single-player cleanup, keyboard focus, fallback links, no-JS access and scoped CSP. The player is explicitly mocked in those interaction tests; external playback is not certified. Browser artifacts live under `/tmp/noshashi-media-validation/`.
- Initial screenshot review found stretched photo sizing; fixed explicit dimensions and added a regression check. Initial media browser run before that additional check:14 passed; final rerun:15 passed.

No merge, push, deployment, editorial publication, advertising distribution or external outreach occurred in this change.

Production verification caught that the original named wildcard did not apply the iframe permission to `/intelligence/` on Vercel, although the local preview matched it. Replaced it with an explicit root rule and regex descendant rule before final release verification.
