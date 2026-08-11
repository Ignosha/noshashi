# IGNOSHASHI — Full Upgrade Task List

## Phase 0: Package as Desktop App (Electron)
- [x] 0.1 Electron main process (`main.js`) starts internal server + desktop window + tray
- [x] 0.2 `package.json` scripts (`electron`, `desktop`, `dist:*`) + electron-builder config
- [x] 0.3 npm install (electron + electron-builder installed)

## Phase 1: Critical Bug Fixes
- [x] 1. Fix "r is not defined" crash in `public/js/trade.js` (hoist `r` out of if/else)
- [x] 2. Fix Launchpad TRADE button — `selectToken()` must navigate to trade page + load chart

## Phase 2: Real ETH/SOL On-Chain Transactions
- [x] 3. Add RPC/config for Ethereum + Solana (`.env`-driven, with testnet fallback)
- [x] 4. Server: real ETH token deploy via ethers (MemeCoin.sol) + 2% fee to platform wallet
- [x] 5. Server: real SOL token create via @solana/web3.js SPL Token + 2% fee
- [x] 6. Server: real ETH buy/sell via ethers (sign with built-in wallet key)
- [x] 7. Server: real SOL buy/sell via @solana/web3.js
- [x] 8. Frontend: show on-chain tx hash + explorer links after trades
- [x] 9. Verify real transactions broadcast (testnet) and fees collected

## Phase 3: Community Social Platform (Discord + TikTok)
- [x] 10. Server: `community` tables (users, channels, messages, videos, likes, comments, views)
- [x] 11. Server: REST + WS endpoints for chat channels & real-time messaging
- [x] 12. Server: TikTok-style video upload (stored server-side, streamed) + engagement algorithm ranking
- [x] 13. Frontend: new "COMMUNITY" page — Discord-style channel chat panel
- [x] 14. Frontend: TikTok-style vertical video feed (swipe, likes, comments, views)
- [x] 15. Frontend: user profiles & presence

## Phase 4: Visual Polish
- [x] 16. Premium "holographic" dark theme + gradients + animated stat counters
- [x] 17. Polished launch/trade experience for customers

## Phase 5: Build & Verify
- [x] 18. Syntax-check all modified files
- [ ] 19. Rebuild packaged desktop app (`npm run dist:mac`)
- [ ] 20. Launch & verify end-to-end
