import React, { useEffect, useState, useCallback } from "react";
import * as api from "./lib/api";
import { connectLaceWallet, detectLaceWallet, getModeLabel, getNetworkLabel, LaceWalletState, shortenAddress } from "./lib/midnight";

// Persist credential in sessionStorage so it survives tab refreshes
function useCredential() {
  const [credentialId, setCredentialId] = useState<string | null>(() => sessionStorage.getItem("orphanlink_cred"));
  const [diseaseType, setDiseaseType] = useState<string | null>(() => sessionStorage.getItem("orphanlink_disease"));

  const save = (cred: string, disease: string) => {
    sessionStorage.setItem("orphanlink_cred", cred);
    sessionStorage.setItem("orphanlink_disease", disease);
    setCredentialId(cred);
    setDiseaseType(disease);
  };

  const clear = () => {
    sessionStorage.removeItem("orphanlink_cred");
    sessionStorage.removeItem("orphanlink_disease");
    setCredentialId(null);
    setDiseaseType(null);
  };

  return { credentialId, diseaseType, save, clear };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"onboarding" | "community" | "consent" | "researcher">("onboarding");
  const { credentialId, diseaseType, save, clear } = useCredential();
  const [stats, setStats] = useState<api.RegistryStats | null>(null);

  // === LACE WALLET STATE ===
  const [laceState, setLaceState] = useState<LaceWalletState | null>(null);

  useEffect(() => {
    // Check wallet on load
    if (detectLaceWallet()) {
      connectLaceWallet().then(setLaceState).catch(console.error);
    }
  }, []);

  const handleConnectWallet = async () => {
    const s = await connectLaceWallet();
    setLaceState(s);
  };

  useEffect(() => {
    api.getRegistryStats().then(setStats).catch(() => {});
    const interval = setInterval(() => {
      api.getRegistryStats().then(setStats).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-navigate to community if credential exists
  useEffect(() => {
    if (credentialId && activeTab === "onboarding") {
      setActiveTab("community");
    }
  }, [credentialId]);

  return (
    <>
      <nav className="navbar">
        <div className="container flex-between">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="logo-text">OrphanLink</span>
            {stats && (
              <span className="stat-pill">
                {stats.totalPatients} patients · {stats.totalQueries} queries
              </span>
            )}
          </div>
          <div className="nav-links">
            {/* LACE WALLET PILL */}
            {!laceState?.isConnected ? (
              <button 
                onClick={handleConnectWallet}
                className="badge badge-verified" 
                style={{ cursor: "pointer", marginRight: "12px", border: "1px solid var(--accent)", backgroundColor: "var(--accent-dim)" }}
              >
                {laceState?.isInstalled ? 'Connect Lace' : 'Get Lace Wallet'}
              </button>
            ) : (
              <div className="credential-pill" style={{ marginRight: "12px", borderColor: "var(--accent)", backgroundColor: "var(--accent-dim)" }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Lace</span>
                <span className="pulse-dot" style={{ backgroundColor: "var(--accent)" }}></span>
                <span style={{ color: "inherit" }}>{getNetworkLabel(laceState.network)}</span>
                <span style={{ color: "var(--accent)" }}>{shortenAddress(laceState.address || "", 4)}</span>
              </div>
            )}
            <button className={activeTab === "onboarding" ? "active" : ""} onClick={() => setActiveTab("onboarding")}>
              Onboarding
            </button>
            <button className={activeTab === "community" ? "active" : ""} onClick={() => setActiveTab("community")}>
              Anonymous Forum
            </button>
            <button className={activeTab === "consent" ? "active" : ""} onClick={() => setActiveTab("consent")}>
              Data Consent
            </button>
            <button className={activeTab === "researcher" ? "active" : ""} onClick={() => setActiveTab("researcher")}>
              Researcher
            </button>
            {credentialId && (
              <div className="credential-pill">
                <div className="pulse-dot"></div>
                <span>{credentialId.substring(0, 8)}…</span>
                <button className="logout-btn" onClick={clear} title="Clear credential">✕</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="container" style={{ paddingTop: "56px", paddingBottom: "80px" }}>
        {activeTab === "onboarding" && (
          <ScreenOnboarding onComplete={(cred: string, disease: string) => { save(cred, disease); setActiveTab("community"); }} />
        )}
        {activeTab === "community" && <ScreenCommunity credentialId={credentialId} />}
        {activeTab === "consent" && <ScreenConsent credentialId={credentialId} />}
        {activeTab === "researcher" && <ScreenResearcher />}
      </main>

      <footer className="footer">
        <div className="container flex-between">
          <span>OrphanLink — Built for the Midnight Hackathon 2026</span>
          <span>ZK-Native · Privacy-First · DUST Economy</span>
        </div>
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════════════
// SCREEN 1: PATIENT ONBOARDING
// ═══════════════════════════════════════════════════

function ScreenOnboarding({ onComplete }: { onComplete: (cred: string, disease: string) => void }) {
  const [diseaseType, setDiseaseType] = useState("");
  const [credential, setCredential] = useState<api.PatientCredential | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const handleGenerate = async () => {
    if (!diseaseType) return;
    setLoading(true);
    setErrorMsg(null);
    setStep(1);

    try {
      const result = await api.registerPatient(diseaseType);
      setStep(2);

      // Brief pause to show the proof generation animation
      await new Promise(r => setTimeout(r, 600));
      setStep(3);
      setCredential(result);
      setLoading(false);

      // Auto-redirect after showing success
      setTimeout(() => onComplete(result.credentialId, diseaseType), 2000);
    } catch (err: any) {
      setErrorMsg(err.message);
      setLoading(false);
      setStep(0);
    }
  };

  const diseases = [
    { code: "EDS", name: "Ehlers-Danlos Syndrome", prevalence: "1 in 5,000", emoji: "🧬" },
    { code: "BRCA1", name: "BRCA1 Mutation", prevalence: "1 in 400", emoji: "🔬" },
    { code: "CF", name: "Cystic Fibrosis", prevalence: "1 in 3,500", emoji: "🫁" },
  ];

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto" }}>
      <div className="section-header">
        <h2>Patient Onboarding</h2>
        <p>Generate a cryptographic credential to join the anonymous forum. Your diagnosis is hashed locally and never stored in plaintext.</p>
      </div>

      <div className="panel glow-panel">
        <div className="step-indicator">
          <div className={`step-dot ${step >= 0 ? "active" : ""}`}><span>1</span></div>
          <div className="step-line"></div>
          <div className={`step-dot ${step >= 1 ? "active" : ""}`}><span>2</span></div>
          <div className="step-line"></div>
          <div className={`step-dot ${step >= 3 ? "active" : ""}`}><span>3</span></div>
        </div>

        <label className="input-label">Select Disease Type</label>
        <div className="disease-grid">
          {diseases.map(d => (
            <button
              key={d.code}
              className={`disease-card ${diseaseType === d.code ? "selected" : ""}`}
              onClick={() => setDiseaseType(d.code)}
              disabled={loading}
            >
              <span className="disease-emoji">{d.emoji}</span>
              <span className="disease-name">{d.name}</span>
              <span className="disease-prevalence">{d.prevalence}</span>
            </button>
          ))}
        </div>

        <button className="btn-primary full-width" onClick={handleGenerate} disabled={!diseaseType || loading}>
          {loading ? (
            <span className="loading-text">
              <span className="spinner"></span>
              {step === 1 ? "Hashing diagnosis…" : step === 2 ? "Generating commitment…" : "Verifying…"}
            </span>
          ) : (
            "Generate ZK Credential"
          )}
        </button>

        {errorMsg && (
          <div className="alert alert-error" style={{ marginTop: "20px" }}>
            <strong>Error</strong>
            <p>{errorMsg}</p>
          </div>
        )}

        {credential && (
          <div className="alert alert-success" style={{ marginTop: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "18px" }}>✓</span>
              <strong>Credential Generated</strong>
            </div>
            <p style={{ marginBottom: "12px" }}>Your diagnosis was hashed with SHA-256 and cryptographically committed. No plaintext ever left your device.</p>
            <div className="proof-details">
              <div className="proof-row">
                <span className="proof-label">Credential ID</span>
                <code className="proof-value">{credential.credentialId}</code>
              </div>
              <div className="proof-row">
                <span className="proof-label">Commitment</span>
                <code className="proof-value">{credential.commitment.substring(0, 32)}…</code>
              </div>
              {credential.midnight && (
                <div className="proof-row">
                  <span className="proof-label">Midnight {credential.midnight.onChain ? 'On-Chain' : 'Simulation'}</span>
                  <code className="proof-value" style={{ color: credential.midnight.onChain ? 'var(--accent)' : 'var(--warning)' }}>
                    {credential.midnight.txHash}
                  </code>
                </div>
              )}
              <div className="proof-row">
                <span className="proof-label">Timestamp</span>
                <code className="proof-value">{new Date(credential.registeredAt).toLocaleString()}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SCREEN 2: ANONYMOUS COMMUNITY FORUM
// ═══════════════════════════════════════════════════

function ScreenCommunity({ credentialId }: { credentialId: string | null }) {
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [posts, setPosts] = useState<api.PostData[]>([]);
  const [posting, setPosting] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.getPosts();
      setPosts(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 3000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  if (!credentialId) {
    return (
      <div className="panel access-denied" style={{ maxWidth: "480px", margin: "64px auto", textAlign: "center" }}>
        <div className="lock-icon">🔒</div>
        <h2 style={{ fontSize: "22px", marginBottom: "12px" }}>Access Denied</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px", lineHeight: "1.7" }}>
          The Community Forum requires cryptographic proof of a verified diagnosis. This prevents fake accounts, bots, and pharmaceutical astroturfing.
        </p>
        <span className="badge">Complete Onboarding to Enter</span>
      </div>
    );
  }

  const handlePost = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      await api.createPost(draft.trim(), credentialId);
      setDraft("");
      await fetchPosts();
    } catch {}
    setPosting(false);
  };

  const handleUpvote = async (id: number) => {
    try {
      await api.upvotePost(id);
      await fetchPosts();
    } catch {}
  };

  const handleReply = async (id: number) => {
    const text = replyDrafts[id];
    if (!text || !text.trim()) return;
    try {
      await api.replyToPost(id, text.trim(), credentialId);
      setReplyDrafts({ ...replyDrafts, [id]: "" });
      setReplyingTo(null);
      await fetchPosts();
    } catch {}
  };

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <div className="section-header">
        <div className="flex-between">
          <div>
            <h2>Rare Disease Network</h2>
            <p>An anonymous sanctuary free of identities and astroturfing. Every poster is a verified patient.</p>
          </div>
          <span className="badge badge-success">ZK Credential Active</span>
        </div>
      </div>

      <div className="panel compose-box">
        <textarea
          placeholder="Share your experience with your verified cohort…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="compose-textarea"
          rows={3}
        />
        <div className="compose-footer">
          <span className="compose-hint">Posts are stripped of all identity metadata</span>
          <button className="btn-primary" onClick={handlePost} disabled={!draft.trim() || posting}>
            {posting ? <span className="spinner"></span> : null}
            Post Anonymously
          </button>
        </div>
      </div>

      <div className="posts-list">
        {posts.map((post) => (
          <div key={post.id} className="panel post-card">
            <div className="post-header">
              <div className="post-author">
                <div className="avatar-anon">A</div>
                <div>
                  <span className="author-name">Anonymous Peer</span>
                  <span className="post-time">• {post.time}</span>
                </div>
              </div>
              <span className="badge badge-verified">Verified Patient</span>
            </div>
            <p className="post-body">{post.text}</p>
            <div className="post-actions">
              <button className="action-btn" onClick={() => handleUpvote(post.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                {post.upvotes}
              </button>
              <button className="action-btn" onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {post.replies?.length || 0}
              </button>
            </div>

            {replyingTo === post.id && (
              <div className="reply-compose">
                <input
                  type="text"
                  value={replyDrafts[post.id] || ""}
                  onChange={(e) => setReplyDrafts({ ...replyDrafts, [post.id]: e.target.value })}
                  placeholder="Write a reply…"
                  className="reply-input"
                  onKeyDown={(e) => e.key === "Enter" && handleReply(post.id)}
                />
                <button className="btn-primary btn-sm" onClick={() => handleReply(post.id)}>Reply</button>
              </div>
            )}

            {post.replies && post.replies.length > 0 && (
              <div className="replies-thread">
                {post.replies.map((reply) => (
                  <div key={reply.id} className="reply-item">
                    <div className="reply-header">
                      <span className="author-name">Anonymous Peer</span>
                      <span className="post-time">• {reply.time}</span>
                    </div>
                    <p className="reply-text">{reply.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {posts.length === 0 && (
          <div className="panel" style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary)" }}>
            <p>No posts yet. Be the first to share.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SCREEN 3: RESEARCHER DASHBOARD
// ═══════════════════════════════════════════════════

function ScreenResearcher() {
  const [queryCode, setQueryCode] = useState("");
  const [dustAmount, setDustAmount] = useState(50);
  const [result, setResult] = useState<api.AggregateResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<api.RegistryStats | null>(null);
  const [seeding, setSeeding] = useState(false);

  const refreshData = async () => {
    api.getQueryHistory().then(setHistory).catch(() => {});
    api.getRegistryStats().then(setStats).catch(() => {});
  };

  useEffect(() => {
    refreshData();
  }, [result]);

  const runQuery = async () => {
    setErrorMsg(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api.submitAggregateQuery(queryCode, dustAmount);
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
    setLoading(false);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.seedRegistry();
      await refreshData();
    } catch {}
    setSeeding(false);
  };

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>
      <div className="section-header">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div>
            <h2>Researcher Dashboard</h2>
            <p style={{ marginTop: "6px" }}>Submit aggregate queries against the encrypted patient registry. You pay DUST tokens; patients earn revenue. You never see individual data.</p>
          </div>
          {stats?.midnight && (
            <div className={`badge ${stats.midnight.mode === 'live' ? 'badge-verified' : ''}`} style={{ alignSelf: "flex-start", marginTop: "4px" }}>
              {getModeLabel(stats.midnight.mode)}
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="stats-row" style={{ marginBottom: "24px" }}>
          <div className="stat-card">
            <span className="stat-label">Total Patients</span>
            <span className="stat-value">{stats.totalPatients}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">By Disease</span>
            <span className="stat-value" style={{ fontSize: "13px" }}>
              {Object.entries(stats.byDisease).map(([d, c]) => `${d}: ${c}`).join(" · ") || "—"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">DUST Distributed</span>
            <span className="stat-value success">{stats.totalDustDistributed.toFixed(2)} <span className="stat-unit">tDUST</span></span>
          </div>
        </div>
      )}

      {stats && stats.totalPatients < 10 && (
        <div className="panel" style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong style={{ fontSize: "14px" }}>Registry needs more patients</strong>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
              Populate the registry with demo patients so aggregate queries can meet the k-anonymity threshold.
            </p>
          </div>
          <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
            {seeding ? <span className="spinner"></span> : null}
            {seeding ? "Seeding…" : "Seed Registry"}
          </button>
        </div>
      )}

      <div className="panel glow-panel" style={{ marginBottom: "24px" }}>
        <div className="flex-between" style={{ marginBottom: "24px" }}>
          <h3 className="panel-title">Execute Private Query</h3>
          <span className="badge" style={{ fontVariantNumeric: "tabular-nums" }}>Cost: {dustAmount} tDUST</span>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
          <select value={queryCode} onChange={(e) => setQueryCode(e.target.value)} style={{ flexGrow: 1 }}>
            <option value="">Select ICD-10 Category…</option>
            <option value="EDS">Ehlers-Danlos Syndrome (EDS)</option>
            <option value="BRCA1">BRCA1 Mutation</option>
            <option value="CF">Cystic Fibrosis (CF)</option>
          </select>
          <input
            type="number"
            value={dustAmount}
            onChange={(e) => setDustAmount(parseInt(e.target.value) || 0)}
            min={50}
            style={{ width: "100px" }}
            placeholder="DUST"
          />
          <button className="btn-primary" onClick={runQuery} disabled={!queryCode || loading}>
            {loading ? <span className="spinner"></span> : null}
            {loading ? "Querying…" : "Run Query"}
          </button>
        </div>

        <div className="info-callout">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span>Queries returning fewer than 10 patients are automatically rejected (k-anonymity threshold).</span>
        </div>
      </div>

      {errorMsg && (
        <div className="panel alert-panel alert-panel-error">
          <h3 className="alert-title error">Query Rejected — Privacy Defense</h3>
          <p className="alert-body">{errorMsg}</p>
        </div>
      )}

      {result && (
        <div className="panel alert-panel alert-panel-success">
          <h3 className="alert-title success">Query Successful</h3>
          <p className="alert-body" style={{ marginBottom: "20px" }}>
            <strong>{result.count}</strong> patients verified. DUST tokens distributed to {result.distributions.length} participating wallets.
          </p>

          <div className="result-grid">
            <div className="result-item">
              <span className="result-label">Query ID</span>
              <code className="result-value">{result.queryId.substring(0, 12)}…</code>
            </div>
            <div className="result-item">
              <span className="result-label">Patient Count</span>
              <code className="result-value">{result.count}</code>
            </div>
            <div className="result-item">
              <span className="result-label">DUST Paid</span>
              <code className="result-value">{result.dustPaid} tDUST</code>
            </div>
            <div className="result-item">
              <span className="result-label">Treasury Fee</span>
              <code className="result-value">{result.treasuryFee} tDUST</code>
            </div>
            <div className="result-item">
              <span className="result-label">Patient Pool</span>
              <code className="result-value">{result.patientPoolFee} tDUST</code>
            </div>
            <div className="result-item">
              <span className="result-label">Per Patient</span>
              <code className="result-value">{result.perPatientShare} tDUST</code>
            </div>
          </div>

          <div style={{ marginTop: "20px" }}>
            <span className="result-label" style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span>Cryptographic Proof</span>
              {result.midnight?.onChain && (
                 <span style={{ color: 'var(--accent)', textTransform: 'none' }}>
                   Contract: {shortenAddress(result.midnight.contractAddress || "")}
                 </span>
              )}
            </span>
            <code className="proof-hash">{result.zkProof}</code>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel" style={{ marginTop: "24px" }}>
          <h3 className="panel-title" style={{ marginBottom: "16px" }}>Query History</h3>
          {history.map((q: any) => (
            <div key={q.id} className="data-row">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="badge badge-success" style={{ fontSize: "11px" }}>{q.diseaseType}</span>
                <span style={{ fontSize: "13px" }}>{q.resultCount} patients</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{q.dustPaid} tDUST</span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{new Date(q.executedAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SCREEN 4: CONSENT MANAGER
// ═══════════════════════════════════════════════════

function ScreenConsent({ credentialId }: { credentialId: string | null }) {
  const [consents, setConsents] = useState<Record<string, boolean>>({
    query_university_brca: true,
    query_pharma_eds: true,
    query_global_cohort: false,
  });
  const [dustEarnings, setDustEarnings] = useState<api.DustEarnings | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!credentialId) return;
    // Fetch real consent states
    api.getConsents(credentialId).then((data) => {
      const map: Record<string, boolean> = {};
      for (const c of data) map[c.queryId] = c.active;
      if (Object.keys(map).length > 0) setConsents(map);
    }).catch(() => {});
    // Fetch real earnings
    api.getDustEarnings(credentialId).then(setDustEarnings).catch(() => {});
  }, [credentialId]);

  if (!credentialId) {
    return (
      <div className="panel access-denied" style={{ maxWidth: "480px", margin: "64px auto", textAlign: "center" }}>
        <div className="lock-icon">🔒</div>
        <h2 style={{ fontSize: "22px", marginBottom: "12px" }}>No Active Credential</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
          Complete onboarding to manage your data consent preferences and view DUST earnings.
        </p>
        <span className="badge">Complete Onboarding First</span>
      </div>
    );
  }

  const toggleConsent = async (queryId: string) => {
    setUpdating(queryId);
    const newValue = !consents[queryId];
    try {
      await api.setConsent(credentialId, queryId, newValue);
      setConsents({ ...consents, [queryId]: newValue });
    } catch {}
    setUpdating(null);
  };

  const activeCount = Object.values(consents).filter(Boolean).length;
  const totalEarned = dustEarnings?.total ?? 0;

  const queries = [
    { id: "query_university_brca", title: "University Medical — BRCA Mutation Study", org: "MIT Medical Research", status: "Active" },
    { id: "query_pharma_eds", title: "Global Pharma — EDS Comorbidity Index", org: "Novartis Research", status: "Active" },
    { id: "query_global_cohort", title: "Midnight Foundation — General Registry", org: "Midnight Network", status: "Pending" },
  ];

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>
      <div className="section-header">
        <h2>Patient Consent & Earnings</h2>
        <p>You control which research queries can include your encrypted data. You earn DUST for every query your data helps answer.</p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Active Consents</span>
          <span className="stat-value">{activeCount} <span className="stat-unit">of {queries.length}</span></span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Earned</span>
          <span className="stat-value success">{totalEarned.toFixed(4)} <span className="stat-unit">tDUST</span></span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Credential</span>
          <code className="stat-value mono">{credentialId}</code>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "24px" }}>
        <h3 className="panel-title" style={{ marginBottom: "20px" }}>Research Queries</h3>
        {queries.map((q) => (
          <div key={q.id} className="consent-row">
            <div className="consent-info">
              <span className="consent-title">{q.title}</span>
              <span className="consent-org">{q.org}</span>
            </div>
            <button
              className={`consent-toggle ${consents[q.id] ? "active" : ""}`}
              onClick={() => toggleConsent(q.id)}
              disabled={updating === q.id}
            >
              {updating === q.id ? (
                <span className="spinner spinner-sm"></span>
              ) : consents[q.id] ? (
                "Consent Active"
              ) : (
                "Opt-In"
              )}
            </button>
          </div>
        ))}
      </div>

      {dustEarnings && dustEarnings.entries.length > 0 && (
        <div className="panel" style={{ marginTop: "24px" }}>
          <h3 className="panel-title" style={{ marginBottom: "16px" }}>DUST Earnings Ledger</h3>
          {dustEarnings.entries.map((entry, i) => (
            <div key={i} className="data-row">
              <span style={{ fontSize: "13px" }}>{entry.reason}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "var(--success)", fontWeight: "500", fontSize: "13px" }}>+{entry.amount} tDUST</span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}