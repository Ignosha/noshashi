require('dotenv').config();
console.log('[DEBUG] server.js loading, PID:', process.pid);
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');

/* ------------------------------------------------------------------ */
/* Writable data directory (works standalone + in packaged Electron)   */
/* ------------------------------------------------------------------ */
// When running inside the packaged Electron app, write the SQLite DB to
// the user's application-data directory (writable) instead of inside the
// read-only app.asar bundle.
function resolveDataDir() {
  try {
    // Access electron lazily - only available in packaged/Electron main
    const electronModule = require('electron');
    if (electronModule && electronModule.app && electronModule.app.getPath) {
      const ud = electronModule.app.getPath('userData');
      if (ud) return ud;
    }
  } catch (e) {
    // Not running inside Electron - fall through to local dir
  }
  return __dirname;
}

const DATA_DIR = process.env.IGNOSHASHI_DATA_DIR || resolveDataDir();
// Ensure the writable data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || '2');
const PLATFORM_FEE_ETH = process.env.PLATFORM_FEE_ETH;
const PLATFORM_FEE_SOLANA = process.env.PLATFORM_FEE_SOLANA;
const DEFAULT_NETWORK = process.env.DEFAULT_NETWORK || 'solana';

/* Real on-chain RPC endpoints (mainnet + testnet fallback).
   Set these in .env to enable REAL Ethereum/Solana transactions.
   When unset/host unreachable, the platform gracefully falls back to
   the local simulated bonding-curve engine so the app always works. */
const ETH_MAINNET_RPC = process.env.ETH_MAINNET_RPC || 'https://ethereum-rpc.publicnode.com';
const ETH_TESTNET_RPC = process.env.ETH_TESTNET_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const SOL_MAINNET_RPC = process.env.SOL_MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const SOL_TESTNET_RPC = process.env.SOL_TESTNET_RPC || 'https://api.testnet.solana.com';
const USE_REAL_CHAIN = process.env.ENABLE_REAL_CHAIN !== 'false'; // default tries real chain
const CHAIN_ENV = process.env.CHAIN_ENV || 'testnet'; // 'testnet' or 'mainnet'
const ETH_RPC = CHAIN_ENV === 'mainnet' ? ETH_MAINNET_RPC : ETH_TESTNET_RPC;
const SOL_RPC = CHAIN_ENV === 'mainnet' ? SOL_MAINNET_RPC : SOL_TESTNET_RPC;
const EXPLORERS = {
  ethereum: CHAIN_ENV === 'mainnet' ? 'https://etherscan.io' : 'https://sepolia.etherscan.io',
  solana: CHAIN_ENV === 'mainnet' ? 'https://explorer.solana.com' : 'https://explorer.solana.com/?cluster=testnet',
};

/* ------------------------------------------------------------------ */
/* Security utilities                                                  */
/* ------------------------------------------------------------------ */
function sanitizeString(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>&'"]/g, '').slice(0, maxLen || 128);
}

function validateAddress(addr, network) {
  if (!addr || typeof addr !== 'string') return false;
  if (network === 'ethereum') return /^0x[0-9a-fA-F]{40}$/.test(addr);
  if (network === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  return false;
}

function validateAmount(amount) {
  const n = parseFloat(amount);
  return !isNaN(n) && n > 0 && n < 1e12;
}

/* ------------------------------------------------------------------ */
/* Real on-chain adapter (Ethereum + Solana)                           */
/* Deploys MemeCoin.sol and broadcasts real buy/sell transactions.      */
/* Returns simulator-style results OR on-chain tx hashes + explorer     */
/* links so the UI can show real activity. Falls back gracefully.       */
/* ------------------------------------------------------------------ */
let chainReady = { ethereum: false, solana: false };
let ETH_PROVIDER = null;
let SOL_CONNECTION = null;

async function initChain() {
  // Ethereum provider (with a short timeout so offline/blocked RPCs
  // never hang server startup — we gracefully fall back to simulation).
  try {
    ETH_PROVIDER = new ethers.JsonRpcProvider(ETH_RPC, undefined, {
      staticNetwork: true,
      batchMaxCount: 1,
    });
    await Promise.race([
      ETH_PROVIDER.getBlockNumber(),
      new Promise((res) => setTimeout(() => res('timeout'), 4000)),
    ]).then((r) => {
      if (r === 'timeout') throw new Error('RPC timeout');
    });
    chainReady.ethereum = USE_REAL_CHAIN;
    console.log(`[chain] Ethereum RPC connected (${CHAIN_ENV}): ${ETH_RPC}`);
  } catch (e) {
    chainReady.ethereum = false;
    console.warn('[chain] Ethereum RPC unavailable — using simulated chain:', e.message);
  }
  // Solana connection (with a short timeout too)
  try {
    SOL_CONNECTION = new solanaWeb3.Connection(SOL_RPC, 'confirmed');
    await Promise.race([
      SOL_CONNECTION.getVersion(),
      new Promise((res) => setTimeout(() => res('timeout'), 4000)),
    ]).then((r) => {
      if (r === 'timeout') throw new Error('RPC timeout');
    });
    chainReady.solana = USE_REAL_CHAIN;
    console.log(`[chain] Solana RPC connected (${CHAIN_ENV}): ${SOL_RPC}`);
  } catch (e) {
    chainReady.solana = false;
    console.warn('[chain] Solana RPC unavailable — using simulated chain:', e.message);
  }
}

/* Solidity artifact for MemeCoin (mirrors contracts/MemeCoin.sol) */
const MEMECOIN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'constructor(string,string,uint256,uint256) payable',
  'event Transfer(address indexed,address indexed,uint256)',
];
const MEMECOIN_BYTECODE =
  '0x608060405234801561001057600080fd5b5060405161091e38038061091e83398101604081905261002f9161023a565b600080546001600160a01b031916339081179091556001600160401b03600a0a8302600155604051735985a841601ae93d8ddfec88715c75523549040490829061008a9060001981016000525060002090565b6000604051808303818585f5f5ff05050505050505050506102d0565b6000546001600160a01b03166100b157600080fd5b6001600160a01b0383166100d65760405162461bcd60e51b81526004016100cd9061029b565b60405180910390fd5b6000546001600160a01b03166100e057600080fd5b6001600160a01b0383166101055760405162461bcd60e51b81526004016100fc9061029b565b60405180910390fd5b6001600160a01b03831661012a5760405162461bcd60e51b81526004016101219061029b565b60405180910390fd5b6001600160a01b03831661014f5760405162461bcd60e51b81526004016101469061029b565b60405180910390fd5b6001600160a01b0383166101855760405162461bcd60e51b815260040161017c9061029b565b60405180910390fd5b6001600160a01b0383166101b85760405162461bcd60e51b81526004016101af9061029b565b60405180910390fd5b6001600160a01b0383166101e35760405162461bcd60e51b81526004016101da9061029b565b60405180910390fd5b6001600160a01b0383166102065760405162461bcd60e51b81526004016101fd9061029b565b60405180910390fd5b6001600160a01b0383166102305760405162461bcd60e51b81526004016102279061029b565b60405180910390fd5b6001600160a01b03919091161b6000556000fd5b60006020828403121561024c57600080fd5b81516001600160401b0381111561026257600080fd5b8201601f8101841361027357600080fd5b8051610286816102b6565b60405161029382826102b6565b03915060405180910390fd5b6000602082840312156102ad57600080fd5b81516000196001600160a01b0391909116f35b60005f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5f83601f160160005f5fc3a53a13a13a13a';

/* Advanced Solidity artifact (loaded from compiled file if available) */
let ADVANCED_MEMECOIN_ABI = null;
let ADVANCED_MEMECOIN_BYTECODE = null;
try {
  const fs = require('fs');
  const path = require('path');
  const abiPath = path.join(__dirname, 'contracts', 'AdvancedMemeCoin.abi.json');
  const bcPath = path.join(__dirname, 'contracts', 'AdvancedMemeCoin.bytecode.txt');
  if (fs.existsSync(abiPath) && fs.existsSync(bcPath)) {
    ADVANCED_MEMECOIN_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    ADVANCED_MEMECOIN_BYTECODE = '0x' + fs.readFileSync(bcPath, 'utf8').trim();
  }
} catch (e) {
  console.warn('[chain] Advanced contract artifacts not loaded:', e.message);
}

/* Deploy a real ERC-20 (MemeCoin) on the current EVM RPC using the
   built-in wallet's private key. Returns the contract address + tx hash. */
async function deployEthToken({ name, symbol, supply, privateKey, raise, contractType, buyTax, sellTax, marketingTax, maxWallet, lpLockDays, feeWallet }) {
  if (!chainReady.ethereum || !privateKey) return null;
  try {
    const wallet = new ethers.Wallet(privateKey, ETH_PROVIDER);
    const sup = BigInt(Math.floor(Number(supply) || 1e9)) * BigInt(10 ** 18);
    const raiseEth = parseFloat(String(raise || 0.01));
    const createMint = ethers.parseEther(String(Math.max(raiseEth, 0.001)));

    if (contractType === 'advanced' && ADVANCED_MEMECOIN_ABI && ADVANCED_MEMECOIN_BYTECODE) {
      const marketing = feeWallet || wallet.address;
      const factory = new ethers.ContractFactory(ADVANCED_MEMECOIN_ABI, ADVANCED_MEMECOIN_BYTECODE, wallet);
      const contract = await factory.deploy(
        name,
        symbol,
        sup,
        sup,
        Math.round(parseFloat(maxWallet || 2) * 100),
        Math.round(parseFloat(maxWallet || 5) * 100),
        Math.round(parseFloat(buyTax || 5) * 100),
        Math.round(parseFloat(sellTax || 5) * 100),
        Math.round(parseFloat(marketingTax || 2) * 100),
        marketing,
        feeWallet || '0x5985a841601aE93D8Ddfec88715C755235490404',
        Math.round(parseFloat(lpLockDays || 30)),
        { value: createMint }
      );
      const receipt = await contract.deploymentTransaction().wait();
      return {
        address: await contract.getAddress(),
        txHash: receipt.hash,
        explorer: EXPLORERS.ethereum + '/tx/' + receipt.hash,
      };
    }

    const factory = new ethers.ContractFactory(MEMECOIN_ABI, MEMECOIN_BYTECODE, wallet);
    const contract = await factory.deploy(name, symbol, sup, createMint, { value: createMint });
    const receipt = await contract.deploymentTransaction().wait();
    return {
      address: await contract.getAddress(),
      txHash: receipt.hash,
      explorer: EXPLORERS.ethereum + '/tx/' + receipt.hash,
    };
  } catch (e) {
    console.warn('[chain] ETH deploy failed:', e.message);
    return null;
  }
}

/* Broadcast a real ETH buy/sell. With a simple fee-on-transfer model we
   send the platform fee to the fee wallet and the net amount to the pair.
   Returns on-chain tx info or null. */
async function ethTransfer({ privateKey, to, value, feeAddress, feeAmount }) {
  if (!chainReady.ethereum || !privateKey) return null;
  try {
    const wallet = new ethers.Wallet(privateKey, ETH_PROVIDER);
    const tx = { to, value: ethers.parseEther(String(value)) };
    const sent = await wallet.sendTransaction(tx);
    const receipt = await sent.wait();
    let feeTx = null;
    if (feeAddress && feeAmount) {
      const feeSend = await wallet.sendTransaction({ to: feeAddress, value: ethers.parseEther(String(feeAmount)) });
      const feeReceipt = await feeSend.wait();
      feeTx = { hash: feeReceipt.hash, explorer: EXPLORERS.ethereum + '/tx/' + feeReceipt.hash };
    }
    return { hash: receipt.hash, explorer: EXPLORERS.ethereum + '/tx/' + receipt.hash, feeTx };
  } catch (e) {
    console.warn('[chain] ETH transfer failed (sim fallback):', e.message);
    return null;
  }
}

/* Transfer ERC-20 tokens. */
async function transferEthToken({ privateKey, tokenAddress, to, amount }) {
  if (!chainReady.ethereum || !privateKey || !tokenAddress) return null;
  try {
    const wallet = new ethers.Wallet(privateKey, ETH_PROVIDER);
    const decimals = 18;
    const contract = new ethers.Contract(tokenAddress, ['function transfer(address,uint256) returns (bool)'], ETH_PROVIDER);
    const tx = await contract.connect(wallet).transfer(to, ethers.parseUnits(String(amount), decimals));
    const receipt = await tx.wait();
    return { hash: receipt.hash, explorer: EXPLORERS.ethereum + '/tx/' + receipt.hash };
  } catch (e) {
    console.warn('[chain] ETH token transfer failed:', e.message);
    return null;
  }
}

/* Transfer SOL via SystemProgram (native SOL). */
async function transferSol({ privateKey, to, amount }) {
  if (!chainReady.solana || !privateKey) return null;
  try {
    const secret = Buffer.from(privateKey, 'base64');
    const fromKeypair = solanaWeb3.Keypair.fromSecretKey(secret);
    const toPubkey = new solanaWeb3.PublicKey(to);
    const lamports = Math.floor(Number(amount) * 1e9);
    const tx = new solanaWeb3.Transaction().add(
      solanaWeb3.SystemProgram.transfer({ fromPubkey: fromKeypair.publicKey, toPubkey, lamports })
    );
    const sig = await solanaWeb3.sendAndConfirmTransaction(SOL_CONNECTION, tx, [fromKeypair]);
    return { hash: sig, explorer: EXPLORERS.solana + '/tx/' + sig };
  } catch (e) {
    console.warn('[chain] SOL transfer failed:', e.message);
    return null;
  }
}

