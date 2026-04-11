import express from 'express';
import cors from 'cors';
import {
  registerPatient as dbRegisterPatient,
  getPatientByCredential,
  getPatientsByDisease,
  getAllPatients,
  getAllPosts,
  createPost,
  upvotePost,
  replyToPost,
  setConsent,
  getConsents,
  recordQuery,
  getQueryHistory,
  getDustEarnings,
  getRegistryStats
} from './db.js';
import {
  generateCommitment,
  deriveCredentialId,
  generatePatientSecret,
  generateAggregateProof,
  verifyAggregateProof,
  generateQueryId
} from './crypto.js';
import {
  getMidnightStatus,
  submitCommitmentOnChain,
  loadDeployment,
  checkProofServer
} from './midnight.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// Midnight Status Endpoint
// ─────────────────────────────────────────────

app.get('/api/midnight/status', async (_req, res) => {
  const status = await getMidnightStatus();
  res.json(status);
});

app.get('/api/midnight/proof-server', async (_req, res) => {
  const online = await checkProofServer();
  res.json({ online, url: loadDeployment()?.endpoints?.proofServer || 'http://127.0.0.1:6300' });
});

// ─────────────────────────────────────────────
// Patient Registration (with Midnight integration)
// ─────────────────────────────────────────────

app.post('/api/patients/register', async (req, res) => {
  const { diseaseType } = req.body;
  if (!diseaseType) {
    return res.status(400).json({ error: 'diseaseType is required' });
  }

  // Generate a real cryptographic patient secret and commitment
  const patientSeed = `${diseaseType}_${Date.now()}_${Math.random()}`;
  const patientSecret = generatePatientSecret(patientSeed);
  const commitment = generateCommitment(diseaseType, patientSecret);
  const credentialId = deriveCredentialId(commitment);

  // Submit commitment to Midnight contract (if deployed)
  let chainResult;
  try {
    chainResult = await submitCommitmentOnChain(commitment);
  } catch (err: any) {
    console.warn('[Midnight] On-chain submission failed (continuing in simulation):', err.message);
    chainResult = { txHash: `sim_${commitment.substring(0, 16)}`, onChain: false, contractAddress: null };
  }

  const patient = dbRegisterPatient({
    credentialId,
    commitment,
    diseaseType,
    registeredAt: new Date().toISOString(),
    consentActive: true,
    dustEarned: 0
  });

  // Auto-create default consents
  setConsent(credentialId, 'query_university_brca', true);
  setConsent(credentialId, 'query_pharma_eds', true);
  setConsent(credentialId, 'query_global_cohort', false);

  res.json({
    credentialId: patient.credentialId,
    commitment: patient.commitment,
    diseaseType: patient.diseaseType,
    registeredAt: patient.registeredAt,
    // Return the secret so the client can store it locally (in production, this stays in the Lace wallet)
    patientSecret,
    // Midnight chain integration status
    midnight: {
      txHash: chainResult.txHash,
      onChain: chainResult.onChain,
      contractAddress: chainResult.contractAddress,
    }
  });
});

app.get('/api/patients/:credentialId', (req, res) => {
  const patient = getPatientByCredential(req.params.credentialId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(patient);
});

// ─────────────────────────────────────────────
// Anonymous Forum (Posts)
// ─────────────────────────────────────────────

app.get('/api/posts', (_req, res) => {
  const posts = getAllPosts();
  // Strip credentialIds from responses for anonymity
  const sanitized = posts.map(p => ({
    ...p,
    credentialId: undefined,
    time: formatTimeAgo(p.createdAt),
    replies: p.replies.map(r => ({
      ...r,
      credentialId: undefined,
      time: formatTimeAgo(r.createdAt)
    }))
  }));
  res.json(sanitized);
});

app.post('/api/posts', (req, res) => {
  const { text, credentialId } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const post = createPost(text.trim(), credentialId || 'anonymous');
  res.json({
    ...post,
    credentialId: undefined,
    time: formatTimeAgo(post.createdAt),
    replies: []
  });
});

app.post('/api/posts/:id/upvote', (req, res) => {
  const id = parseInt(req.params.id);
  const post = upvotePost(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ ...post, credentialId: undefined, time: formatTimeAgo(post.createdAt) });
});

app.post('/api/posts/:id/reply', (req, res) => {
  const id = parseInt(req.params.id);
  const { text, credentialId } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  const post = replyToPost(id, text.trim(), credentialId || 'anonymous');
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({
    ...post,
    credentialId: undefined,
    time: formatTimeAgo(post.createdAt),
    replies: post.replies.map(r => ({
      ...r,
      credentialId: undefined,
      time: formatTimeAgo(r.createdAt)
    }))
  });
});

// ─────────────────────────────────────────────
// Consent Management
// ─────────────────────────────────────────────

app.get('/api/consents/:credentialId', (req, res) => {
  const consents = getConsents(req.params.credentialId);
  res.json(consents);
});

app.post('/api/consents', (req, res) => {
  const { credentialId, queryId, active } = req.body;
  if (!credentialId || !queryId || typeof active !== 'boolean') {
    return res.status(400).json({ error: 'credentialId, queryId, and active (boolean) are required' });
  }
  const consent = setConsent(credentialId, queryId, active);
  res.json(consent);
});

