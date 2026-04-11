import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.json');

export interface Patient {
  credentialId: string;
  commitment: string;
  diseaseType: string;
  registeredAt: string;
  consentActive: boolean;
  dustEarned: number;
}

export interface Post {
  id: number;
  text: string;
  credentialId: string;
  upvotes: number;
  replies: Reply[];
  createdAt: string;
}

export interface Reply {
  id: number;
  text: string;
  credentialId: string;
  createdAt: string;
}

export interface Consent {
  credentialId: string;
  queryId: string;
  active: boolean;
  updatedAt: string;
}

export interface QueryRecord {
  id: string;
  diseaseType: string;
  dustPaid: number;
  resultCount: number;
  zkProof: string;
  distributions: { credentialId: string; amount: number }[];
  executedAt: string;
}

export interface DustLedger {
  entries: { credentialId: string; amount: number; reason: string; timestamp: string }[];
}

interface Database {
  patients: Patient[];
  posts: Post[];
  consents: Consent[];
  queries: QueryRecord[];
  dustLedger: DustLedger;
  nextPostId: number;
  nextReplyId: number;
}

function getDefaultDb(): Database {
  return {
    patients: [],
    posts: [
      {
        id: 1,
        text: "Has anyone else experienced severe fatigue after starting the new trial protocol? My specialists are confused but I wanted to see if anyone in this cohort has similar data.",
        credentialId: "seed_patient_1",
        upvotes: 4,
        replies: [],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 2,
        text: "Just got my test results back. It is incredibly relieving to finally have an anonymous, pharma-free place to discuss the genetic implications with people who actually understand.",
        credentialId: "seed_patient_2",
        upvotes: 12,
        replies: [],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      }
    ],
    consents: [],
    queries: [],
    dustLedger: { entries: [] },
    nextPostId: 3,
    nextReplyId: 1
  };
}

function readDb(): Database {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Corrupted file — reset
  }
  const db = getDefaultDb();
  writeDb(db);
  return db;
}

function writeDb(db: Database) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// --- Patient Operations ---

export function registerPatient(patient: Patient): Patient {
  const db = readDb();
  const existing = db.patients.find(p => p.credentialId === patient.credentialId);
  if (existing) return existing;
  db.patients.push(patient);
  writeDb(db);
  return patient;
}

export function getPatientByCredential(credentialId: string): Patient | null {
  const db = readDb();
  return db.patients.find(p => p.credentialId === credentialId) ?? null;
}

export function getPatientsByDisease(diseaseType: string): Patient[] {
  const db = readDb();
  return db.patients.filter(p => p.diseaseType === diseaseType && p.consentActive);
}

export function getAllPatients(): Patient[] {
  return readDb().patients;
}

// --- Post Operations ---

export function getAllPosts(): Post[] {
  return readDb().posts;
}

export function createPost(text: string, credentialId: string): Post {
  const db = readDb();
  const post: Post = {
    id: db.nextPostId++,
    text,
    credentialId,
    upvotes: 0,
    replies: [],
    createdAt: new Date().toISOString()
  };
  db.posts.unshift(post);
  writeDb(db);
  return post;
}

export function upvotePost(postId: number): Post | null {
  const db = readDb();
  const post = db.posts.find(p => p.id === postId);
  if (!post) return null;
  post.upvotes += 1;
  writeDb(db);
  return post;
}

export function replyToPost(postId: number, text: string, credentialId: string): Post | null {
  const db = readDb();
  const post = db.posts.find(p => p.id === postId);
  if (!post) return null;
  const reply: Reply = {
    id: db.nextReplyId++,
    text,
    credentialId,
    createdAt: new Date().toISOString()
  };
  post.replies.push(reply);
  writeDb(db);
  return post;
}

// --- Consent Operations ---

export function setConsent(credentialId: string, queryId: string, active: boolean): Consent {
  const db = readDb();
  const existing = db.consents.find(c => c.credentialId === credentialId && c.queryId === queryId);
  if (existing) {
    existing.active = active;
    existing.updatedAt = new Date().toISOString();
  } else {
    db.consents.push({ credentialId, queryId, active, updatedAt: new Date().toISOString() });
  }
  // Also update patient consent flag
  const patient = db.patients.find(p => p.credentialId === credentialId);
  if (patient) {
    const anyActive = db.consents.some(c => c.credentialId === credentialId && c.active);
    patient.consentActive = anyActive;
  }
  writeDb(db);
  return db.consents.find(c => c.credentialId === credentialId && c.queryId === queryId)!;
}

export function getConsents(credentialId: string): Consent[] {
  return readDb().consents.filter(c => c.credentialId === credentialId);
}

// --- Query & DUST Operations ---

export function recordQuery(query: QueryRecord): QueryRecord {
  const db = readDb();
  db.queries.push(query);

  // Distribute DUST to participating patients
  for (const dist of query.distributions) {
    db.dustLedger.entries.push({
      credentialId: dist.credentialId,
      amount: dist.amount,
      reason: `Query ${query.id} payout (${query.diseaseType})`,
      timestamp: new Date().toISOString()
    });
    const patient = db.patients.find(p => p.credentialId === dist.credentialId);
    if (patient) {
      patient.dustEarned += dist.amount;
    }
  }

  writeDb(db);
  return query;
}

export function getQueryHistory(): QueryRecord[] {
  return readDb().queries;
}

export function getDustEarnings(credentialId: string): { total: number; entries: DustLedger['entries'] } {
  const db = readDb();
  const entries = db.dustLedger.entries.filter(e => e.credentialId === credentialId);
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  return { total, entries };
}

export function getRegistryStats(): { totalPatients: number; byDisease: Record<string, number>; totalQueries: number; totalDustDistributed: number } {
  const db = readDb();
  const byDisease: Record<string, number> = {};
  for (const p of db.patients) {
    byDisease[p.diseaseType] = (byDisease[p.diseaseType] || 0) + 1;
  }
  const totalDust = db.dustLedger.entries.reduce((s, e) => s + e.amount, 0);
  return {
    totalPatients: db.patients.length,
    byDisease,
    totalQueries: db.queries.length,
    totalDustDistributed: totalDust
  };
}
