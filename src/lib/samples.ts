import type { SceneId } from "@/App";
import { LAB_SUBJECTS } from "@/lib/learn/labs";
import { XRPL_TESTNET_FIXTURE_ADDRESS } from "@/lib/xrpl/testnet";

/**
 * Test addresses for someone trying the console for the first time.
 *
 * Every entry is a real account, read with account_info on 2026-10-30 at
 * ledger 108,000,839 (mainnet) and on the public Testnet the same day.
 * The two "not found" entries are there on purpose: a tester should see
 * how a screen answers when the account does not exist.
 *
 * Each one names the screen where it shows something worth seeing, so the
 * palette can copy the address and open that screen in one step.
 */
export type SampleAddress = {
  label: string;
  address: string;
  network: "mainnet" | "testnet";
  /** What the ledger shows for it, in a few words. */
  shows: string;
  scene: SceneId;
};

export const SAMPLE_ADDRESSES: SampleAddress[] = [
  {
    label: "Bitstamp USD issuer",
    address: LAB_SUBJECTS.bitstamp,
    network: "mainnet",
    shows: "Master key disabled, one regular key, 0.15% transfer fee",
    scene: "authority",
  },
  {
    label: "Ripple RLUSD issuer",
    address: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
    network: "mainnet",
    shows: "Stablecoin issuer with a signer list",
    scene: "authority",
  },
  {
    label: "Sologenic SOLO issuer",
    address: "rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz",
    network: "mainnet",
    shows: "Blackholed issuer: no key can change it",
    scene: "authority",
  },
  {
    label: "CasinoCoin CSC issuer",
    address: LAB_SUBJECTS.cscIssuer,
    network: "mainnet",
    shows: "Blackholed issuer",
    scene: "issuance",
  },
  {
    label: "Multi-signature account",
    address: LAB_SUBJECTS.multisig,
    network: "mainnet",
    shows: "Two of three signers must approve",
    scene: "treasury",
  },
  {
    label: "Ripple escrow wallet",
    address: LAB_SUBJECTS.rippleEscrow,
    network: "mainnet",
    shows: "Large balance held in escrows to itself",
    scene: "treasury",
  },
  {
    label: "AMM pool account",
    address: LAB_SUBJECTS.ammPool,
    network: "mainnet",
    shows: "An automated market maker pool",
    scene: "amm",
  },
  {
    label: "NFT trader",
    address: LAB_SUBJECTS.nftTrader,
    network: "mainnet",
    shows: "Thousands of owned objects and open NFT offers",
    scene: "security",
  },
  {
    label: "XRP Toolkit",
    address: LAB_SUBJECTS.toolkit,
    network: "mainnet",
    shows: "Its domain lists it back in xrp-ledger.toml",
    scene: "safeshop",
  },
  {
    label: "Unfunded address",
    address: LAB_SUBJECTS.unfunded,
    network: "mainnet",
    shows: "Not found: how a screen answers an empty account",
    scene: "safeshop",
  },
  {
    label: "Deleted phishing relay",
    address: LAB_SUBJECTS.phishingRelay,
    network: "mainnet",
    shows: "Sprayed dust, then deleted itself",
    scene: "provenance",
  },
  {
    label: "Testnet account",
    address: XRPL_TESTNET_FIXTURE_ADDRESS,
    network: "testnet",
    shows: "100 test XRP; choose Testnet in Invoice check",
    scene: "settlement",
  },
];