// ─────────────────────────────────────────────
// Researcher Aggregate Queries
// ─────────────────────────────────────────────

app.post('/api/queries/aggregate', (req, res) => {
  const { diseaseType, dustAmount } = req.body;

  if (!diseaseType) {
    return res.status(400).json({ error: 'diseaseType is required' });
  }
  if (!dustAmount || dustAmount < 50) {
    return res.status(400).json({ error: 'Minimum 50 DUST required for query fee' });
  }

  // Find consenting patients for this disease type
  const consentingPatients = getPatientsByDisease(diseaseType);
  const count = consentingPatients.length;

  // Privacy threshold enforcement — REAL, not mocked
  if (count < 10) {
    return res.status(403).json({
      error: `Privacy threshold not met. Only ${count} consenting patients in cohort. Minimum 10 required for k-anonymity. This protects individual patient identity within aggregate results.`
    });
  }

  // Generate real cryptographic proof
  const commitments = consentingPatients.map(p => p.commitment);
  const { proof, publicInputs, timestamp } = generateAggregateProof(diseaseType, count, commitments);

  // DUST distribution calculation
  const treasuryFee = Math.floor(dustAmount * 0.5);
  const poolFee = dustAmount - treasuryFee;
  const perPatientShare = parseFloat((poolFee / count).toFixed(4));

  const distributions = consentingPatients.map(p => ({
    credentialId: p.credentialId,
    amount: perPatientShare
  }));

  // Record the query and distribute DUST
  const queryId = generateQueryId();
  recordQuery({
    id: queryId,
    diseaseType,
    dustPaid: dustAmount,
    resultCount: count,
    zkProof: proof,
    distributions,
    executedAt: timestamp
  });

  // Include Midnight status in response
  const deployment = loadDeployment();

  res.json({
    queryId,
    count,
    zkProof: proof,
    publicInputs,
    dustPaid: dustAmount,
    treasuryFee,
    patientPoolFee: poolFee,
    perPatientShare,
    distributions: distributions.map(d => ({
      credentialId: d.credentialId.substring(0, 6) + '...',
      amount: d.amount
    })),
    timestamp,
    midnight: {
      onChain: !!deployment,
      network: deployment?.network || null,
      contractAddress: deployment?.contractAddress || null,
    }
  });
});

// Proof verification endpoint
app.post('/api/queries/verify', (req, res) => {
  const { proof, diseaseType, count, commitments, timestamp } = req.body;
  if (!proof || !diseaseType || !count || !commitments || !timestamp) {
    return res.status(400).json({ error: 'All proof parameters required' });
  }
  const valid = verifyAggregateProof(proof, diseaseType, count, commitments, timestamp);
  res.json({ valid, verifiedAt: new Date().toISOString() });
});

app.get('/api/queries/history', (_req, res) => {
  res.json(getQueryHistory());
});

// ─────────────────────────────────────────────
// DUST Earnings
// ─────────────────────────────────────────────

app.get('/api/dust/:credentialId', (req, res) => {
  const earnings = getDustEarnings(req.params.credentialId);
  res.json(earnings);
});

// ─────────────────────────────────────────────
// Registry Stats
// ─────────────────────────────────────────────

app.get('/api/stats', async (_req, res) => {
  const stats = getRegistryStats();
  const midnightStatus = await getMidnightStatus();
  res.json({
    ...stats,
    midnight: midnightStatus,
  });
});

// ─────────────────────────────────────────────
// Seed endpoint for demo/hackathon
// ─────────────────────────────────────────────

app.post('/api/seed', (_req, res) => {
  const stats = getRegistryStats();
  if (stats.totalPatients >= 30) {
    return res.json({ message: 'Registry already seeded', stats });
  }

  const seedCounts: Record<string, number> = { EDS: 15, BRCA1: 12, CF: 11 };

  let created = 0;
  for (const [disease, count] of Object.entries(seedCounts)) {
    for (let i = 0; i < count; i++) {
      const seed = `${disease}_seed_${i}_${Date.now()}`;
      const secret = generatePatientSecret(seed);
      const commitment = generateCommitment(disease, secret);
      const credentialId = deriveCredentialId(commitment);

      dbRegisterPatient({
        credentialId,
        commitment,
        diseaseType: disease,
        registeredAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        consentActive: true,
        dustEarned: 0
      });

      setConsent(credentialId, 'query_university_brca', true);
      setConsent(credentialId, 'query_pharma_eds', true);
      setConsent(credentialId, 'query_global_cohort', Math.random() > 0.5);

      created++;
    }
  }

  res.json({ message: `Seeded ${created} patients`, stats: getRegistryStats() });
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

app.listen(PORT, () => {
  console.log(`\n🏥 OrphanLink API server running on http://localhost:${PORT}`);
  console.log(`📊 Registry stats: ${JSON.stringify(getRegistryStats())}`);
  getMidnightStatus().then(status => {
    console.log(`🌙 Midnight: ${status.mode === 'live' ? '✅ LIVE' : '⚠️  SIMULATION'} | Network: ${status.network || 'none'} | Contract: ${status.contractAddress || 'not deployed'}`);
  });
});
