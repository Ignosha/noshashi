/**
 * Public XRPL Testnet fixture for local development and read-only checks.
 *
 * This address is disposable Testnet data. Its secret is intentionally not
 * stored in the repository and must never be used for Mainnet funds.
 */
export const XRPL_TESTNET_FIXTURE_ADDRESS =
  "rweDEvHBhTYQhCGAEqghBt6PZzydxHeUVF";

export const XRPL_TESTNET_EXPLORER_URL =
  `https://testnet.xrpl.org/accounts/${XRPL_TESTNET_FIXTURE_ADDRESS}`;