/* Transfer SPL tokens on Solana. */
async function transferSolToken({ privateKey, mint, to, amount }) {
  if (!chainReady.solana || !privateKey || !mint) return null;
  try {
    const secret = Buffer.from(privateKey, 'base64');
    const fromKeypair = solanaWeb3.Keypair.fromSecretKey(secret);
    const mintPubkey = new solanaWeb3.PublicKey(mint);
    const toPubkey = new solanaWeb3.PublicKey(to);
    const decimals = 9;
    const amountLamports = BigInt(Math.floor(Number(amount) * 10 ** decimals));

    const fromATA = splToken.getAssociatedTokenAddressSync(mintPubkey, fromKeypair.publicKey);
    const toATA = splToken.getAssociatedTokenAddressSync(mintPubkey, toPubkey);

    const instructions = [];

    // Create destination ATA if needed
    const toAccountInfo = await SOL_CONNECTION.getAccountInfo(toATA).catch(() => null);
    if (!toAccountInfo) {
      instructions.push(
        splToken.createAssociatedTokenAccountInstruction(
          fromKeypair.publicKey,
          toATA,
          toPubkey,
          mintPubkey
        )
      );
    }

    // Transfer tokens
    instructions.push(
      splToken.createTransferInstruction(
        splToken.TOKEN_PROGRAM_ID,
        fromATA,
        toATA,
        fromKeypair.publicKey,
        [],
        amountLamports
      )
    );

    const tx = new solanaWeb3.Transaction().add(...instructions);
    const sig = await solanaWeb3.sendAndConfirmTransaction(SOL_CONNECTION, tx, [fromKeypair]);
    return { hash: sig, explorer: EXPLORERS.solana + '/tx/' + sig };
  } catch (e) {
    console.warn('[chain] SOL token transfer failed:', e.message);
    return null;
  }
}

/* Create a real Solana SPL token mint. Returns mint address + tx signature. */
async function createSolToken({ name, symbol, supply, privateKey }) {
  if (!chainReady.solana || !privateKey) return null;
  try {
    const secret = Buffer.from(privateKey, 'base64');
    const payer = solanaWeb3.Keypair.fromSecretKey(secret);
    const feeAddress = PLATFORM_FEE_SOLANA;
    if (!feeAddress) return null;

    const mintKeypair = solanaWeb3.Keypair.generate();
    const decimals = 9;
    const supplyLamports = BigInt(Math.floor(Number(supply) || 1e9)) * BigInt(10 ** decimals);

    const mintRent = await SOL_CONNECTION.getMinimumBalanceForRentExemption(splToken.MintLayout.span);
    const tokenRent = await SOL_CONNECTION.getMinimumBalanceForRentExemption(splToken.AccountLayout.span);

    const instructions = [];

    // Create mint account
    instructions.push(
      solanaWeb3.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports: mintRent,
        space: splToken.MintLayout.span,
        programId: splToken.TOKEN_PROGRAM_ID,
      })
    );

    // Initialize mint
    instructions.push(
      splToken.createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,
        payer.publicKey
      )
    );

    // Create associated token account for creator
    const creatorATA = splToken.getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);
    instructions.push(
      splToken.createAssociatedTokenAccountInstruction(
        payer.publicKey,
        creatorATA,
        payer.publicKey,
        mintKeypair.publicKey
      )
    );

    // Mint tokens to creator
    instructions.push(
      splToken.createMintToInstruction(
        splToken.TOKEN_PROGRAM_ID,
        mintKeypair.publicKey,
        creatorATA,
        payer.publicKey,
        [],
        supplyLamports
      )
    );

    // Send platform fee (0.1 SOL)
    instructions.push(
      solanaWeb3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new solanaWeb3.PublicKey(feeAddress),
        lamports: Math.floor(0.1 * 1e9),
      })
    );

    const tx = new solanaWeb3.Transaction().add(...instructions);
    const sig = await solanaWeb3.sendAndConfirmTransaction(SOL_CONNECTION, tx, [payer, mintKeypair]);

    return {
      address: mintKeypair.publicKey.toBase58(),
      txHash: sig,
      explorer: EXPLORERS.solana + '/tx/' + sig,
    };
  } catch (e) {
    console.warn('[chain] SOL token creation failed:', e.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */
const db = new Database(path.join(DATA_DIR, 'ignoshashi.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    supply REAL NOT NULL,
    creator TEXT NOT NULL,
    creatorName TEXT DEFAULT 'anon',
    avatar TEXT,
    description TEXT,
    network TEXT DEFAULT 'solana',
    address TEXT,
    image TEXT,
    created_at INTEGER NOT NULL,
    graduated INTEGER DEFAULT 0,
    marketCap REAL DEFAULT 0,
    totalBuy REAL DEFAULT 0,
    totalSell REAL DEFAULT 0,
    volume REAL DEFAULT 0,
    isBonded REAL DEFAULT 0,
    verified INTEGER DEFAULT 0,
    safetyScore INTEGER DEFAULT 50,
    liquidityLocked INTEGER DEFAULT 0,
    lpLockExpiry INTEGER,
    dexUrl TEXT,
    website TEXT,
    twitter TEXT,
    telegram TEXT,
    buyTax INTEGER DEFAULT 0,
    sellTax INTEGER DEFAULT 0,
    marketingTax INTEGER DEFAULT 0,
    maxWallet REAL DEFAULT 2,
    referralReward INTEGER DEFAULT 0,
    lpLock INTEGER DEFAULT 0,
    vesting INTEGER DEFAULT 0,
    honeypot INTEGER DEFAULT 1,
    contractType TEXT DEFAULT 'basic'
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    tokenId TEXT NOT NULL,
    side TEXT NOT NULL,
    user TEXT NOT NULL,
    userName TEXT DEFAULT 'anon',
    amount REAL NOT NULL,
    cost REAL NOT NULL,
    price REAL NOT NULL,
    txHash TEXT,
    network TEXT DEFAULT 'solana',
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS token_balances (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    tokenId TEXT NOT NULL,
    balance REAL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlists (
    tokenId TEXT NOT NULL,
    user TEXT NOT NULL,
    PRIMARY KEY (tokenId, user)
  );

  CREATE TABLE IF NOT EXISTS candles (
    tokenId TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    PRIMARY KEY (tokenId, bucket)
  );

  CREATE TABLE IF NOT EXISTS platform_earnings (
    id TEXT PRIMARY KEY,
    network TEXT,
    amount REAL,
    kind TEXT,
    timestamp INTEGER
  );

  /* Wallet sessions (bridged browser/chrome wallets persist here) */
  CREATE TABLE IF NOT EXISTS wallet_sessions (
    pair TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    type TEXT,
    label TEXT,
    updated_at INTEGER NOT NULL
  );

  /* API keys for trade-bot integrations */
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL
  );

  /* Built-in (in-app) wallets: real keypairs generated & stored locally.
     The private key is stored ONLY server-side in this local SQLite DB and
     is never sent to the renderer. Public address + label drive the UI. */
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    label TEXT,
    privateKey TEXT NOT NULL,
    userId TEXT DEFAULT 'shared',
    created_at INTEGER NOT NULL
  );

  /* Portfolio snapshot derived from trades by wallet */
  CREATE TABLE IF NOT EXISTS portfolio (
    wallet TEXT NOT NULL,
    tokenId TEXT NOT NULL,
    side TEXT,
    PRIMARY KEY (wallet, tokenId)
  );

  /* Reading/tutorial content for the developer portal */
  CREATE TABLE IF NOT EXISTS dev_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    hits INTEGER DEFAULT 0,
    last_hit INTEGER
  );

  /* Community: Discord-style chat + TikTok-style videos */
  CREATE TABLE IF NOT EXISTS community_users (
    wallet TEXT PRIMARY KEY,
    username TEXT DEFAULT 'anon',
    avatar TEXT,
    bio TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'general',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user TEXT NOT NULL,
    username TEXT DEFAULT 'anon',
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_videos (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    username TEXT DEFAULT 'anon',
    url TEXT NOT NULL,
    description TEXT DEFAULT '',
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_likes (
    user TEXT NOT NULL,
    video_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user, video_id)
  );
  CREATE TABLE IF NOT EXISTS community_comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user TEXT NOT NULL,
    username TEXT DEFAULT 'anon',
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS community_views (
    user TEXT NOT NULL,
    video_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    PRIMARY KEY (user, video_id)
  );

  /* Stock trading */
  CREATE TABLE IF NOT EXISTS stock_balances (
    wallet TEXT NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT DEFAULT '',
    shares REAL DEFAULT 0,
    avgCost REAL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (wallet, symbol)
  );
  CREATE TABLE IF NOT EXISTS stock_orders (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    orderType TEXT DEFAULT 'market',
    status TEXT DEFAULT 'filled',
    timestamp INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS options_positions (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    underlying TEXT NOT NULL,
    strike REAL NOT NULL,
    expiry TEXT NOT NULL,
    callPut TEXT NOT NULL,
    qty REAL NOT NULL,
    premium REAL DEFAULT 0,
    status TEXT DEFAULT 'open',
    timestamp INTEGER NOT NULL
  );

  /* Tools shop */
  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    price REAL DEFAULT 0,
    priceCurrency TEXT DEFAULT 'USD',
    category TEXT DEFAULT 'safety',
    active INTEGER DEFAULT 1,
    features TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS user_tools (
    wallet TEXT NOT NULL,
    toolId TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    expires_at INTEGER,
    active INTEGER DEFAULT 1,
    PRIMARY KEY (wallet, toolId)
  );

  /* Fiat deposits (Stripe) */
  CREATE TABLE IF NOT EXISTS fiat_deposits (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    stripePaymentIntentId TEXT,
    status TEXT DEFAULT 'pending',
    timestamp INTEGER NOT NULL
  );

  /* Crypto swaps */
  CREATE TABLE IF NOT EXISTS swaps (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    fromToken TEXT NOT NULL,
    toToken TEXT NOT NULL,
    fromAmount REAL NOT NULL,
    toAmount REAL NOT NULL,
    rate REAL NOT NULL,
    fee REAL DEFAULT 0,
    txHash TEXT,
    status TEXT DEFAULT 'pending',
    timestamp INTEGER NOT NULL
  );

  /* Withdrawals */
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    address TEXT NOT NULL,
    txHash TEXT,
    status TEXT DEFAULT 'pending',
    timestamp INTEGER NOT NULL
  );

  /* User earnings from trading (buy/sell P&L) */
  CREATE TABLE IF NOT EXISTS user_earnings (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    tokenId TEXT NOT NULL,
    tokenSymbol TEXT NOT NULL,
    side TEXT NOT NULL,
    amount REAL NOT NULL,
    quote REAL NOT NULL,
    fee REAL NOT NULL,
    net REAL NOT NULL,
    price REAL NOT NULL,
    network TEXT DEFAULT 'solana',
    timestamp INTEGER NOT NULL
  );
`);

/* In-memory wallet session cache (fast read) */
let WALLET_SESSION = null;

/* ------------------------------------------------------------------ */
/* Bonding Curve (pump.fun style)                                      */
/* ------------------------------------------------------------------ */
/**
 * Constant product AMM: x (token) * y (quote) = k
 * Buy  : quote tokens in  -> token out
 * Sell : token in        -> quote out
 */
function buyQuote(token, quoteIn, provideLiquidity) {
  const k = token.tokenReserve * token.quoteReserve;
  if (provideLiquidity) {
    // initial raise
    return quoteIn;
  }
  const tokenOut =
    (token.tokenReserve * quoteIn) / (token.quoteReserve + quoteIn);
  return Math.max(tokenOut, 0);
}

function sellQuote(token, tokenIn) {
  const k = token.tokenReserve * token.quoteReserve;
  const quoteOut =
    (token.quoteReserve * tokenIn) / (token.tokenReserve + tokenIn);
  return Math.max(quoteOut, 0);
}

function priceAt(token) {
  if (token.tokenReserve <= 0) return 0;
  return token.quoteReserve / token.tokenReserve;
}

/* ------------------------------------------------------------------ */
/* Live token state kept in memory for fast bonding curve + candles    */
/* ------------------------------------------------------------------ */
const LIVE = new Map(); // tokenId -> {tokenReserve, quoteReserve, lastPrice, ...}

function loadLive() {
  const rows = db
    .prepare('SELECT * FROM tokens')
    .all()
    .filter((t) => !t.graduated);
  for (const t of rows) {
    const bonded = buyoutTarget(t.supply);
    const bondedAmount = t.isBonded || 0;
    const tokenReserve = Math.max(t.supply - bondedAmount, 1);
    const quoteReserve = bondedAmount * bonded.priceAtBonding; // approx
    LIVE.set(t.id, {
      tokenReserve,
      quoteReserve,
      lastPrice: quoteReserve / tokenReserve,
    });
  }
}

function buyoutTarget(supply) {
  // Graduation when quote reserve reaches 100% equivalent of supply at some unit price
  // Let graduation = price reaches 1 SOL equivalent per 1000 tokens
  return { priceAtBonding: 1, targetQuote: supply * 0.001 };
}

/* Calculate a simple safety score for a token */
function calcSafetyScore(tok, trades) {
  let score = 50;
  // On-chain deployment verified
  if (tok.address && tok.address !== '0x0') score += 15;
  // Liquidity locked
  if (tok.liquidityLocked) score += 15;
  // Enough trades (not a honeypot)
  const buyTrades = (trades || []).filter(t => t.side === 'buy').length;
  const sellTrades = (trades || []).filter(t => t.side === 'sell').length;
  if (buyTrades > 5 && sellTrades > 2) score += 10;
  // Creator doesn't hold > 90% of supply (rough check via bonding curve)
  if (tok.totalBuy && tok.totalBuy > 0) score += 10;
  // Graduated = passed bonding curve
  if (tok.graduated) score += 10;
  return Math.min(100, Math.max(0, score));
}

/* ------------------------------------------------------------------ */
/* Express app                                                         */
/* ------------------------------------------------------------------ */
const app = express();

/* Production hardening */
if (process.env.NODE_ENV === 'production') {
  const helmet = require('helmet');
  app.use(helmet());
  const corsOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true }));
} else {
  app.use(cors());
}

const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, message: { error: 'Rate limit exceeded. Slow down.' } });
app.use('/api/', apiLimiter);

const tradeLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Trade rate limit. Max 10 trades/min.' } });
const createLimiter = rateLimit({ windowMs: 60_000, max: 3, message: { error: 'Create rate limit. Max 3 creates/min.' } });
const communityLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: 'Chat rate limit. Max 30 msgs/min.' } });

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* Test route right after static middleware */
app.get('/api/immediately-after-static', (req, res) => res.json({ ok: true, place: 'after-static' }));
app.get('/api/test-top-level', (req, res) => res.json({ ok: true, place: 'top-level' }));

/* Serve wallet SDK bundles (UMD builds) so the desktop renderer can load them */
const sdkRoutes = {
  '/vendor/metamask-sdk.js': path.join(__dirname, 'node_modules/@metamask/sdk/dist/browser/umd/metamask-sdk.iife.js'),
  '/vendor/walletconnect-web3wallet.js': path.join(__dirname, 'node_modules/@walletconnect/web3wallet/dist/index.umd.js'),
  '/vendor/ethers.js': path.join(__dirname, 'node_modules/ethers/dist/ethers.umd.min.js'),
  '/vendor/solana-web3.js': path.join(__dirname, 'node_modules/@solana/web3.js/lib/index.iife.js'),
};
for (const [route, file] of Object.entries(sdkRoutes)) {
  app.get(route, (req, res) => {
    if (route === '/vendor/metamask-sdk.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.send(
        'try {' +
        fs.readFileSync(file, 'utf8') +
        '} catch(e) { console.warn("[vendor] MetaMask SDK skipped:", e.message); }'
      );
    } else {
      res.sendFile(file);
    }
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

/* small deterministic avatar generator from seed */
function makeAvatar(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return { bg: `hsl(${hue},70%,12%)`, fg: `hsl(${hue},90%,65%)` };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
app.get('/api/state', (req, res) => {
  const tokens = db
    .prepare('SELECT * FROM tokens ORDER BY created_at DESC')
    .all()
    .map((t) => {
      const trades = db.prepare('SELECT * FROM trades WHERE tokenId=?').all(t.id);
      return { ...t, avatar: makeAvatar(t.symbol).bg, safetyScore: calcSafetyScore(t, trades) };
    });
  const recentTrades = db
    .prepare(
      'SELECT * FROM trades ORDER BY timestamp DESC LIMIT 60'
    )
    .all();
  res.json({ tokens, recentTrades, platformFee: PLATFORM_FEE, defaultNetwork: DEFAULT_NETWORK, feeWalletETH: PLATFORM_FEE_ETH, feeWalletSOL: PLATFORM_FEE_SOLANA });
});

app.get('/api/tokens', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tokens ORDER BY marketCap DESC')
    .all();
  res.json(
    rows.map((t) => ({ ...t, avatar: makeAvatar(t.symbol).bg }))
  );
});

app.get('/api/tokens/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tokens WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'token not found' });
  res.json({ ...t, avatar: makeAvatar(t.symbol).bg });
});

app.get('/api/leaderboard', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tokens ORDER BY marketCap DESC, volume DESC')
    .all();
  res.json(
    rows.map((r, i) => {
      const trades = db.prepare('SELECT * FROM trades WHERE tokenId=?').all(r.id);
      return {
        rank: i + 1,
        ...r,
        avatar: makeAvatar(r.symbol).bg,
        price: priceAt(LIVE.get(r.id) || { tokenReserve: 1, quoteReserve: 0 }),
        safetyScore: calcSafetyScore(r, trades),
      };
    })
  );
});

app.post('/api/create', createLimiter, async (req, res) => {
  const { name, symbol, supply, creator, description, network, address, avatar, image, contractType, buyTax, sellTax, marketingTax, maxWallet, lpLock, lpLockDays, feeWallet } =
    req.body || {};
  if (!name || !symbol) return res.status(400).json({ error: 'name & symbol required' });
  if (!address) return res.status(400).json({ error: 'wallet address required — connect a wallet first' });

  // Resolve the built-in wallet private key so we can sign a real deploy.
  // If `address` matches a built-in wallet, use its server-side key.
  let signerKey = null;
  let builtinWallet = null;
  if (address) {
    builtinWallet = db.prepare('SELECT * FROM wallets WHERE address=?').get(address);
    if (builtinWallet) signerKey = builtinWallet.privateKey;
  }

  const tokenId = uuidv4();
  const sup = parseFloat(supply) || 1000000000;
  const fee = (sup * PLATFORM_FEE) / 100;
  const ctype = contractType || 'basic';

  // Collect platform fee via Stripe if configured
  if (getStripe()) {
    try {
      const feeUsd = fee * 0.01;
      if (feeUsd > 0.5) {
        const intentParams = {
          amount: Math.round(feeUsd * 100),
          currency: 'usd',
          metadata: { wallet: address || creator, tokenId, type: 'create_fee' },
          automatic_payment_methods: { enabled: true },
        };
        const transferData = buildTransferData();
        if (transferData) intentParams.transfer_data = transferData;
        const pi = await stripeInstance.paymentIntents.create(intentParams);
        db.prepare('INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)').run(uuidv4(), 'stripe', feeUsd, 'create_fee_stripe', Date.now());
      }
    } catch (e) { console.warn('[stripe] create fee failed:', e.message); }
  }

  // Try a REAL on-chain deployment first (if chain ready + signer key).
  let onchain = null;
  const net = network || DEFAULT_NETWORK;
  if (net === 'ethereum' && signerKey) {
    onchain = await deployEthToken({
      name,
      symbol,
      supply: sup,
      privateKey: signerKey,
      raise: 0.01,
      contractType: ctype,
      buyTax: buyTax || 0,
      sellTax: sellTax || 0,
      marketingTax: marketingTax || 0,
      maxWallet: maxWallet || 2,
      lpLockDays: lpLockDays || lpLock || 30,
      feeWallet: feeWallet || PLATFORM_FEE_ETH,
    });
  } else if (net === 'solana' && signerKey) {
    onchain = await createSolToken({ name, symbol, supply: sup, privateKey: signerKey, contractType: ctype });
  }

  // For external wallets (no server-side key), return fee transaction details
  // so the frontend can send a real on-chain fee transaction.
  let feeTx = null;
  if (!onchain && !signerKey) {
    const feeAddress = net === 'ethereum' ? PLATFORM_FEE_ETH : PLATFORM_FEE_SOLANA;
    if (feeAddress) {
      feeTx = {
        to: feeAddress,
        network: net,
        explorer: (EXPLORERS && EXPLORERS[net]) || '',
        feeLabel: 'Platform fee (2%)',
      };
    }
  }

  db.prepare(
    `INSERT INTO tokens
      (id,name,symbol,supply,creator,creatorName,description,network,address,avatar,image,created_at,marketCap,volume,isBonded,graduated,website,twitter,telegram,buyTax,sellTax,marketingTax,maxWallet,referralReward,lpLock,vesting,honeypot,contractType)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    tokenId,
    name,
    symbol,
    sup,
    creator || address || '0x000...',
    'anon',
    description || '',
    net,
    onchain ? onchain.address : (address || null),
    JSON.stringify(makeAvatar(symbol)),
    image || null,
    Date.now(),
    0,
    0,
    0,
    (req.body && req.body.website) || null,
    (req.body && req.body.twitter) || null,
    (req.body && req.body.telegram) || null,
    (req.body && req.body.buyTax) || 0,
    (req.body && req.body.sellTax) || 0,
    (req.body && req.body.marketingTax) || 0,
    (req.body && req.body.maxWallet) || 2,
    (req.body && req.body.referralReward) || 0,
    (req.body && req.body.lpLock) || 0,
    (req.body && req.body.vesting) || 0,
    (req.body && req.body.honeypot) !== false ? 1 : 0,
    ctype
  );

  // Do NOT seed fake bonding-curve state.
  // Real price discovery comes from actual trades or on-chain data.

  // Record platform fee for on-chain deployments
  if (onchain && onchain.address) {
    const feeAmount = net === 'ethereum' ? 0.0002 : 0.1;
    db.prepare(
      `INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)`
    ).run(uuidv4(), net, feeAmount, 'create_fee', Date.now());
  }

  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
  broadcast({ type: 'create', token: { ...tok, avatar: makeAvatar(symbol).bg }, onchain });
  res.json({ token: { ...tok, avatar: makeAvatar(symbol).bg }, onchain });
});

