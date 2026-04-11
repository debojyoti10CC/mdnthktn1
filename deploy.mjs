/**
 * OrphanLink — Midnight Deployment Script
 * Adapted from Midnight-Fix (github.com/Debanjannnn/Midnight-Fix)
 *
 * Handles:
 * - Wallet initialization from nightforge seed
 * - DUST registration and accrual
 * - ZK proof generation via proof server
 * - Contract deployment to Midnight Preprod or Local
 *
 * Usage:
 *   node deploy.mjs                    # Deploy to preprod (default)
 *   node deploy.mjs --network local    # Deploy to local dev
 */

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { createKeystore, InMemoryTransactionHistoryStorage, PublicKey, UnshieldedWallet } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import * as Rx from 'rxjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';

globalThis.WebSocket = WebSocket;

// ─── Network Configuration ──────────────────────────
const args = process.argv.slice(2);
const networkFlag = args.includes('--network') ? args[args.indexOf('--network') + 1] : 'preprod';

const NETWORKS = {
  preprod: {
    id: 'preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWs: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: 'http://127.0.0.1:6300',
  },
  local: {
    id: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v3/graphql',
    indexerWs: 'ws://127.0.0.1:8088/api/v3/graphql/ws',
    node: 'http://127.0.0.1:9944',
    proofServer: 'http://127.0.0.1:6300',
  },
};

const NET = NETWORKS[networkFlag] || NETWORKS.preprod;
console.log(`\n🌙  OrphanLink Deployment — ${networkFlag.toUpperCase()}`);
console.log(`    Indexer:      ${NET.indexer}`);
console.log(`    Node:         ${NET.node}`);
console.log(`    Proof Server: ${NET.proofServer}\n`);

// ─── Wallet Loading ──────────────────────────────────
const homeDir = os.homedir();
const walletDir = path.join(homeDir, '.nightforge', 'wallets');

if (!fs.existsSync(walletDir)) {
  console.error('❌ No nightforge wallet found. Run: npx nightforge wallet create');
  process.exit(1);
}

const walletFiles = fs.readdirSync(walletDir).filter(f => f.endsWith('.json'));
if (walletFiles.length === 0) {
  console.error('❌ No wallet files found in', walletDir);
  process.exit(1);
}

const walletFile = walletFiles[0];
const walletData = JSON.parse(fs.readFileSync(path.join(walletDir, walletFile), 'utf8'));
console.log(`💳  Wallet: ${walletData.name} | ${walletData.address}`);

// ─── Key Derivation ──────────────────────────────────
function deriveKeysFromSeed(seed) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

// ─── Transaction Signing ─────────────────────────────
function signTransactionIntents(tx, signFn, proofMarker) {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize('signature', proofMarker, 'pre-binding', intent.serialize());
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_, i) => cloned.fallibleUnshieldedOffer.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_, i) => cloned.guaranteedUnshieldedOffer.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

// ─── Wallet + Midnight Provider ──────────────────────
async function createWalletAndMidnightProvider(ctx) {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx);
    },
  };
}

// ─── Main Deploy Flow ────────────────────────────────
async function deploy() {
  setNetworkId(NET.id);

  // 1. Load compiled contract
  const zkConfigPath = path.resolve('contracts', 'managed', 'OrphanLink');
  if (!fs.existsSync(zkConfigPath)) {
    console.error(`❌ Compiled contract not found at ${zkConfigPath}`);
    console.error('   Run: npx nightforge compile');
    process.exit(1);
  }

  const contractModule = await import(path.resolve(zkConfigPath, 'contract', 'index.js'));
  const compiledContract = CompiledContract.make('OrphanLink', contractModule.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  console.log('📄  Contract loaded.');

  // 2. Derive keys from wallet seed
  const keys = deriveKeysFromSeed(walletData.seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  // 3. Initialize wallet
  const walletConfig = {
    networkId: getNetworkId(),
    indexerClientConnection: { indexerHttpUrl: NET.indexer, indexerWsUrl: NET.indexerWs },
    provingServerUrl: new URL(NET.proofServer),
    relayURL: new URL(NET.node.replace(/^http/, 'ws')),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  };

  console.log('🔑  Initializing wallet...');
  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  console.log('⏳  Syncing wallet...');

  // Wait for sync
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5000),
      Rx.filter((s) => s.isSynced),
    ),
  );
  console.log('✅  Wallet synced.');

  // 4. Check tNIGHT balance
  let state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const balance = state.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  console.log(`💰  tNIGHT balance: ${balance.toLocaleString()}`);

  if (balance === 0n) {
    console.error('\n❌ No tNIGHT balance. Fund your wallet:');
    console.error(`   ${networkFlag === 'local' ? 'yarn fund-and-register-dust "<seed>"' : 'https://faucet.preprod.midnight.network/'}`);
    console.error(`   Wallet address: ${walletData.address}`);
    await wallet.stop();
    process.exit(1);
  }

  // 5. Register UTXOs for DUST generation
  if (state.dust.availableCoins.length === 0) {
    const nightUtxos = state.unshielded.availableCoins.filter(
      (c) => c.meta?.registeredForDustGeneration !== true,
    );
    if (nightUtxos.length > 0) {
      console.log(`🔧  Registering ${nightUtxos.length} NIGHT UTXO(s) for DUST generation...`);
      const recipe = await wallet.registerNightUtxosForDustGeneration(
        nightUtxos,
        unshieldedKeystore.getPublicKey(),
        (p) => unshieldedKeystore.signData(p),
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      await wallet.submitTransaction(finalized);
      console.log('📝  Registration submitted.');
    }

    console.log('⏳  Waiting for DUST to accrue (2-5 minutes)...');
    await Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }

  state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const dustBal = state.dust.balance(new Date());
  console.log(`⚡  DUST balance: ${dustBal.toLocaleString()}`);

  // 6. Build providers
  const walletProvider = await createWalletAndMidnightProvider({
    wallet,
    shieldedSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
  });
  const accountId = walletProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'orphanlink-private-state',
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(NET.indexer, NET.indexerWs),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(NET.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // 7. Deploy
  console.log('\n🚀  Deploying OrphanLink contract (30-60 seconds)...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'orphanLinkState',
    initialPrivateState: {},
    args: [],
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   🎉  ORPHANLINK CONTRACT DEPLOYED!      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Address:  ${contractAddress}`);
  console.log(`║  Network:  ${NET.id}`);
  console.log(`║  Deployer: ${walletData.address}`);
  console.log('╚══════════════════════════════════════════╝');

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    contractName: 'OrphanLink',
    network: NET.id,
    deployedAt: new Date().toISOString(),
    deployer: walletData.address,
    endpoints: {
      indexer: NET.indexer,
      indexerWs: NET.indexerWs,
      node: NET.node,
      proofServer: NET.proofServer,
    },
  };

  fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
  console.log('\n💾  Deployment info saved to deployment.json');

  await wallet.stop();
  process.exit(0);
}

deploy().catch((err) => {
  console.error('\n❌ DEPLOY FAILED:', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
