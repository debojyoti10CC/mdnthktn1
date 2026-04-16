
# OrphanLink

**Privacy-Preserving Rare Disease Community and Research Registry**
Midnight Hackathon Submission · Healthcare Track · April 2026

---

## 1. Overview

OrphanLink is a dual-layer application built on the Midnight Network that enables:

* Anonymous, verified patient communities
* Privacy-preserving global research datasets

The system uses Zero-Knowledge (ZK) proofs to ensure that:

* Patient identity is never exposed
* Medical data is never directly shared
* Researchers can still obtain statistically meaningful insights

---

## 2. Problem Definition

### 2.1 Rare Disease Data Fragmentation

| Issue               | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| Low patient density | Individual institutions lack sufficient data for research   |
| Data silos          | Patient records are isolated across hospitals and countries |
| Regulatory barriers | HIPAA/GDPR restrict data sharing                            |
| Lack of aggregation | No global, privacy-compliant patient pool                   |

---

### 2.2 Community Trust Deficit

| Issue           | Description                                         |
| --------------- | --------------------------------------------------- |
| No verification | Existing platforms cannot verify real patients      |
| Misinformation  | High presence of unverified medical claims          |
| Astroturfing    | Pharmaceutical manipulation of discussions          |
| Privacy risks   | Users must reveal identity or sensitive information |

---

## 3. Solution Architecture

OrphanLink introduces a **two-layer system**:

| Layer             | Type | Function                                        |
| ----------------- | ---- | ----------------------------------------------- |
| Community Layer   | B2C  | Anonymous, credential-gated patient interaction |
| Research Registry | B2B  | Encrypted data aggregation and query system     |

---

## 4. Core System Components

### 4.1 Smart Contract Architecture

| Component                   | Technology                 | Description                               |
| --------------------------- | -------------------------- | ----------------------------------------- |
| Patient Credential Contract | Compact (ZK DSL)           | Issues disease verification proofs        |
| Community Contract          | Compact + TypeScript       | Controls anonymous forum access           |
| Research Registry Contract  | Compact                    | Stores encrypted patient data commitments |
| Consent Ledger              | Compact                    | Tracks opt-in permissions per query       |
| ZK Query Engine             | Off-chain prover + Compact | Computes aggregate results with proofs    |
| Payment System              | Midnight DUST Token        | Handles micropayment distribution         |

---

## 5. Functional Workflows

### 5.1 Patient Onboarding Workflow

```
Patient → Submit Diagnosis Hash
        → Credential Contract Verification
        → ZK Patient Credential Issued
        → Stored in Private Wallet State
```

---

### 5.2 Community Access Workflow

```
User Wallet → Credential Check
            → Access Granted to Community
            → Anonymous Posting Enabled
            → No Identity or Profile Linkage
```

---

### 5.3 Research Registry Enrollment

```
Patient → Opt-in Transaction
        → Submit Encrypted Data Commitment
        → Define Consent Preferences
        → Record in Consent Ledger
```

---

### 5.4 Research Query Workflow

```
Researcher → Submit Query + DUST Fee
           → Credential Validation
           → Consent Filtering
           → ZK Aggregate Computation
           → Output:
               - Aggregate Result
               - ZK Proof
           → DUST Distribution to Patients
```

---

### 5.5 Payment Distribution Flow

| Step | Action                                       |
| ---- | -------------------------------------------- |
| 1    | Researcher deposits DUST                     |
| 2    | System verifies consent of included patients |
| 3    | Query executed                               |
| 4    | DUST split across contributing patients      |
| 5    | Payment automatically sent to wallets        |

---

## 6. Privacy Model

| Feature              | Guarantee                                  |
| -------------------- | ------------------------------------------ |
| Identity Protection  | No personal identity stored or exposed     |
| Data Privacy         | Raw medical data never leaves user control |
| Query Safety         | Only aggregate outputs returned            |
| Differential Privacy | Minimum threshold enforced (≥10 users)     |
| Consent Control      | Per-query opt-in with revocation           |
| Payment Privacy      | Shielded wallet transactions               |

---

## 7. Token Economics

| Element      | Description                         |
| ------------ | ----------------------------------- |
| Token        | DUST (resource + payment token)     |
| Source       | Generated from NIGHT token          |
| Usage        | Research query execution            |
| Distribution | Split between patients and protocol |