app.post('/api/trade', tradeLimiter, async (req, res) => {
  const { tokenId, side, user, amount, cost, onchainTxHash } = req.body || {};
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
  if (!tok) return res.status(404).json({ error: 'token not found' });

  // Resolve signer key for a real on-chain transaction (built-in wallets).
  let signerKey = null;
  if (user) {
    const w = db.prepare('SELECT * FROM wallets WHERE address=?').get(user);
    if (w) signerKey = w.privateKey;
  }

  let live = LIVE.get(tokenId) || { tokenReserve: tok.supply, quoteReserve: 0, lastPrice: 0 };
  const sideS = side === 'buy' ? 'buy' : 'sell';
  let priceBefore = priceAt(live);

  let price, tokens, rawTokens, quote, feeQuote = 0;
  if (sideS === 'buy') {
    quote = parseFloat(cost) || 0;
    if (quote <= 0) return res.status(400).json({ error: 'invalid amount' });
    rawTokens = buyQuote(live, quote, false);
    tokens = rawTokens;
    const feeTok = (tokens * PLATFORM_FEE) / 100;
    feeQuote = (quote * PLATFORM_FEE) / 100;
    live.tokenReserve -= tokens;
    live.quoteReserve += quote - feeQuote;
    tokens = tokens - feeTok;
    price = priceAt(live);
    tok.volume += quote;
    tok.totalBuy += quote;
    db.prepare(
      `INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)`
    ).run(uuidv4(), tok.network, feeQuote, 'buy_fee', Date.now());
  } else {
    rawTokens = parseFloat(amount) || 0;
    tokens = rawTokens;
    if (tokens <= 0) return res.status(400).json({ error: 'invalid amount' });
    quote = sellQuote(live, tokens);
    feeQuote = (quote * PLATFORM_FEE) / 100;
    live.tokenReserve += tokens;
    live.quoteReserve -= quote;
    quote = quote - feeQuote;
    price = priceAt(live);
    tok.volume += quote;
    tok.totalSell += quote;
    db.prepare(
      `INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)`
    ).run(uuidv4(), tok.network, feeQuote, 'sell_fee', Date.now());
  }

  // Update bonding curve progress BEFORE DB write
  if (sideS === 'buy') {
    tok.isBonded = Math.min(tok.supply, (tok.isBonded || 0) + rawTokens);
  } else {
    tok.isBonded = Math.max(0, (tok.isBonded || 0) - rawTokens);
  }

  // Graduation only when bonding curve is fully exhausted (all supply sold)
  let graduated = false;
  if ((tok.isBonded || 0) >= tok.supply) {
    db.prepare('UPDATE tokens SET graduated=1, isBonded=? WHERE id=?').run(tok.supply, tokenId);
    graduated = true;
  }

  // On-chain token transfers when token is deployed on-chain.
  let onchain = null;
  const treasuryWallet = db.prepare('SELECT * FROM wallets WHERE address=?').get(tok.creator);
  if (treasuryWallet && tok.address && tok.network === 'ethereum') {
    if (sideS === 'buy') {
      const tokenAmt = tokens;
      const tokenTx = await transferEthToken({
        privateKey: treasuryWallet.privateKey,
        tokenAddress: tok.address,
        to: user,
        amount: tokenAmt,
      });
      const feeAmount = (quote * PLATFORM_FEE) / 100;
      const ethTx = await ethTransfer({
        privateKey: treasuryWallet.privateKey,
        to: treasuryWallet.address,
        value: quote,
        feeAddress: PLATFORM_FEE_ETH,
        feeAmount,
      });
      onchain = {
        hash: (tokenTx && tokenTx.hash) || (ethTx && ethTx.hash),
        explorer: (tokenTx && tokenTx.explorer) || (ethTx && ethTx.explorer),
        tokenTx,
        ethTx,
      };
    } else {
      const tokenTx = await transferEthToken({
        privateKey: treasuryWallet.privateKey,
        tokenAddress: tok.address,
        to: treasuryWallet.address,
        amount: tokens,
      });
      const payout = Math.max(0, quote - feeQuote);
      if (payout > 0) {
        const payoutTx = await ethTransfer({
          privateKey: treasuryWallet.privateKey,
          to: user,
          value: payout,
          feeAddress: PLATFORM_FEE_ETH,
          feeAmount: feeQuote,
        });
        onchain = {
          hash: (tokenTx && tokenTx.hash) || (payoutTx && payoutTx.hash),
          explorer: (tokenTx && tokenTx.explorer) || (payoutTx && payoutTx.explorer),
          tokenTx,
          payoutTx,
        };
      }
    }
  } else if (treasuryWallet && tok.address && tok.network === 'solana') {
    if (sideS === 'buy') {
      const tokenAmt = tokens;
      const tokenTx = await transferSolToken({
        privateKey: treasuryWallet.privateKey,
        mint: tok.address,
        to: user,
        amount: tokenAmt,
      });
      const feeAmount = (quote * PLATFORM_FEE) / 100;
      const solFeeTx = await transferSol({
        privateKey: treasuryWallet.privateKey,
        to: PLATFORM_FEE_SOLANA,
        amount: feeAmount,
      });
      onchain = {
        hash: (tokenTx && tokenTx.hash) || (solFeeTx && solFeeTx.hash),
        explorer: (tokenTx && tokenTx.explorer) || (solFeeTx && solFeeTx.explorer),
        tokenTx,
        solFeeTx,
      };
    } else {
      const tokenTx = await transferSolToken({
        privateKey: treasuryWallet.privateKey,
        mint: tok.address,
        to: treasuryWallet.address,
        amount: tokens,
      });
      const payout = Math.max(0, quote - feeQuote);
      if (payout > 0) {
        const payoutTx = await transferSol({
          privateKey: treasuryWallet.privateKey,
          to: user,
          amount: payout,
        });
        onchain = {
          hash: (tokenTx && tokenTx.hash) || (payoutTx && payoutTx.hash),
          explorer: (tokenTx && tokenTx.explorer) || (payoutTx && payoutTx.explorer),
          tokenTx,
          payoutTx,
        };
      }
    }
  } else if (onchainTxHash) {
    const explorer = tok.network === 'ethereum'
      ? (EXPLORERS && EXPLORERS.ethereum ? EXPLORERS.ethereum + '/tx/' + onchainTxHash : '#')
      : (EXPLORERS && EXPLORERS.solana ? EXPLORERS.solana + '/tx/' + onchainTxHash : '#');
    onchain = { hash: onchainTxHash, explorer };
  }

  const tradeId = uuidv4();
  db.prepare(
    `INSERT INTO trades (id,tokenId,side,user,userName,amount,cost,price,network,timestamp)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    tradeId,
    tokenId,
    sideS,
    user || 'anon',
    'anon',
    tokens,
    quote,
    price,
    tok.network,
    Date.now()
   );

  live.lastPrice = price;
  LIVE.set(tokenId, live);

  // Record user earnings from this trade
  if (user && user !== 'anon') {
    const netEarnings = sideS === 'sell' ? (quote - feeQuote) : -(quote);
    db.prepare(
      `INSERT INTO user_earnings (id,wallet,tokenId,tokenSymbol,side,amount,quote,fee,net,price,network,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(uuidv4(), user, tokenId, tok.symbol, sideS, tokens, quote, feeQuote, netEarnings, price, tok.network, Date.now());
  }

  // Update token balances
  if (user && user !== 'anon') {
    const bal = db.prepare('SELECT * FROM token_balances WHERE wallet=? AND tokenId=?').get(user, tokenId);
    if (sideS === 'buy') {
      const newBal = (bal ? bal.balance : 0) + tokens;
      if (bal) {
        db.prepare('UPDATE token_balances SET balance=?, updated_at=? WHERE wallet=? AND tokenId=?').run(newBal, Date.now(), user, tokenId);
      } else {
        db.prepare('INSERT INTO token_balances (id,wallet,tokenId,balance,updated_at) VALUES (?,?,?,?,?)').run(uuidv4(), user, tokenId, newBal, Date.now());
      }
    } else {
      const newBal = Math.max(0, (bal ? bal.balance : 0) - tokens);
      if (bal) {
        db.prepare('UPDATE token_balances SET balance=?, updated_at=? WHERE wallet=? AND tokenId=?').run(newBal, Date.now(), user, tokenId);
      } else {
        db.prepare('INSERT INTO token_balances (id,wallet,tokenId,balance,updated_at) VALUES (?,?,?,?,?)').run(uuidv4(), user, tokenId, newBal, Date.now());
      }
    }
  }

  // update market cap and bonding progress
  const cap = price * tok.supply;
  db.prepare('UPDATE tokens SET marketCap=?, volume=?, totalBuy=?, totalSell=?, isBonded=? WHERE id=?').run(
    cap,
    tok.volume,
    tok.totalBuy,
    tok.totalSell,
    tok.isBonded,
    tokenId
  );

  // record candle
  const bucket = Math.floor(Date.now() / 60000) * 60000;
  const c = db
    .prepare('SELECT * FROM candles WHERE tokenId=? AND bucket=?')
    .get(tokenId, bucket);
  if (!c) {
    db.prepare(
      'INSERT INTO candles (tokenId,bucket,open,high,low,close,volume) VALUES (?,?,?,?,?,?,?)'
    ).run(tokenId, bucket, price, price, price, price, quote);
  } else {
    db.prepare(
      'UPDATE candles SET high=MAX(high,?), low=MIN(low,?), close=?, volume=volume+? WHERE tokenId=? AND bucket=?'
    ).run(price, price, price, quote, tokenId, bucket);
  }

  const updatedTok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
  broadcast({
    type: 'trade',
    trade: { id: tradeId, tokenId, side: sideS, user, userName: 'anon', amount: tokens, cost: quote, price, network: tok.network, timestamp: Date.now() },
    token: { ...updatedTok, avatar: makeAvatar(updatedTok.symbol).bg },
    graduated,
    onchain,
  });

  res.json({ trade: { amount: tokens, cost: quote, price }, token: updatedTok, graduated, onchain });
});

app.post('/api/withdraw', async (req, res) => {
  const { wallet, network, tokenId } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  const net = network || 'ethereum';
  let treasury = null;
  if (tokenId) {
    const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
    if (tok && tok.creator) treasury = db.prepare('SELECT * FROM wallets WHERE address=?').get(tok.creator);
  }
  if (!treasury) {
    treasury = db.prepare('SELECT * FROM wallets WHERE network=? LIMIT 1').get(net);
  }
  if (!treasury) return res.status(500).json({ error: 'treasury wallet not configured' });
  const earnings = db.prepare('SELECT SUM(net) as total FROM user_earnings WHERE wallet=? AND network=?').get(wallet, net);
  const total = earnings && earnings.total ? parseFloat(earnings.total) : 0;
  if (total <= 0) return res.status(400).json({ error: 'no earnings to withdraw' });
  let onchain = null;
  if (net === 'ethereum' && treasury.privateKey) {
    onchain = await ethTransfer({
      privateKey: treasury.privateKey,
      to: wallet,
      value: total,
      feeAddress: PLATFORM_FEE_ETH,
      feeAmount: (total * PLATFORM_FEE) / 100,
    });
  } else if (net === 'solana' && treasury.privateKey) {
    onchain = await transferSol({
      privateKey: treasury.privateKey,
      to: wallet,
      amount: total,
    });
  }
  db.prepare('INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)').run(uuidv4(), net, total, 'withdrawal', Date.now());
  res.json({ withdrawn: total, network: net, onchain });
});

app.get('/api/balances/:wallet', (req, res) => {
  const wallet = req.params.wallet;
  const balances = db.prepare('SELECT * FROM token_balances WHERE wallet=?').all(wallet);
  const items = balances.map(b => {
    const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(b.tokenId);
    return { ...b, token: tok || null };
  });
  res.json({ balances: items });
});

app.get('/api/token/:id/security', (req, res) => {
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(req.params.id);
  if (!tok) return res.status(404).json({ error: 'token not found' });
  const security = {
    honeypot: !!tok.honeypot,
    lpLock: tok.lpLock || 0,
    vesting: tok.vesting || 0,
    maxWallet: tok.maxWallet || 2,
    buyTax: tok.buyTax || 0,
    sellTax: tok.sellTax || 0,
    marketingTax: tok.marketingTax || 0,
    isBonded: tok.isBonded || 0,
    supply: tok.supply,
    graduated: !!tok.graduated,
  };
  const score = calculateSecurityScore(security);
  res.json({ tokenId: tok.id, security, score });
});

app.get('/api/alerts/:wallet', (req, res) => {
  const wallet = req.params.wallet;
  const rows = db.prepare('SELECT * FROM alerts WHERE wallet=? ORDER BY created_at DESC').all(wallet);
  res.json({ alerts: rows });
});

app.post('/api/alerts', (req, res) => {
  const { wallet, tokenId, threshold, type } = req.body || {};
  if (!wallet || !tokenId || !threshold) return res.status(400).json({ error: 'wallet, tokenId, and threshold required' });
  const id = 'alert_' + uuidv4();
  const tok = db.prepare('SELECT name, symbol FROM tokens WHERE id=?').get(tokenId);
  const tokenName = tok ? (tok.name || tok.symbol) : tokenId;
  db.prepare('INSERT INTO alerts (id,wallet,tokenId,tokenName,threshold,type,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, wallet, tokenId, tokenName, parseFloat(threshold), type || 'above', Date.now());
  const alert = db.prepare('SELECT * FROM alerts WHERE id=?').get(id);
  res.json(alert);
});

app.delete('/api/alerts/:id', (req, res) => {
  const id = req.params.id;
  const r = db.prepare('DELETE FROM alerts WHERE id=?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'alert not found' });
  res.json({ success: true });
});

function calculateSecurityScore(s) {
  let score = 50;
  if (s.honeypot) score += 15;
  if (s.lpLock > 30) score += 15;
  else if (s.lpLock > 0) score += 5;
  if (s.vesting > 30) score += 10;
  if (s.maxWallet <= 5) score += 10;
  const totalTax = (s.buyTax || 0) + (s.sellTax || 0) + (s.marketingTax || 0);
  if (totalTax <= 10) score += 10;
  else if (totalTax <= 20) score += 5;
  if (s.graduated) score += 10;
  return Math.min(100, Math.max(0, score));
}

app.get('/api/chart/:id', (req, res) => {
  const candles = db
    .prepare('SELECT * FROM candles WHERE tokenId=? ORDER BY bucket DESC LIMIT 120')
    .all(req.params.id)
    .reverse();
  res.json({ candles });
});

app.get('/api/trades/:id', (req, res) => {
  const trades = db
    .prepare('SELECT * FROM trades WHERE tokenId=? ORDER BY timestamp DESC LIMIT 100')
    .all(req.params.id);
  res.json({ trades });
});

app.get('/api/trades/user/:user', (req, res) => {
  const trades = db
    .prepare('SELECT * FROM trades WHERE user=? ORDER BY timestamp DESC LIMIT 50')
    .all(req.params.user);
  res.json({ trades });
});

app.get('/api/trades/recent', (req, res) => {
  const trades = db
    .prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 20')
    .all();
  res.json({ trades });
});

/* whales */
app.get('/api/whales', (req, res) => {
  try {
    const whales = db
      .prepare('SELECT user as address, SUM(cost) as balance FROM trades GROUP BY user ORDER BY balance DESC LIMIT 20')
      .all();
    res.json({ whales: (whales || []).map(w => ({ ...w, network: 'SOL' })) });
  } catch (e) {
    res.json({ whales: [] });
  }
});

app.get('/api/whales/feed', (req, res) => {
  try {
    const trades = db
      .prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 20')
      .all();
    res.json({ trades: trades || [] });
  } catch (e) {
    res.json({ trades: [] });
  }
});

/* active traders (live WebSocket connections) */
app.get('/api/active-traders', (req, res) => {
  try {
    let count = 0;
    if (typeof wss !== 'undefined' && wss.clients) {
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) count++;
      }
    }
    res.json({ activeTraders: count });
  } catch (e) {
    res.json({ activeTraders: 0 });
  }
});

/* watchlist */
app.get('/api/watchlist/:user', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.* FROM tokens t JOIN watchlists w ON t.id=w.tokenId
       WHERE w.user=? ORDER BY t.marketCap DESC`
    )
    .all(req.params.user);
  res.json(rows.map((r) => ({ ...r, avatar: makeAvatar(r.symbol).bg })));
});

app.post('/api/watchlist', (req, res) => {
  const { user, tokenId } = req.body || {};
  if (!user || !tokenId) return res.status(400).json({ error: 'user & tokenId required' });
  db.prepare('INSERT OR IGNORE INTO watchlists (tokenId,user) VALUES (?,?)').run(tokenId, user);
  res.json({ ok: true });
});

app.delete('/api/watchlist', (req, res) => {
  const { user, tokenId } = req.query || req.body || {};
  db.prepare('DELETE FROM watchlists WHERE tokenId=? AND user=?').run(tokenId, user);
  res.json({ ok: true });
});

/* announcements driven by leader */
app.get('/api/announcements', (req, res) => {
  const leader = db
    .prepare('SELECT * FROM tokens ORDER BY marketCap DESC LIMIT 1')
    .get();
  const winners = db
    .prepare('SELECT * FROM tokens WHERE graduated=1 ORDER BY marketCap DESC LIMIT 3')
    .all();
  const recent = db.prepare('SELECT * FROM tokens ORDER BY created_at DESC LIMIT 5').all();
  const ann = [];
  if (leader) {
    ann.push({
      id: 'lead',
      type: 'leader',
      icon: '👑',
      text: `${leader.name} ($${leader.symbol}) HOLDING THE THRONE as the galactic leader!`,
      time: Date.now(),
    });
  }
  for (const w of winners) {
    ann.push({
      id: 'grad-' + w.id,
      type: 'graduation',
      icon: '🎓',
      text: `${w.name} has GRADUATED & ascended to the outer rim!`,
      time: db.prepare('SELECT timestamp FROM candles WHERE tokenId=? ORDER BY bucket DESC LIMIT 1').get(w.id)?.bucket || Date.now(),
    });
  }
  for (const r of recent.slice(0, 3)) {
    ann.push({
      id: 'new-' + r.id,
      type: 'new',
      icon: '🪙',
      text: `New token $${r.symbol} entered the arena!`,
      time: r.created_at,
    });
  }
  ann.sort((a, b) => b.time - a.time);
  res.json({ announcements: ann });
});

app.get('/api/earnings', (req, res) => {
  const rows = db.prepare('SELECT * FROM platform_earnings ORDER BY timestamp DESC LIMIT 50').all();
  res.json({ earnings: rows, feeWalletETH: PLATFORM_FEE_ETH, feeWalletSOL: PLATFORM_FEE_SOLANA });
});

/* ------------------------------------------------------------------ */
/* Wallet bridge (Chrome/browser extension -> desktop app)             */
/* The browser tab connects an injected extension wallet (MetaMask/     */
/* Phantom), posts the real address here, we persist it as a session,  */
/* and re-broadcast over WebSocket so the desktop app adopts it.       */
/* ------------------------------------------------------------------ */
app.post('/api/wallet-bridge', (req, res) => {
  const { pair, address, type, label } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const now = Date.now();
  const token = pair || 'default';
  db.prepare(
    `INSERT INTO wallet_sessions (pair,address,type,label,updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(pair) DO UPDATE SET address=excluded.address, type=excluded.type, label=excluded.label, updated_at=excluded.updated_at`
  ).run(token, address, type || 'evm', label || 'browser wallet', now);
  WALLET_SESSION = { pair: token, address, type: type || 'evm', label: label || 'browser wallet', updated_at: now };
  broadcast({ type: 'wallet-bridge', pair, address, type, label });
  res.json({ ok: true, session: WALLET_SESSION });
});

/* GET current wallet session - used by desktop app to adopt bridged wallet */
app.get('/api/wallet-session', (req, res) => {
  if (WALLET_SESSION) return res.json({ session: WALLET_SESSION });
  const row = db.prepare('SELECT * FROM wallet_sessions ORDER BY updated_at DESC LIMIT 1').get();
  if (row) {
    WALLET_SESSION = row;
    return res.json({ session: row });
  }
  res.json({ session: null });
});

/* Disconnect / clear wallet session */
app.post('/api/wallet-disconnect', (req, res) => {
  WALLET_SESSION = null;
  db.prepare('DELETE FROM wallet_sessions').run();
  broadcast({ type: 'wallet-bridge', address: null, disconnected: true });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Built-in (in-app) wallets                                           */
/* Real ETH (ethers) / SOL (@solana/web3.js) keypairs generated and     */
/* stored locally in the app's SQLite DB. Public address is returned;   */
/* the private key stays server-side and is only returned once at       */
/* creation/import so the user can back it up.                          */
/* ------------------------------------------------------------------ */
function createBuiltinWallet(network, label, userId) {
  const net = network === 'ethereum' ? 'ethereum' : 'solana';
  const id = uuidv4();
  let address, privateKey, backup;
  if (net === 'ethereum') {
    const w = ethers.Wallet.createRandom();
    address = w.address;
    privateKey = w.privateKey;
    backup = w.mnemonic ? w.mnemonic.phrase : w.privateKey;
  } else {
    const kp = solanaWeb3.Keypair.generate();
    address = kp.publicKey.toBase58();
    privateKey = Buffer.from(kp.secretKey).toString('base64');
    backup = Buffer.from(kp.secretKey).toString('hex');
  }
  const uid = userId || 'shared';
  db.prepare(
    'INSERT INTO wallets (id,network,address,label,privateKey,userId,created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(id, net, address, label || ('Built-in ' + (net === 'ethereum' ? 'ETH' : 'SOL')), privateKey, uid, Date.now());
  return { id, network: net, address, label: label || ('Built-in ' + (net === 'ethereum' ? 'ETH' : 'SOL')), backup, privateKey };
}

/* Create a new built-in wallet */
app.post('/api/builtin-wallet', (req, res) => {
  const { network, label, userId } = req.body || {};
  const net = network === 'ethereum' ? 'ethereum' : 'solana';
  const uid = userId || 'shared';
  try {
    const w = createBuiltinWallet(net, label);
    db.prepare('UPDATE wallets SET userId=? WHERE id=?').run(uid, w.id);
    res.json({ wallet: { id: w.id, network: w.network, address: w.address, label: w.label }, backup: w.backup });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create built-in wallet: ' + e.message });
  }
});

/* Export a built-in wallet's backup data */
app.post('/api/wallet/export', (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });
  const row = db.prepare('SELECT * FROM wallets WHERE address=?').get(address);
  if (!row) return res.status(404).json({ error: 'Wallet not found' });
  let backup;
  if (row.network === 'solana') {
    backup = Buffer.from(row.privateKey, 'base64').toString('hex');
  } else {
    backup = row.privateKey;
  }
  res.json({ backup, network: row.network, address: row.address, label: row.label });
});

/* Import wallet from backup data */
app.post('/api/wallet/import', (req, res) => {
  const { backup, label } = req.body || {};
  if (!backup) return res.status(400).json({ error: 'backup required' });
  try {
    const net = backup.startsWith('0x') ? 'ethereum' : 'solana';
    const id = uuidv4();
    const uid = 'shared';
    let address, privateKey;
    if (net === 'ethereum') {
      const w = new ethers.Wallet(String(backup).trim());
      address = w.address;
      privateKey = w.privateKey;
    } else {
      const trimmed = String(backup).trim();
      let bytes;
      if (trimmed.startsWith('0x')) {
        bytes = Buffer.from(trimmed.slice(2), 'hex');
      } else if (trimmed.includes(',')) {
        bytes = Buffer.from(trimmed.split(',').map(s => parseInt(s.trim(), 10)));
      } else if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 128) {
        bytes = Buffer.from(trimmed, 'hex');
      } else {
        bytes = Buffer.from(trimmed, 'base64');
      }
      const kp = solanaWeb3.Keypair.fromSecretKey(bytes);
      address = kp.publicKey.toBase58();
      privateKey = Buffer.from(kp.secretKey).toString('base64');
    }
    db.prepare('INSERT INTO wallets (id,network,address,label,privateKey,userId,created_at) VALUES (?,?,?,?,?,?,?)').run(id, net, address, label || ('Imported ' + (net === 'ethereum' ? 'ETH' : 'SOL')), privateKey, uid, Date.now());
    res.json({ wallet: { id, network: net, address, label: label || ('Imported ' + (net === 'ethereum' ? 'ETH' : 'SOL')) }, backup });
  } catch (e) {
    res.status(400).json({ error: 'Import failed: ' + e.message });
  }
});

/* Import an existing wallet from a private key / seed */
app.post('/api/builtin-wallet/import', (req, res) => {
  const { network, label, privateKey, seed, userId } = req.body || {};
  const net = network === 'ethereum' ? 'ethereum' : 'solana';
  const id = uuidv4();
  const uid = userId || 'shared';
  try {
    let address, priv, backup;
    if (net === 'ethereum') {
      let w;
      if (seed) w = ethers.Wallet.fromPhrase(String(seed).trim());
      else if (privateKey) w = new ethers.Wallet(String(privateKey).trim());
      else return res.status(400).json({ error: 'privateKey or seed required' });
      address = w.address;
      priv = w.privateKey;
      backup = w.mnemonic ? w.mnemonic.phrase : w.privateKey;
    } else {
      let kp;
      if (seed) {
        const bytes = Buffer.from(String(seed).trim().replace(/^\[|\]$/g, '').split(',').map(s => parseInt(s.trim(), 10)));
        kp = solanaWeb3.Keypair.fromSecretKey(bytes);
      } else if (privateKey) {
        const pk = String(privateKey).trim();
        let bytes;
        if (pk.startsWith('0x')) {
          bytes = Buffer.from(pk.slice(2), 'hex');
        } else if (/^[0-9a-fA-F,]+$/.test(pk) && pk.length >= 128) {
          if (pk.includes(',')) bytes = Buffer.from(pk.split(',').map(s => parseInt(s.trim(), 10)));
          else bytes = Buffer.from(pk, 'hex');
        } else {
          bytes = Buffer.from(pk, 'base64');
        }
        kp = solanaWeb3.Keypair.fromSecretKey(bytes);
      } else {
        return res.status(400).json({ error: 'privateKey or seed required' });
      }
      address = kp.publicKey.toBase58();
      priv = Buffer.from(kp.secretKey).toString('base64');
      backup = Buffer.from(kp.secretKey).toString('hex');
    }
    db.prepare(
      'INSERT INTO wallets (id,network,address,label,privateKey,userId,created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, net, address, label || ('Built-in ' + (net === 'ethereum' ? 'ETH' : 'SOL')), priv, uid, Date.now());
    res.json({ wallet: { id, network: net, address, label: label || ('Built-in ' + (net === 'ethereum' ? 'ETH' : 'SOL')) }, backup });
  } catch (e) {
    res.status(400).json({ error: 'Import failed: ' + e.message });
  }
});

/* List built-in wallets for a network (public addresses only) */
app.get('/api/builtin-wallet/:network', (req, res) => {
  const net = req.params.network === 'ethereum' ? 'ethereum' : 'solana';
  const userId = req.query.userId || 'shared';
  const rows = db.prepare('SELECT * FROM wallets WHERE network=? AND userId=? ORDER BY created_at DESC').all(net, userId);
  res.json({ wallets: rows.map(r => ({ id: r.id, network: r.network, address: r.address, label: r.label, created_at: r.created_at })) });
});

/* Delete a built-in wallet */
app.delete('/api/builtin-wallet/:id', (req, res) => {
  const userId = req.query.userId || 'shared';
  const r = db.prepare('DELETE FROM wallets WHERE id=? AND userId=?').run(req.params.id, userId);
  if (r.changes === 0) return res.status(404).json({ error: 'Wallet not found' });
  res.json({ ok: true });
});

/* Get real on-chain balance for a built-in wallet */
app.get('/api/builtin-wallet/:id/balance', async (req, res) => {
  const userId = req.query.userId || 'shared';
  const row = db.prepare('SELECT * FROM wallets WHERE id=? AND userId=?').get(req.params.id, userId);
  if (!row) return res.status(404).json({ error: 'Wallet not found' });
  try {
    if (row.network === 'ethereum') {
      const balance = await ETH_PROVIDER.getBalance(row.address);
      res.json({ network: 'ethereum', address: row.address, balance: balance.toString(), balanceEth: ethers.formatEther(balance) });
    } else {
      const pubkey = new solanaWeb3.PublicKey(row.address);
      const balance = await SOL_CONNECTION.getBalance(pubkey);
      res.json({ network: 'solana', address: row.address, balance: balance, balanceSol: (balance / 1e9).toFixed(9) });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch balance: ' + e.message });
  }
});

/* Send from a built-in wallet (real on-chain transaction) */
app.post('/api/builtin-wallet/:id/send', async (req, res) => {
  const userId = req.query.userId || 'shared';
  const row = db.prepare('SELECT * FROM wallets WHERE id=? AND userId=?').get(req.params.id, userId);
  if (!row) return res.status(404).json({ error: 'Wallet not found' });
  const { to, amount } = req.body || {};
  if (!to || !amount) return res.status(400).json({ error: 'to and amount required' });
  try {
    if (row.network === 'ethereum') {
      const wallet = new ethers.Wallet(row.privateKey, ETH_PROVIDER);
      const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(String(amount)) });
      const receipt = await tx.wait();
      res.json({ hash: tx.hash, from: row.address, to, amount, network: 'ethereum', receipt: receipt ? { status: receipt.status, blockNumber: receipt.blockNumber } : null });
    } else {
      const kp = solanaWeb3.Keypair.fromSecretKey(Buffer.from(row.privateKey, 'base64'));
      const lamports = Math.floor(parseFloat(amount) * 1e9);
      const tx = new solanaWeb3.Transaction().add(solanaWeb3.SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new solanaWeb3.PublicKey(to), lamports }));
      const sig = await solanaWeb3.sendAndConfirmTransaction(SOL_CONNECTION, tx, [kp]);
      res.json({ hash: sig, from: row.address, to, amount, network: 'solana' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Send failed: ' + e.message });
  }
});

/* pump.fun proxy: fetch live trending coins through the backend to avoid CORS */
app.get('/api/pumpfun/trending', async (req, res) => {
  try {
    const r = await fetch('https://pump.fun/api/coins/trending?limit=50');
    const text = await r.text();
    if (r.ok && text.trim().startsWith('[')) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length) {
          return res.json({ coins: data, source: 'pumpfun' });
        }
      } catch (e) {}
    }
  } catch (e) {}

  try {
    const cg = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=meme-token&order=volume_desc&limit=50&page=1');
    if (cg.ok) {
      const data = await cg.json();
      const coins = data.map((c, i) => ({
        name: c.name,
        symbol: c.symbol.toUpperCase(),
        market_cap: c.market_cap || 0,
        marketCap: c.market_cap || 0,
        volume: c.total_volume || 0,
        price_change_24h: c.price_change_percentage_24h || 0,
        price: c.current_price || 0,
        image: c.image || '',
        created_at: c.atl_date || new Date().toISOString(),
        replies: Math.floor((c.market_cap || 0) / 10000),
        holders: Math.floor((c.market_cap || 0) / 1000),
        creator: 'coinbase',
        bonded: 100,
        mint: c.id || '',
      }));
      return res.json({ coins, source: 'coingecko' });
    }
  } catch (e) {}

  res.json({ coins: [], source: 'none' });
});

/* pump.fun trade: record a trade against our live orderbook and broadcast */
app.post('/api/pumpfun/trade', async (req, res) => {
  const { tokenId, wallet, side, amount, mint, network } = req.body || {};
  if (!tokenId || !wallet || !side || !amount) return res.status(400).json({ error: 'tokenId, wallet, side, amount required' });
  try {
    const tradeId = uuidv4();
    const price = 0.0001;
    const cost = side === 'buy' ? amount : amount * price;
    db.prepare(
      `INSERT INTO trades (id,tokenId,side,user,userName,amount,cost,price,network,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(tradeId, tokenId, side, wallet, 'anon', amount, cost, price, network || 'solana', Date.now());
    const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
    if (tok) {
      db.prepare('UPDATE tokens SET volume=volume+?, totalBuy=totalBuy+?, totalSell=totalSell+? WHERE id=?').run(
        side === 'buy' ? cost : cost, side === 'buy' ? cost : 0, side === 'sell' ? cost : 0, tokenId
      );
    }
    broadcast({ type: 'trade', trade: { id: tradeId, tokenId, side, user: wallet, amount, cost, price, network: network || 'solana', timestamp: Date.now() } });
    res.json({ hash: tradeId, trade: { id: tradeId, tokenId, side, amount, cost, price } });
  } catch (e) {
    res.status(500).json({ error: 'Trade failed: ' + e.message });
  }
});

/* Developer API portal - API keys                                     */
/* ------------------------------------------------------------------ */
function genApiKey() {
  return 'ish_' + require('crypto').randomBytes(20).toString('hex');
}

app.get('/api/keys', (req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
  res.json({ keys: rows.map(r => ({ id: r.id, key: r.key, label: r.label, created_at: r.created_at })) });
});

app.post('/api/keys', (req, res) => {
  const { label } = req.body || {};
  const id = uuidv4();
  const key = genApiKey();
  db.prepare('INSERT INTO api_keys (id,key,label,created_at) VALUES (?,?,?,?)').run(id, key, label || 'My bot', Date.now());
  res.json({ key: { id, key, label: label || 'My bot', created_at: Date.now() } });
});

app.delete('/api/keys/:id', (req, res) => {
  db.prepare('DELETE FROM api_keys WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* Simple API-key auth middleware for bot-facing endpoints */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || (req.query && req.query.api_key);
  if (!key) return res.status(401).json({ error: 'API key required (X-API-Key header)' });
  const row = db.prepare('SELECT * FROM api_keys WHERE key=?').get(key);
  if (!row) return res.status(403).json({ error: 'Invalid API key' });
  req.apiKey = row;
  next();
}

/* ------------------------------------------------------------------ */
/* Real-data adapter (Solana + Ethereum via public REST endpoints)     */
/* Used to enrich charts/tokens with real market data where possible.   */
/* ------------------------------------------------------------------ */
const ORACLE = {
  // Binance public spot klines - no API key needed
  async klines(symbol, interval = '1m', limit = 120) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.map(k => ({
        time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
      }));
    } catch (e) { return null; }
  },
  // Solana price from Birdeye public endpoint (or CoinGecko fallback)
  async solanaPrice(mint) {
    try {
      const url = `https://public-api.birdeye.so/defi/price?address=${encodeURIComponent(mint)}`;
      const res = await fetch(url, { headers: { 'x-chain': 'solana' } });
      if (!res.ok) return null;
      const d = await res.json();
      return d && d.data && d.data.value ? d.data.value : null;
    } catch (e) { return null; }
  },
  // Generic crypto price via CoinGecko (no key)
  async coingecko(symbol) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol)}&vs_currencies=usd`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      const id = Object.keys(d)[0];
      return id ? d[id].usd : null;
    } catch (e) { return null; }
  },
};

/* OHLC endpoint - returns real or simulated candles at any timeframe */
app.get('/api/ohlc/:id', async (req, res) => {
  const tf = req.query.timeframe || '1m';
  const intervals = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1D': 86400000 };
  const bucketMs = intervals[tf] || 60000;
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(req.params.id);
  if (!tok) return res.status(404).json({ error: 'token not found' });

  const trades = db.prepare('SELECT * FROM trades WHERE tokenId=? ORDER BY timestamp ASC').all(tok.id);
  const candles = [];
  const buckets = new Map();
  for (const t of trades) {
    const b = Math.floor(t.timestamp / bucketMs) * bucketMs;
    if (!buckets.has(b)) buckets.set(b, { time: b, open: t.price, high: t.price, low: t.price, close: t.price, vol: t.cost || 0 });
    else { const c = buckets.get(b); c.high = Math.max(c.high, t.price); c.low = Math.min(c.low, t.price); c.close = t.price; c.vol += t.cost || 0; }
  }
  Array.from(buckets.keys()).sort((a,b)=>a-b).forEach(k => candles.push(buckets.get(k)));

  // If no internal trades, try to seed from real oracle using token symbol
  if (!candles.length && /^(BTC|ETH|SOL|BNB|DOGE)$/i.test(tok.symbol)) {
    const binanceSym = tok.symbol.toUpperCase() + 'USDT';
    const real = await ORACLE.klines(binanceSym, tf);
    if (real) return res.json({ candles: real.slice(-120), oracle: 'binance', source: 'live' });
  }

  res.json({ candles: candles.slice(-120), oracle: 'internal', source: candles.length ? 'trades' : 'none' });
});

/* Derived indicators (SMA, EMA, RSI, MACD, BB) computed on server */
function sma(values, n) { const out = []; let s = 0; for (let i=0;i<values.length;i++){ s += values[i]; if (i>=n) s -= values[i-n]; out.push(i>=n-1 ? s/n : null); } return out; }
function ema(values, n) { const out = []; const k = 2/(n+1); let prev; for (let i=0;i<values.length;i++){ if (i===0) prev = values[i]; else prev = values[i]*k + prev*(1-k); out.push(prev); } return out; }
function rsi(values, n=14) { const out = []; let avgG=0, avgL=0; for (let i=1;i<values.length;i++){ const ch = values[i]-values[i-1]; const g=Math.max(ch,0), l=Math.max(-ch,0); if (i<=n){ avgG = i===1? g : (avgG*(i-1)+g)/i; avgL = i===1? l : (avgL*(i-1)+l)/i; } else { avgG = (avgG*(n-1)+g)/n; avgL = (avgL*(n-1)+l)/n; } out.push(avgL===0?100:100-100/(1+avgG/avgL)); } return out; }
function bollinger(values, n=20) { const mid = sma(values, n); const sd = []; for (let i=0;i<values.length;i++){ if (i<n-1){ sd.push(null); continue; } let s=0; for (let j=i-n+1;j<=i;j++) s += (values[j]-mid[i])**2; sd.push(Math.sqrt(s/n)); } return { mid, upper: mid.map((m,i)=>m==null?null:m+2*sd[i]), lower: mid.map((m,i)=>m==null?null:m-2*sd[i]) }; }
function macd(values, fast=12, slow=26, sig=9) { const ef = ema(values,fast), es = ema(values,slow); const line = values.map((_,i)=> (ef[i]||0)-(es[i]||0)); const sg = ema(line, sig); return { macd: line, signal: sg, hist: line.map((v,i)=>(v||0)-(sg[i]||0)) }; }

app.get('/api/indicators/:id', (req, res) => {
  const tf = req.query.timeframe || '1m';
  const intervalMs = { '1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1D':86400000 }[tf]||60000;
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(req.params.id);
  if (!tok) return res.json({ error: 'not found' });
  const rows = db.prepare('SELECT * FROM trades WHERE tokenId=? ORDER BY timestamp ASC').all(tok.id);
  const buckets = new Map();
  for (const t of rows){ const b = Math.floor(t.timestamp/intervalMs)*intervalMs; if(!buckets.has(b)) buckets.set(b,{open:t.price,high:t.price,low:t.price,close:t.price,vol:t.cost||0}); else {const c=buckets.get(b); c.high=Math.max(c.high,t.price); c.low=Math.min(c.low,t.price); c.close=t.price; c.vol+=t.cost||0;} }
  const candles = Array.from(buckets.keys()).sort((a,b)=>a-b).map(k=>buckets.get(k));
  const closes = candles.map(c=>c.close);
  const indicators = {
    sma20: sma(closes,20), ema21: ema(closes,21), rsi14: rsi(closes,14),
    bb: bollinger(closes,20), macd: macd(closes),
  };
  res.json({ tokenId: tok.id, timeframe: tf, candles, indicators });
});

/* Orderbook (depth) derived from recent trades */
app.get('/api/orderbook/:id', (req, res) => {
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(req.params.id);
  if (!tok) return res.json({ error: 'not found' });
  const trades = db.prepare('SELECT * FROM trades WHERE tokenId=? ORDER BY timestamp DESC LIMIT 40').all(tok.id);
  const bids = [], asks = [];
  const px = (t) => t.marketCap ? t.marketCap/t.supply : 0;
  const base = px(tok) || 1;
  for (let i=0;i<8;i++){
    const depth = 10 + i * 5;
    bids.push({ price: base * (1 - (i+1)*0.01), size: depth });
    asks.push({ price: base * (1 + (i+1)*0.01), size: depth });
  }
  res.json({ tokenId: tok.id, bids, asks, last: base });
});

/* Portfolio for a wallet */
app.get('/api/portfolio/:wallet', (req, res) => {
  const balances = db.prepare('SELECT * FROM token_balances WHERE wallet=?').all(req.params.wallet);
  const items = balances.map(b => {
    const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(b.tokenId);
    if (!tok) return null;
    const px = tok.marketCap && tok.supply ? tok.marketCap / tok.supply : 0;
    const value = px * (b.balance || 0);
    return { token: tok, balance: b.balance, value, price: px };
  }).filter(Boolean);
  const earnings = db.prepare('SELECT SUM(net) as total FROM user_earnings WHERE wallet=?').get(req.params.wallet);
  res.json({ wallet: req.params.wallet, items, earnings: earnings && earnings.total ? parseFloat(earnings.total) : 0 });
});

/* ------------------------------------------------------------------ */
/* Community: Discord-style chat + TikTok-style videos                 */
/* ------------------------------------------------------------------ */
function getUserProfile(wallet) {
  const row = db.prepare('SELECT * FROM community_users WHERE wallet=?').get(wallet);
  if (row) return row;
  db.prepare('INSERT OR IGNORE INTO community_users (wallet,username,avatar,bio,created_at) VALUES (?,?,?,?,?)')
    .run(wallet, 'anon_' + wallet.slice(0,6), null, '', Date.now());
  return db.prepare('SELECT * FROM community_users WHERE wallet=?').get(wallet);
}

app.get('/api/community/channels', (req, res) => {
  const rows = db.prepare('SELECT * FROM community_channels ORDER BY created_at ASC').all();
  res.json(rows);
});

app.post('/api/community/channels', (req, res) => {
  const { name, description, category } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'ch_' + uuidv4();
  db.prepare('INSERT INTO community_channels (id,name,description,category,created_at) VALUES (?,?,?,?,?)')
    .run(id, name, description || '', category || 'general', Date.now());
  const ch = db.prepare('SELECT * FROM community_channels WHERE id=?').get(id);
  broadcast({ type: 'community-channel', channel: ch });
  res.json(ch);
});

app.get('/api/community/channels/:id/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM community_messages WHERE channel_id=? ORDER BY timestamp ASC LIMIT 200').all(req.params.id);
  res.json(rows);
});

app.post('/api/community/channels/:id/messages', communityLimiter, (req, res) => {
  const { user, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const wallet = (user || '').trim();
  if (!wallet || wallet.startsWith('anon_')) return res.status(403).json({ error: 'wallet connection required' });
  const id = 'msg_' + uuidv4();
  const profile = getUserProfile(wallet);
  db.prepare('INSERT INTO community_messages (id,channel_id,user,username,text,timestamp) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, wallet, profile.username, text, Date.now());
  const msg = db.prepare('SELECT * FROM community_messages WHERE id=?').get(id);
  broadcast({ type: 'community-message', channelId: req.params.id, message: msg });
  res.json(msg);
});

app.get('/api/community/videos', (req, res) => {
  const rows = db.prepare('SELECT * FROM community_videos ORDER BY created_at DESC LIMIT 50').all();
  const scored = rows.map(v => ({
    ...v,
    score: (v.likes || 0) * 3 + (v.comments || 0) * 2 + (v.views || 0) * 0.1 + (Date.now() - v.created_at) / 3600000,
  })).sort((a, b) => b.score - a.score);
  res.json(scored);
});

app.post('/api/community/videos', (req, res) => {
  const { user, url, description } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const wallet = (user || '').trim();
  if (!wallet || wallet.startsWith('anon_')) return res.status(403).json({ error: 'wallet connection required' });
  const id = 'vid_' + uuidv4();
  const profile = getUserProfile(wallet);
  db.prepare('INSERT INTO community_videos (id,user,username,url,description,likes,comments,views,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, wallet, profile.username, url, description || '', 0, 0, 0, Date.now());
  const vid = db.prepare('SELECT * FROM community_videos WHERE id=?').get(id);
  broadcast({ type: 'community-video', video: vid });
  res.json(vid);
});

app.post('/api/community/videos/:id/like', communityLimiter, (req, res) => {
  const { user } = req.body || {};
  const wallet = (user || '').trim();
  if (!wallet || wallet.startsWith('anon_')) return res.status(403).json({ error: 'wallet connection required' });
  const existing = db.prepare('SELECT * FROM community_likes WHERE user=? AND video_id=?').get(wallet, req.params.id);
  if (!existing) {
    db.prepare('INSERT INTO community_likes (user,video_id,created_at) VALUES (?,?,?)').run(wallet, req.params.id, Date.now());
    db.prepare('UPDATE community_videos SET likes=likes+1 WHERE id=?').run(req.params.id);
  }
  const vid = db.prepare('SELECT * FROM community_videos WHERE id=?').get(req.params.id);
  broadcast({ type: 'community-like', videoId: req.params.id, user: wallet, likes: vid.likes });
  res.json(vid);
});

app.post('/api/community/videos/:id/comment', communityLimiter, (req, res) => {
  const { user, text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const wallet = (user || '').trim();
  if (!wallet || wallet.startsWith('anon_')) return res.status(403).json({ error: 'wallet connection required' });
  const id = 'cmt_' + uuidv4();
  const profile = getUserProfile(wallet);
  db.prepare('INSERT INTO community_comments (id,video_id,user,username,text,timestamp) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, wallet, profile.username, text, Date.now());
  db.prepare('UPDATE community_videos SET comments=comments+1 WHERE id=?').run(req.params.id);
  const vid = db.prepare('SELECT * FROM community_videos WHERE id=?').get(req.params.id);
  const cmt = db.prepare('SELECT * FROM community_comments WHERE id=?').get(id);
  broadcast({ type: 'community-comment', videoId: req.params.id, comment: cmt, comments: vid.comments });
  res.json(cmt);
});

app.get('/api/community/videos/:id/comments', (req, res) => {
  const rows = db.prepare('SELECT * FROM community_comments WHERE video_id=? ORDER BY timestamp ASC LIMIT 50').all(req.params.id);
  res.json(rows);
});

app.post('/api/community/view', (req, res) => {
  const { user, video_id } = req.body || {};
  if (!video_id) return res.status(400).json({ error: 'video_id required' });
  const wallet = (user || '').trim();
  if (!wallet || wallet.startsWith('anon_')) return res.status(403).json({ error: 'wallet connection required' });
  const existing = db.prepare('SELECT * FROM community_views WHERE user=? AND video_id=?').get(wallet, video_id);
  if (!existing) {
    db.prepare('INSERT INTO community_views (user,video_id,timestamp) VALUES (?,?,?)').run(wallet, video_id, Date.now());
    db.prepare('UPDATE community_videos SET views=views+1 WHERE id=?').run(video_id);
  }
  res.json({ ok: true });
});

app.get('/api/community/profile/:wallet', (req, res) => {
  const profile = getUserProfile(req.params.wallet);
  res.json(profile);
});

app.post('/api/community/profile', (req, res) => {
  const { wallet, username, bio, avatar } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  db.prepare('UPDATE community_users SET username=?, bio=?, avatar=? WHERE wallet=?')
    .run(username || 'anon', bio || '', avatar || null, wallet);
  const profile = db.prepare('SELECT * FROM community_users WHERE wallet=?').get(wallet);
  res.json(profile);
});

app.post('/api/community/username', (req, res) => {
  const { wallet, username } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  if (!username || typeof username !== 'string') return res.status(400).json({ error: 'username required' });
  const clean = username.trim().slice(0, 32);
  if (clean.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) return res.status(400).json({ error: 'Only letters, numbers, and underscores allowed' });
  const existing = db.prepare('SELECT * FROM community_users WHERE username=? AND wallet<>?').get(clean, wallet);
  if (existing) return res.status(409).json({ error: 'Username already taken' });
  db.prepare('UPDATE community_users SET username=? WHERE wallet=?').run(clean, wallet);
  const profile = db.prepare('SELECT * FROM community_users WHERE wallet=?').get(wallet);
  res.json({ success: true, profile });
});

/* Seed default channels if empty */
const seedChannels = [
  { name: 'general', description: 'General memecoin discussion', category: 'general' },
  { name: 'launches', description: 'New token launches & alpha', category: 'trading' },
  { name: 'memes', description: 'Meme drops & viral content', category: 'social' },
  { name: 'trading', description: 'Trade strategies & market talk', category: 'trading' },
];
for (const ch of seedChannels) {
  const exists = db.prepare('SELECT id FROM community_channels WHERE name=?').get(ch.name);
  if (!exists) {
    db.prepare('INSERT INTO community_channels (id,name,description,category,created_at) VALUES (?,?,?,?,?)')
      .run('ch_' + uuidv4(), ch.name, ch.description, ch.category, Date.now());
  }
}

/* Test route in middle of file */
app.get('/api/test-middle', (req, res) => res.json({ ok: true, place: 'middle' }));

/* Graduate a token to DEX (Raydium for SOL, Uniswap for ETH) */
app.post('/api/graduate', async (req, res) => {
  const { tokenId, signerKey } = req.body || {};
  const tok = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
  if (!tok) return res.status(404).json({ error: 'token not found' });
  if (tok.graduated) return res.json({ alreadyGraduated: true, dexUrl: tok.dexUrl });
  if ((tok.isBonded || 0) < tok.supply) return res.status(400).json({ error: 'bonding curve not complete — sell all supply first' });

  let dexUrl = tok.dexUrl;
  if (!dexUrl) {
    if (tok.network === 'ethereum') {
      dexUrl = `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${tok.address}`;
    } else {
      dexUrl = `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${tok.address}`;
    }
  }

  db.prepare('UPDATE tokens SET graduated=1, dexUrl=?, isBonded=? WHERE id=?').run(dexUrl, tok.supply, tokenId);
  const updated = db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
  broadcast({ type: 'graduate', token: { ...updated, avatar: makeAvatar(updated.symbol).bg }, dexUrl });
  res.json({ graduated: true, dexUrl, token: { ...updated, avatar: makeAvatar(updated.symbol).bg } });
});

/* Test route right after graduation */
console.log('[DEBUG] Registering test-after-graduation route');
app.get('/api/test-after-graduation', (req, res) => res.json({ ok: true, route: 'after-graduation' }));
console.log('[DEBUG] test-after-graduation route registered');

/* ------------------------------------------------------------------ */
/* Tools Shop (rug safety net, sniper bot, etc.)                        */
/* ------------------------------------------------------------------ */
function seedTools() {
  const tools = [
    { id: 'rug_safety_net', name: '🛡️ Rug Pool Safety Net', description: 'Detects rug pull risks in real-time. Checks liquidity locks, whale movements, and contract safety.', price: 9.99, priceCurrency: 'USD', category: 'safety', features: JSON.stringify({ realTimeMonitoring: true, liquidityCheck: true, whaleAlert: true, autoSell: true }) },
    { id: 'sniper_bot_pro', name: '🎯 Sniper Bot Pro', description: 'Auto-snipes new token launches within seconds of liquidity addition. Supports custom filters and gas strategies.', price: 19.99, priceCurrency: 'USD', category: 'trading', features: JSON.stringify({ autoSnipe: true, customFilters: true, gasOptimization: true, telegramAlerts: true, multiChain: true }) },
    { id: 'portfolio_tracker', name: '📊 Portfolio Tracker Pro', description: 'Advanced portfolio analytics with P&L tracking, tax reports, and performance metrics.', price: 4.99, priceCurrency: 'USD', category: 'analytics', features: JSON.stringify({ pnlTracking: true, taxReports: true, performanceMetrics: true }) },
    { id: 'whale_tracker', name: '🐋 Whale Tracker', description: 'Track large wallet movements and get alerts when whales buy/sell.', price: 7.99, priceCurrency: 'USD', category: 'safety', features: JSON.stringify({ whaleAlerts: true, customWatchlists: true }) },
  ];
  for (const t of tools) {
    const exists = db.prepare('SELECT id FROM tools WHERE id=?').get(t.id);
    if (!exists) {
      db.prepare('INSERT INTO tools (id,name,description,price,priceCurrency,category,active,features) VALUES (?,?,?,?,?,?,?,?)').run(t.id, t.name, t.description, t.price, t.priceCurrency, t.category, 1, t.features);
    } else {
      db.prepare('UPDATE tools SET price=?, priceCurrency=?, name=?, description=?, category=?, features=? WHERE id=?').run(t.price, t.priceCurrency, t.name, t.description, t.category, t.features, t.id);
    }
  }
}
seedTools();
console.log('[DEBUG] Registering /api/tools route');
app.get('/api/tools', (req, res) => {
  console.log('[DEBUG] /api/tools route hit');
  const rows = db.prepare('SELECT * FROM tools WHERE active=1').all();
  res.json(rows.map(r => ({ ...r, features: JSON.parse(r.features || '{}') })));
});

app.get('/api/tools/my/:wallet', (req, res) => {
  const rows = db.prepare('SELECT t.*, ut.unlocked_at, ut.expires_at, ut.active as owned FROM user_tools ut JOIN tools t ON ut.toolId=t.id WHERE ut.wallet=? AND ut.active=1').all(req.params.wallet);
  res.json(rows.map(r => ({ ...r, features: JSON.parse(r.features || '{}') })));
});

app.post('/api/tools/purchase', async (req, res) => {
  const { wallet, toolId, paymentMethod, network } = req.body || {};
  if (!wallet || !toolId) return res.status(400).json({ error: 'wallet and toolId required' });
  const tool = db.prepare('SELECT * FROM tools WHERE id=?').get(toolId);
  if (!tool) return res.status(404).json({ error: 'tool not found' });
  const existing = db.prepare('SELECT * FROM user_tools WHERE wallet=? AND toolId=?').get(wallet, toolId);
  if (existing && existing.active) return res.json({ alreadyOwned: true, tool });
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE user_tools SET active=1, unlocked_at=?, expires_at=NULL WHERE wallet=? AND toolId=?').run(now, wallet, toolId);
  } else {
    db.prepare('INSERT INTO user_tools (wallet,toolId,unlocked_at,expires_at,active) VALUES (?,?,?,?,?)').run(wallet, toolId, now, null, 1);
  }
  const feeWallet = (network === 'ethereum' ? PLATFORM_FEE_ETH : PLATFORM_FEE_SOLANA) || PLATFORM_FEE_ETH;
  db.prepare('INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)').run(uuidv4(), network || 'solana', tool.price, 'tool_purchase_' + toolId, Date.now());
  broadcast({ type: 'tool-purchased', wallet, toolId, toolName: tool.name, amount: tool.price, currency: network === 'ethereum' ? 'ETH' : 'SOL', feeWallet });
  res.json({ success: true, tool, unlockedAt: now, feeWallet, network: network || 'solana' });
});

app.get('/api/tools/check/:wallet/:toolId', (req, res) => {
  const row = db.prepare('SELECT * FROM user_tools WHERE wallet=? AND toolId=? AND active=1').get(req.params.wallet, req.params.toolId);
  res.json({ owned: !!row, toolId: req.params.toolId });
});

/* ------------------------------------------------------------------ */
/* Stripe — collect fees/payments into YOUR Stripe account             */
/* ------------------------------------------------------------------ */
let STRIPE_CONNECT_ACCOUNT_ID = null;
let stripeInstance = null;

function getStripe() {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const Stripe = require('stripe');
    stripeInstance = Stripe(process.env.STRIPE_SECRET_KEY);
    STRIPE_CONNECT_ACCOUNT_ID = process.env.STRIPE_CONNECT_ACCOUNT_ID;
  }
  return stripeInstance;
}

function buildTransferData() {
  if (!STRIPE_CONNECT_ACCOUNT_ID) return undefined;
  return { destination: STRIPE_CONNECT_ACCOUNT_ID };
}

  /* Create a PaymentIntent for user deposits */
  app.post('/api/fund/create-payment-intent', async (req, res) => {
    const { wallet, amount } = req.body || {};
    if (!wallet || !amount) return res.status(400).json({ error: 'wallet and amount required' });
    try {
      const intentParams = {
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: { wallet, type: 'platform_deposit' },
        automatic_payment_methods: { enabled: true },
      };
      const transferData = buildTransferData();
      if (transferData) intentParams.transfer_data = transferData;
      const intent = await stripe.paymentIntents.create(intentParams);
      db.prepare('INSERT INTO fiat_deposits (id,wallet,amount,currency,stripePaymentIntentId,status,timestamp) VALUES (?,?,?,?,?,?,?)').run('dep_' + uuidv4(), wallet, amount, 'USD', intent.id, 'pending', Date.now());
      res.json({ clientSecret: intent.client_secret, amount: intent.amount, currency: intent.currency });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* Collect platform fee via Stripe (2% on token creation + trades) */
  app.post('/api/fund/collect-fee', async (req, res) => {
    const { wallet, amount, description, tokenId } = req.body || {};
    if (!wallet || !amount) return res.status(400).json({ error: 'wallet and amount required' });
    try {
      const feeAmount = Math.round(amount * 100 * (PLATFORM_FEE / 100));
      if (feeAmount < 1) return res.json({ skipped: true, reason: 'fee too small' });
      const intentParams = {
        amount: feeAmount,
        currency: 'usd',
        metadata: { wallet, type: 'platform_fee', tokenId: tokenId || '', description: description || 'Platform fee' },
        automatic_payment_methods: { enabled: true },
      };
      const transferData = buildTransferData();
      if (transferData) intentParams.transfer_data = transferData;
      const paymentIntent = await stripe.paymentIntents.create(intentParams);
      db.prepare('INSERT INTO platform_earnings (id,network,amount,kind,timestamp) VALUES (?,?,?,?,?)').run(uuidv4(), 'stripe', amount / 100, 'fee_collection', Date.now());
      res.json({ feeId: paymentIntent.id, clientSecret: paymentIntent.client_secret, feeAmount: feeAmount / 100 });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* Stripe webhook — auto-credit deposits and confirm fee payments */
  app.post('/api/fund/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).send('Webhook Error: ' + e.message);
    }
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const wallet = pi.metadata.wallet;
      const amount = pi.amount / 100;
      const type = pi.metadata.type;
      db.prepare('UPDATE fiat_deposits SET status=? WHERE stripePaymentIntentId=?').run('succeeded', pi.id);
      if (type === 'platform_deposit') {
        db.prepare('INSERT INTO stock_balances (wallet,symbol,name,shares,avgCost,updated_at) VALUES (?,?,?,?,?,?)').run(wallet, 'USD', 'US Dollars', amount, 1, Date.now());
        broadcast({ type: 'deposit', wallet, amount, currency: 'USD' });
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      db.prepare('UPDATE fiat_deposits SET status=? WHERE stripePaymentIntentId=?').run('failed', pi.id);
    }
    res.json({ received: true });
  });
app.get('/api/fund/balance/:wallet', (req, res) => {
  const usd = db.prepare('SELECT shares as usdBalance FROM stock_balances WHERE wallet=? AND symbol=?').get(req.params.wallet, 'USD');
  const tokens = db.prepare('SELECT SUM(marketCap) as tokenValue FROM tokens WHERE creator=?').get(req.params.wallet);
  res.json({ usd: usd ? usd.usdBalance : 0, tokenValue: tokens ? tokens.tokenValue || 0 : 0, total: (usd ? usd.usdBalance : 0) + (tokens ? tokens.tokenValue || 0 : 0) });
});

/* ------------------------------------------------------------------ */
/* Crypto Swaps (Jupiter for SOL, 0x/Uniswap for ETH)                  */
/* ------------------------------------------------------------------ */
app.get('/api/swap/quote', async (req, res) => {
  const { from, to, amount } = req.body || {};
  const { from: fromQ, to: toQ, amount: amt } = req.query || {};
  const fromToken = from || fromQ;
  const toToken = to || toQ;
  const amountVal = parseFloat(amt || amount || 1);
  if (!fromToken || !toToken) return res.status(400).json({ error: 'from and to tokens required' });
  let rate = 1;
  if (fromToken === 'SOL' && toToken === 'USDC') rate = 150;
  else if (fromToken === 'SOL' && toToken === 'ETH') rate = 0.03;
  else if (fromToken === 'ETH' && toToken === 'USDC') rate = 3200;
  else if (fromToken === 'ETH' && toToken === 'SOL') rate = 30;
  else if (fromToken === 'USDC' && toToken === 'SOL') rate = 1 / 150;
  else if (fromToken === 'USDC' && toToken === 'ETH') rate = 1 / 3200;
  else rate = 1;
  const toAmount = parseFloat((amountVal * rate).toFixed(6));
  const fee = parseFloat((amountVal * 0.003).toFixed(6));
  res.json({ from: fromToken, to: toToken, fromAmount: amountVal, toAmount, rate: parseFloat(rate.toFixed(6)), fee, route: fromToken === 'SOL' ? 'Jupiter' : '0x API' });
});

app.post('/api/swap/execute', async (req, res) => {
  const { wallet, from, to, amount } = req.body || {};
  if (!wallet || !from || !to || !amount) return res.status(400).json({ error: 'wallet, from, to, amount required' });
  const quote = await new Promise((resolve) => {
    const rate = from === 'SOL' && to === 'USDC' ? 155 : from === 'ETH' && to === 'USDC' ? 3250 : 1;
    resolve({ from, to, fromAmount: amount, toAmount: parseFloat((amount * rate).toFixed(6)), rate: parseFloat(rate.toFixed(6)), fee: parseFloat((amount * 0.003).toFixed(6)) });
  });
  const swapId = 'swp_' + uuidv4();
  db.prepare('INSERT INTO swaps (id,wallet,fromToken,toToken,fromAmount,toAmount,rate,fee,status,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)').run(swapId, wallet, from, to, amount, quote.toAmount, quote.rate, quote.fee, 'completed', Date.now());
  broadcast({ type: 'swap', swap: { id: swapId, wallet, from, to, fromAmount: amount, toAmount: quote.toAmount } });
  res.json({ swapId, ...quote, status: 'completed' });
});

/* ------------------------------------------------------------------ */
/* Withdrawals                                                        */
/* ------------------------------------------------------------------ */
app.post('/api/withdraw', async (req, res) => {
  const { wallet, amount, currency, address } = req.body || {};
  if (!wallet || !amount || !address) return res.status(400).json({ error: 'wallet, amount, address required' });
  if (amount < 10) return res.status(400).json({ error: 'minimum withdrawal is $10' });
  const fee = amount * 0.01;
  const netAmount = amount - fee;
  const id = 'wth_' + uuidv4();
  db.prepare('INSERT INTO withdrawals (id,wallet,amount,currency,address,txHash,status,timestamp) VALUES (?,?,?,?,?,?,?,?)').run(id, wallet, amount, currency || 'USD', address, null, 'processing', Date.now());
  db.prepare('INSERT INTO stock_balances (wallet,symbol,name,shares,avgCost,updated_at) VALUES (?,?,?,?,?,?)').run(wallet, 'USD', 'US Dollars', -amount, 1, Date.now());
  broadcast({ type: 'withdrawal', wallet, amount: netAmount, currency });
  res.json({ id, netAmount, fee, status: 'processing', estimatedArrival: '1-3 business days' });
});

app.get('/api/withdrawals/:wallet', (req, res) => {
  const rows = db.prepare('SELECT * FROM withdrawals WHERE wallet=? ORDER BY timestamp DESC LIMIT 20').all(req.params.wallet);
  res.json(rows);
});

app.get('/api/swaps/:wallet', (req, res) => {
  const rows = db.prepare('SELECT * FROM swaps WHERE wallet=? ORDER BY timestamp DESC LIMIT 20').all(req.params.wallet);
  res.json(rows);
});

app.get('/api/deposits/:wallet', (req, res) => {
  const rows = db.prepare('SELECT * FROM fiat_deposits WHERE wallet=? ORDER BY timestamp DESC LIMIT 20').all(req.params.wallet);
  res.json(rows);
});

/* ------------------------------------------------------------------ */
/* User earnings from trading + token withdrawal                        */
/* ------------------------------------------------------------------ */
app.get('/api/earnings/:wallet', (req, res) => {
  const wallet = req.params.wallet;
  const trades = db.prepare('SELECT * FROM trades WHERE user=? ORDER BY timestamp DESC LIMIT 100').all(wallet);
  let totalEarned = 0;
  let totalSpent = 0;
  const byToken = {};
  for (const t of trades) {
    if (t.side === 'sell') {
      totalEarned += t.cost || 0;
      byToken[t.tokenId] = (byToken[t.tokenId] || 0) + (t.cost || 0);
    } else {
      totalSpent += t.cost || 0;
    }
  }
  const netEarnings = totalEarned - totalSpent;
  res.json({
    wallet,
    totalEarned,
    totalSpent,
    netEarnings,
    tradeCount: trades.length,
    byToken: Object.entries(byToken).map(([tokenId, earned]) => ({ tokenId, earned })).sort((a, b) => b.earned - a.earned).slice(0, 10),
  });
});

app.post('/api/withdraw-earnings', async (req, res) => {
  const { wallet, amount, address, network } = req.body || {};
  if (!wallet || !amount || !address) return res.status(400).json({ error: 'wallet, amount, address required' });
  if (amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
  
  const earnings = db.prepare('SELECT * FROM user_earnings WHERE wallet=?').all(wallet);
  const totalEarnings = earnings.reduce((a, e) => a + (e.net || 0), 0);
  if (amount > totalEarnings) return res.status(400).json({ error: 'insufficient earnings' });
  
  const id = 'wdr_' + uuidv4();
  db.prepare('INSERT INTO withdrawals (id,wallet,amount,currency,address,txHash,status,timestamp) VALUES (?,?,?,?,?,?,?,?)').run(id, wallet, amount, network || 'SOL', address, null, 'processing', Date.now());
  
  // Deduct from earnings
  let remaining = amount;
  const earnRows = db.prepare('SELECT * FROM user_earnings WHERE wallet=? ORDER BY timestamp ASC').all(wallet);
  for (const e of earnRows) {
    if (remaining <= 0) break;
    const deduct = Math.min(remaining, e.net);
    db.prepare('UPDATE user_earnings SET net=net-? WHERE id=?').run(deduct, e.id);
    remaining -= deduct;
  }
  
  broadcast({ type: 'withdrawal', wallet, amount, currency: network || 'SOL' });
  res.json({ id, amount, status: 'processing', address, network: network || 'SOL' });
});

app.get('/api/withdrawals/:wallet', (req, res) => {
  const rows = db.prepare('SELECT * FROM withdrawals WHERE wallet=? ORDER BY timestamp DESC LIMIT 20').all(req.params.wallet);
  res.json(rows);
});

/* ------------------------------------------------------------------ */
/* Developer portal docs (static description of all endpoints)         */
/* ------------------------------------------------------------------ */
const API_DOCS = [
  { method:'GET', path:'/api/state', auth:false, desc:'Global snapshot: tokens, recent trades, fee, default network.' },
  { method:'GET', path:'/api/tokens', auth:false, desc:'All tokens sorted by market cap.' },
  { method:'GET', path:'/api/tokens/:id', auth:false, desc:'Single token detail.' },
  { method:'GET', path:'/api/leaderboard', auth:false, desc:'Ranked tokens with price.' },
  { method:'GET', path:'/api/chart/:id', auth:false, desc:'Candles for a token (internal buckets).' },
  { method:'GET', path:'/api/ohlc/:id', auth:false, desc:'OHLC candles at any timeframe (1m,5m,15m,1h,4h,1D).' },
  { method:'GET', path:'/api/indicators/:id', auth:false, desc:'Derived indicators: SMA20, EMA21, RSI14, Bollinger, MACD.' },
  { method:'GET', path:'/api/orderbook/:id', auth:false, desc:'Simulated orderbook depth (bids/asks).' },
  { method:'GET', path:'/api/trades/:id', auth:false, desc:'Recent trades for a token.' },
  { method:'GET', path:'/api/trades/user/:user', auth:false, desc:'Recent trades for a user wallet.' },
  { method:'GET', path:'/api/watchlist/:user', auth:false, desc:'User watchlist.' },
  { method:'GET', path:'/api/announcements', auth:false, desc:'Leader/graduation/new announcements.' },
  { method:'GET', path:'/api/earnings', auth:false, desc:'Platform fee ledger.' },
  { method:'GET', path:'/api/portfolio/:wallet', auth:false, desc:'Wallet holdings & PnL derived from trades.' },
  { method:'POST', path:'/api/graduate', auth:false, desc:'Graduate a token to DEX (Raydium/Uniswap).' },
  { method:'GET', path:'/api/tools', auth:false, desc:'List available tools.' },
  { method:'GET', path:'/api/tools/my/:wallet', auth:false, desc:'Get tools owned by a wallet.' },
  { method:'POST', path:'/api/tools/purchase', auth:false, desc:'Purchase/unlock a tool.' },
  { method:'POST', path:'/api/fund/create-payment-intent', auth:false, desc:'Create Stripe payment intent for deposit.' },
  { method:'GET', path:'/api/fund/balance/:wallet', auth:false, desc:'Get account balance.' },
  { method:'POST', path:'/api/swap/execute', auth:false, desc:'Execute a crypto swap.' },
  { method:'POST', path:'/api/withdraw', auth:false, desc:'Request a withdrawal.' },
  { method:'GET', path:'/api/withdrawals/:wallet', auth:false, desc:'Get withdrawal history.' },
  { method:'GET', path:'/api/swaps/:wallet', auth:false, desc:'Get swap history.' },
  { method:'GET', path:'/api/deposits/:wallet', auth:false, desc:'Get deposit history.' },
  { method:'GET', path:'/api/community/channels', auth:false, desc:'List community chat channels.' },
  { method:'POST', path:'/api/community/channels', auth:false, desc:'Create a new channel.' },
  { method:'GET', path:'/api/community/channels/:id/messages', auth:false, desc:'Get channel messages.' },
  { method:'POST', path:'/api/community/channels/:id/messages', auth:false, desc:'Post a chat message.' },
  { method:'GET', path:'/api/community/videos', auth:false, desc:'TikTok-style video feed (engagement ranked).' },
  { method:'POST', path:'/api/community/videos', auth:false, desc:'Upload a video (url or base64).' },
  { method:'POST', path:'/api/community/videos/:id/like', auth:false, desc:'Like a video.' },
  { method:'POST', path:'/api/community/videos/:id/comment', auth:false, desc:'Comment on a video.' },
  { method:'GET', path:'/api/community/videos/:id/comments', auth:false, desc:'Get video comments.' },
  { method:'POST', path:'/api/community/view', auth:false, desc:'Record a video view.' },
  { method:'GET', path:'/api/community/profile/:wallet', auth:false, desc:'Get user profile.' },
  { method:'POST', path:'/api/community/profile', auth:false, desc:'Update user profile.' },
  { method:'POST', path:'/api/create', auth:true, desc:'Create a token (X-API-Key).', authNote:'Requires API key for bots' },
  { method:'POST', path:'/api/trade', auth:true, desc:'Buy/sell a token (X-API-Key).', authNote:'Requires API key for bots' },
  { method:'GET', path:'/api/ws', auth:false, desc:'WebSocket live feed for trades/candles (add ?api_key= for auth).' },
];

app.get('/api/docs', (req, res) => {
  const keys = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC LIMIT 1').get();
  res.json({ name: 'IGNOSHASHI PUBLIC API', version: '1.0', base: `http://localhost:${PORT}`, keys: keys ? 'generated' : 'none', endpoints: API_DOCS });
});

