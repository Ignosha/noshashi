# IGNOSHASHI UPGRADE PLAN — axiom.trade-class terminal in Star Wars pixel theme

Goal: Transform Ignoshashi into a pro-grade meme-coin trading terminal that
surpasses pump.fun + axiom.trade — with advanced charts, analytics, real-data
adapters, a bot-developer API portal, and wallet-native token creation.

## Phases
- [ ] Phase 1 — Rock-solid wallet connect-back (server session + poll/adopt)
- [ ] Phase 2 — Pro candlestick engine (timeframes, drawing tools, indicators, orderbook)
- [ ] Phase 3 — Real-data adapter (Solana + Ethereum) feeding charts/tokens
- [ ] Phase 4 — Custom Public API developer portal for trade bots + API keys + WebSocket feed
- [ ] Phase 5 — Wallet-native token creation (creator = real wallet address)
- [ ] Phase 6 — Extra innovations to surpass pump.fun/axiom (launchpad, copy-trade, alerts, portfolio)

## Breaking down each phase
### Phase 1 — Wallet session
- New `wallets` table keyed by pair token; `/api/wallet-session` to GET current
- `/api/wallet-bridge` upserts session + broadcasts
- `/api/wallet-disconnect` clears session
- Desktop app adopts session on boot, on WS reconnect, and polls every 5s

### Phase 2 — Charts & analysis
- `public/js/charts.js` rewrite: timeframe selector, pixel candlesticks, crosshair
- `public/js/drawtools.js` (new): trendline, horizontal line, fib retracement, rect, text
- `public/js/indicators.js` (new): SMA, EMA, RSI, MACD, BB, volume profile
- `public/js/orderbook.js` (new): depth viz on trade page
- Backend `/api/ohlc`, `/api/orderbook`, `/api/indicators`, `/api/analysis`

### Phase 3 — Real data adapter
- Placeholder live adapters for Binance/PumpPortal/Jupiter/Moralis/Kucoin
  (public GET endpoints, no key required) feeding candles for real tokens
- Clearly-labeled "LIVE ORACLE" vs simulation; both always shown

### Phase 4 — API developer portal
- `/api/docs` pixel UI documenting all endpoints + auth (X-API-Key)
- New `api_keys` table; `/api/keys` to create/list/revoke
- WebSocket feed: `/ws?api_key=` for live trades/candles
- Middleware requires key for bot-facing endpoints
- Copy buttons + curl/JS/Python snippets

### Phase 5 — Wallet-native creation
- Create requires connected real wallet (creator=address, no 'anon')
- Show on-chain contract preview; record creator address + tx reference

### Phase 6 — Extra innovations
- Launchpad (featured tokens, gradient to DEX)
- Copy-trade (follow a wallet replayed into your trades)
- Price/graduation alerts (sound + toast)
- Portfolio (your held tokens, PnL) — derived from trades of the connected wallet
- Merge/auto-market-cap news scanner (optional external feeds)

This file is the working checklist. Each box is ticked as the phase ships.