---

## 8. Key Innovation: ZK Aggregate Query

OrphanLink’s core technical contribution is a **ZK-powered aggregate query system**:

| Capability                | Description                                  |
| ------------------------- | -------------------------------------------- |
| Cross-institution queries | Combine global patient data without transfer |
| Privacy preservation      | No individual record exposure                |


Example Query:

```
"Count patients with BRCA1 mutation and Ehlers-Danlos Syndrome"
```

Output:

* Aggregate count
* Zero-Knowledge proof of correctness

---

## 9. User Personas

### 9.1 Patient

| Requirement           | Outcome                      |
| --------------------- | ---------------------------- |
| Anonymous interaction | No identity exposure         |
| Verified community    | Only real patients allowed   |
| Data monetization     | Earn DUST from contributions |
| Consent control       | Full control over data usage |

---

### 9.2 Researcher

| Requirement            | Outcome                       |
| ---------------------- | ----------------------------- |
| Access global datasets | Query aggregated patient pool |
| Maintain compliance    | No raw data access            |
| Data validity          | ZK proof-backed results       |
| Efficient access       | No institutional negotiation  |

---

### 9.3 Medical Institution

| Requirement     | Outcome                           |
| --------------- | --------------------------------- |
| Contribute data | Without violating privacy laws    |
| Patient benefit | Enable patient compensation       |
| Auditability    | Cryptographic proof of compliance |

---

## 10. Hackathon Scope (48-Hour Build)

| Phase      | Deliverable           | Priority |
| ---------- | --------------------- | -------- |
| Setup      | Devnet + contracts    | High     |
| Onboarding | ZK credential flow    | High     |
| Community  | Anonymous UI          | High     |
| Registry   | Query engine          | High     |
| Payments   | DUST distribution     | Medium   |
| Demo       | End-to-end scenario   | High     |
| Testing    | Stability + UI polish | Medium   |

---

## 11. Demo Scenario

```
1. Patient A → BRCA1 credential issued
2. Patient B → EDS credential issued
3. Both → Opt into registry
4. Researcher → Submit query + DUST
5. System → Returns count + ZK proof
6. System → Distributes DUST to patients
7. Patients → Interact anonymously in community
```

---

## 12. Competitive Differentiation

| Feature        | OrphanLink           | Traditional Systems     |
| -------------- | -------------------- | ----------------------- |
| Identity Model | ZK credentials       | Real identity required  |
| Data Sharing   | Aggregate ZK queries | Raw data transfer       |
| Privacy        | Protocol-enforced    | Policy-based            |
| Monetization   | Patient earns        | No compensation         |
| Architecture   | Dual-layer system    | Single-purpose registry |

---

## 13. Risks and Mitigations

| Risk                      | Mitigation                   |
| ------------------------- | ---------------------------- |
| ZK performance latency    | Pre-computed proofs for demo |
| Smart contract complexity | Use Compact templates        |
| Devnet instability        | Early testing buffer         |
| User crypto friction      | Abstract wallet UX           |
| Low initial dataset       | Global aggregation strategy  |

---

## 14. Future Roadmap

### Phase 1: Community (0–6 months)

* Launch patient communities
* Partner with advocacy groups
* Initial DUST incentive rollout

### Phase 2: Research (6–18 months)

* Onboard pharma partners
* Expand query capabilities
* Integrate with hospital systems

### Phase 3: AI Layer (18–36 months)

* Enable privacy-preserving AI training
* Launch research APIs
* Expand to clinical trials and genomics

---

## 15. Alignment with Midnight RFS

| RFS Category          | Implementation                       |
| --------------------- | ------------------------------------ |
| Rare Disease Registry | Global patient pool with ZK identity |
| AI on Private Data    | ZK-based aggregate query system      |
| Consent Ledger        | Per-query opt-in tracking            |
| EHR Exchange          | Encrypted, provable data sharing     |

---

## 16. Conclusion

OrphanLink demonstrates a complete application of Midnight’s privacy infrastructure:

* Identity abstraction via ZK credentials
* Data utility without exposure
* Incentivized participation through token economics


It transforms rare disease ecosystems from fragmented and opaque systems into a **globally connected, privacy-preserving, and economically aligned network**.

---