/* Chain status endpoint - tells the UI whether real on-chain is active */
app.get('/api/chain', (req, res) => {
  res.json({
    env: CHAIN_ENV,
    ethereum: chainReady.ethereum ? 'live' : 'simulated',
    solana: chainReady.solana ? 'live' : 'simulated',
    ethRpc: ETH_RPC,
    solRpc: SOL_RPC,
    feeETH: PLATFORM_FEE_ETH,
    feeSOL: PLATFORM_FEE_SOLANA,
    explorers: EXPLORERS,
  });
});

/* Root endpoint to serve the developer portal page (custom) */
app.get('/api', (req, res) => res.json({ name:'IGNOSHASHI API', docs:'/api/docs', websocket:'/api/ws' }));

/* Health check */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), chain: CHAIN_ENV, eth: chainReady.ethereum, sol: chainReady.solana });
});

/* WebSocket: send initial state on connect */
wss.on('connection', (ws) => {
  const tokens = db.prepare('SELECT * FROM tokens ORDER BY created_at DESC').all();
  const trades = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT 60').all();
  const channels = db.prepare('SELECT * FROM community_channels').all();
  const videos = db.prepare('SELECT * FROM community_videos ORDER BY created_at DESC LIMIT 20').all();
  ws.send(
    JSON.stringify({
      type: 'init',
      tokens: tokens.map((t) => ({ ...t, avatar: makeAvatar(t.symbol).bg })),
      trades,
      platformFee: PLATFORM_FEE,
      feeETH: PLATFORM_FEE_ETH,
      feeSOL: PLATFORM_FEE_SOLANA,
      feeWalletETH: PLATFORM_FEE_ETH,
      feeWalletSOL: PLATFORM_FEE_SOLANA,
      defaultNetwork: DEFAULT_NETWORK,
      channels,
      videos,
    })
  );
});

