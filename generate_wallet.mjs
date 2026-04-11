import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Buffer } from 'buffer';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { UnshieldedWallet, createKeystore, PublicKey } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import * as Rx from 'rxjs';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { WebSocket } from 'ws';

globalThis.WebSocket = WebSocket;
setNetworkId('preprod');

// 1. Generate random seed
const seedBytes = crypto.randomBytes(32);
const seedHex = seedBytes.toString('hex');

const hdWallet = HDWallet.fromSeed(seedBytes);
if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');

const result = hdWallet.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.NightExternal, Roles.Zswap, Roles.Dust])
  .deriveKeysAt(0);

if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
hdWallet.hdWallet.clear();

const keys = result.keys;
const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);

// 2. Initialize temporary offline wallet to extract the address
const walletConfig = {
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: 'http://127.0.0.1:8088/api/v3/graphql', indexerWsUrl: 'ws://127.0.0.1:8088/api/v3/graphql/ws' },
  provingServerUrl: new URL('http://127.0.0.1:6300'),
  relayURL: new URL('ws://127.0.0.1:9944'),
  txHistoryStorage: { getLatestHistory: () => Promise.resolve([]), storeHistory: () => Promise.resolve() },
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
};

console.log('Generating keys...');

async function main() {
  console.log("Unshielded keys generated for new wallet.");
  const address = PublicKey.fromKeyStore(unshieldedKeystore).toHexString();
  
  const walletDir = path.join(os.homedir(), '.nightforge', 'wallets');
  if (!fs.existsSync(walletDir)) fs.mkdirSync(walletDir, { recursive: true });
  
  const walletData = { name: 'default', seed: seedHex, address };
  const walletPath = path.join(walletDir, 'default.json');
  fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2), 'utf-8');
  
  console.log('\\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║ Created New Node Wallet for Deployment                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\\n');
  console.log('💳 Seed saved to:', walletPath);
  console.log('🔑 Address:', address);
  console.log('\\nPlease fund this address from the preprod faucet here:');
  console.log('https://faucet.preprod.midnight.network/\\n');
}

main().catch(console.error);
