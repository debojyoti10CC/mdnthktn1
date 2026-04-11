const API_BASE = 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data as T;
}

// ─── Patient ────────────────────────────────────

export interface PatientCredential {
  credentialId: string;
  commitment: string;
  diseaseType: string;
  registeredAt: string;
  patientSecret: string;
  midnight?: {
    txHash: string;
    onChain: boolean;
    contractAddress: string | null;
  };
}

export async function registerPatient(diseaseType: string): Promise<PatientCredential> {
  return request('/patients/register', {
    method: 'POST',
    body: JSON.stringify({ diseaseType }),
  });
}

export async function getPatient(credentialId: string) {
  return request<any>(`/patients/${credentialId}`);
}

// ─── Posts ───────────────────────────────────────

export interface PostData {
  id: number;
  text: string;
  upvotes: number;
  time: string;
  replies: ReplyData[];
}

export interface ReplyData {
  id: number;
  text: string;
  time: string;
}

export async function getPosts(): Promise<PostData[]> {
  return request('/posts');
}

export async function createPost(text: string, credentialId: string): Promise<PostData> {
  return request('/posts', {
    method: 'POST',
    body: JSON.stringify({ text, credentialId }),
  });
}

export async function upvotePost(postId: number): Promise<PostData> {
  return request(`/posts/${postId}/upvote`, { method: 'POST' });
}

export async function replyToPost(postId: number, text: string, credentialId: string): Promise<PostData> {
  return request(`/posts/${postId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text, credentialId }),
  });
}

// ─── Consent ────────────────────────────────────

export interface ConsentData {
  credentialId: string;
  queryId: string;
  active: boolean;
  updatedAt: string;
}

export async function getConsents(credentialId: string): Promise<ConsentData[]> {
  return request(`/consents/${credentialId}`);
}

export async function setConsent(credentialId: string, queryId: string, active: boolean): Promise<ConsentData> {
  return request('/consents', {
    method: 'POST',
    body: JSON.stringify({ credentialId, queryId, active }),
  });
}

// ─── Queries ────────────────────────────────────

export interface AggregateResult {
  queryId: string;
  count: number;
  zkProof: string;
  publicInputs: string;
  dustPaid: number;
  treasuryFee: number;
  patientPoolFee: number;
  perPatientShare: number;
  distributions: { credentialId: string; amount: number }[];
  timestamp: string;
  midnight?: {
    onChain: boolean;
    network: string | null;
    contractAddress: string | null;
  };
}

export async function submitAggregateQuery(diseaseType: string, dustAmount: number): Promise<AggregateResult> {
  return request('/queries/aggregate', {
    method: 'POST',
    body: JSON.stringify({ diseaseType, dustAmount }),
  });
}

export async function verifyProof(proof: string, diseaseType: string, count: number, commitments: string[], timestamp: string): Promise<{ valid: boolean; verifiedAt: string }> {
  return request('/queries/verify', {
    method: 'POST',
    body: JSON.stringify({ proof, diseaseType, count, commitments, timestamp }),
  });
}

export async function getQueryHistory() {
  return request<any[]>('/queries/history');
}

// ─── DUST ───────────────────────────────────────

export interface DustEarnings {
  total: number;
  entries: { credentialId: string; amount: number; reason: string; timestamp: string }[];
}

export async function getDustEarnings(credentialId: string): Promise<DustEarnings> {
  return request(`/dust/${credentialId}`);
}

// ─── Stats ──────────────────────────────────────

export interface MidnightStatus {
  connected: boolean;
  network: string | null;
  contractAddress: string | null;
  deployedAt: string | null;
  walletAddress: string | null;
  proofServerOnline: boolean;
  mode: 'live' | 'simulation';
}

export interface RegistryStats {
  totalPatients: number;
  byDisease: Record<string, number>;
  totalQueries: number;
  totalDustDistributed: number;
  midnight?: MidnightStatus;
}

export async function getRegistryStats(): Promise<RegistryStats> {
  return request('/stats');
}

export async function seedRegistry(): Promise<{ message: string; stats: RegistryStats }> {
  return request('/seed', { method: 'POST' });
}

// ─── Midnight Direct ────────────────────────────

export async function getMidnightStatus(): Promise<MidnightStatus> {
  return request('/midnight/status');
}
