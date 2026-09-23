# Wallet Overhaul Task List

## Goals
Network-aware wallet connections, disconnect + toggle, and integrated built-in ETH/Solana wallets.

## Steps
- [x] 1. Server: add `wallets` DB table + built-in wallet endpoints (/api/builtin-wallet create/import/list/delete)
- [x] 2. Frontend wallet.js: network-aware connect modal (ETH -> MetaMask + built-in ETH; SOL -> Phantom + built-in SOL)
- [x] 3. Frontend wallet.js: built-in wallet create/import UI + select built-in wallet
- [x] 4. Frontend wallet.js: DISCONNECT button + wallet switcher (toggle between MetaMask/Phantom/built-in)
- [x] 5. Wire built-in wallet into trade/create signing flow (replace user address) — via shared requireWallet()/userKey
- [x] 6. Syntax check all modified files
- [x] 7. Build the app for `npm run desktop`
