/**
 * OrphanLink — Midnight / Lace Wallet Integration (Frontend)
 *
 * Provides wallet connection, status checking, and DApp provider
 * setup for the browser. Detects Lace wallet extension and manages
 * the connection lifecycle.
 */

const API_BASE = 'http://localhost:3001/api';

// ─── Types ───────────────────────────────────────────

export interface MidnightStatus {
  connected: boolean;
  network: string | null;
  contractAddress: string | null;
  deployedAt: string | null;
  walletAddress: string | null;
  proofServerOnline: boolean;
  mode: 'live' | 'simulation';
}

export interface LaceWalletState {
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
  network: string | null;
  balance: string | null;
}

// ─── Lace Wallet Detection ──────────────────────────

/**
 * Check if Lace wallet extension is installed in the browser.
 * Lace injects itself as `window.midnight` or `window.cardano.lace`
 */
export function detectLaceWallet(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return !!(win.midnight || win.cardano?.lace || win.cardano?.midnight);
}

/**
 * Get the Lace wallet API handle.
 * Tries multiple injection points that Lace may use.
 */
function getLaceApi(): any {
  const win = window as any;
  return win.midnight || win.cardano?.midnight || win.cardano?.lace || null;
}

/**
 * Request connection to Lace wallet.
 * Returns the wallet API if successful, null otherwise.
 */
export async function connectLaceWallet(): Promise<LaceWalletState> {
  const lace = getLaceApi();

  if (!lace) {
    return {
      isInstalled: false,
      isConnected: false,
      address: null,
      network: null,
      balance: null,
    };
  }

  try {
    // Request wallet access
    const api = typeof lace.enable === 'function'
      ? await lace.enable()
      : lace;

    // Try to get address
    let address: string | null = null;
    if (api.getUsedAddresses) {
      const addresses = await api.getUsedAddresses();
      address = addresses?.[0] ?? null;
    } else if (api.getAddress) {
      address = await api.getAddress();
    }

    // Try to get network
    let network: string | null = null;
    if (api.getNetworkId) {
      const netId = await api.getNetworkId();
      network = netId === 0 ? 'preprod' : netId === 1 ? 'mainnet' : `network-${netId}`;
    }

    // Try to get balance
    let balance: string | null = null;
    if (api.getBalance) {
      try {
        const bal = await api.getBalance();
        balance = typeof bal === 'string' ? bal : bal?.toString() ?? null;
      } catch {}
    }

    return {
      isInstalled: true,
      isConnected: true,
      address,
      network,
      balance,
    };
  } catch (err) {
    console.warn('[Lace] Connection failed:', err);
    return {
      isInstalled: true,
      isConnected: false,
      address: null,
      network: null,
      balance: null,
    };
  }
}

// ─── Server Status ──────────────────────────────────

/**
 * Fetch Midnight connection status from the backend.
 */
export async function getMidnightStatus(): Promise<MidnightStatus> {
  try {
    const res = await fetch(`${API_BASE}/midnight/status`);
    if (!res.ok) throw new Error('Status endpoint not available');
    return await res.json();
  } catch {
    return {
      connected: false,
      network: null,
      contractAddress: null,
      deployedAt: null,
      walletAddress: null,
      proofServerOnline: false,
      mode: 'simulation',
    };
  }
}

// ─── Formatted Display Helpers ──────────────────────

export function shortenAddress(addr: string, chars = 6): string {
  if (!addr) return '';
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.substring(0, chars)}…${addr.substring(addr.length - chars)}`;
}

export function getNetworkLabel(network: string | null): string {
  switch (network) {
    case 'preprod': return 'Midnight Preprod';
    case 'mainnet': return 'Midnight Mainnet';
    case 'undeployed': return 'Local Dev';
    default: return network || 'Unknown';
  }
}

export function getModeLabel(mode: string): string {
  return mode === 'live' ? '🟢 Live on Midnight' : '🟡 Simulation Mode';
}