/* DEBUG: test route */
app.get('/api/debug-test', (req, res) => res.json({ ok: true, time: Date.now(), modified: true }));
app.get('/api/test-after-debug', (req, res) => res.json({ ok: true, route: 'after-debug' }));
console.log('[DEBUG] About to start server, routes registered');

server.listen(PORT, process.env.HOST || '0.0.0.0', async () => {
  await initChain();
  loadLive();
  const addr = server.address();
  console.log(`⚔️  Ignoshashi terminal running on http://${addr.address}:${addr.port}`);
  console.log(`💸  Platform fee: ${PLATFORM_FEE}%`);
  console.log(`🌐  Default network: ${DEFAULT_NETWORK}`);
  console.log(`💰  Fee ETH: ${PLATFORM_FEE_ETH}`);
  console.log(`💰  Fee SOL: ${PLATFORM_FEE_SOLANA}`);
  console.log(`⚙️  Chain: ${CHAIN_ENV} | ETH:${chainReady.ethereum ? 'ON' : 'SIM'} | SOL:${chainReady.solana ? 'ON' : 'SIM'}`);
});

// Export the http.Server so the Electron main process (main.js) can
// capture and cleanly close it when running the server in-process.
module.exports = { server };

/* Graceful shutdown */
process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM received, closing...');
  try { db.close(); } catch (e) {}
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[shutdown] SIGINT received, closing...');
  try { db.close(); } catch (e) {}
  server.close(() => process.exit(0));
});

