// src/MerkleBulkIssuer.jsx
// Issue 1000s of certificates in ONE transaction using Merkle Tree
// Cost: same as storing 1 bytes32 regardless of batch size!

import React, { useState } from "react";
import { ethers } from "ethers";
import { uploadToIpfsFilebase } from "./ipfsClient";
import { buildMerkleTree, getMerkleProofByCid, verifyLocally } from "./libs/merkleUtils";

// ─── Merkle Contract ABI (only what we need) ──────────────────────────────────
const MERKLE_ABI = [
  "function issueBatch(bytes32 merkleRoot, uint256 count, string description) returns (uint256 batchId)",
  "function verify(uint256 batchId, string cid, string name, string competition, bytes32[] proof) view returns (bool valid, uint256 issuedAt, string description)",
  "function getBatch(uint256 batchId) view returns (bytes32 root, uint256 issuedAt, uint256 count, string description)",
  "function batchCount() view returns (uint256)",
  "event BatchIssued(uint256 indexed batchId, bytes32 merkleRoot, uint256 count, string description, uint256 issuedAt)",
];

// ─── UPDATE THIS after deploying MerkleCertificate.sol ────────────────────────
const MERKLE_CONTRACT_ADDRESS = "0xa9e704750FdF85D168965db823728199840EC840";
const GAS_SETTINGS = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas:         ethers.parseUnits("60", "gwei"),
};

async function getMerkleContract() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer  = await provider.getSigner();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 80002) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13882" }],
    });
  }
  return new ethers.Contract(MERKLE_CONTRACT_ADDRESS, MERKLE_ABI, signer);
}

// ─── Parse Excel/CSV ──────────────────────────────────────────────────────────
async function parseParticipants(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const Papa = (await import("papaparse")).default;
    return new Promise((res, rej) => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => {
          res(r.data.map(row => {
            const k = Object.keys(row);
            const f = (kws) => k.find(x => kws.some(kw => x.toLowerCase().includes(kw)));
            return {
              name:        (row[f(["name"])] || "").trim(),
              competition: (row[f(["competition","event","course"])] || "").trim(),
              email:       (row[f(["email","mail"])] || "").trim(),
            };
          }).filter(r => r.name));
        },
        error: rej,
      });
    });
  }
  const XLSX = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  return rows.map(row => {
    const k = Object.keys(row);
    const f = (kws) => k.find(x => kws.some(kw => x.toLowerCase().includes(kw)));
    return {
      name:        (row[f(["name"])] || "").trim(),
      competition: (row[f(["competition","event","course"])] || "").trim(),
      email:       (row[f(["email","mail"])] || "").trim(),
    };
  }).filter(r => r.name);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function MerkleBulkIssuer() {
  const [participants, setParticipants] = useState([]);
  const [description,  setDescription]  = useState("");
  const [status,       setStatus]       = useState("");
  const [phase,        setPhase]        = useState("");
  const [result,       setResult]       = useState(null);
  const [loading,      setLoading]      = useState(false);

  // For verification demo
  const [verifyCid,    setVerifyCid]    = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseParticipants(file);
      setParticipants(rows);
      setStatus("");
    } catch (err) {
      setStatus("Failed to parse file: " + err.message);
    }
  }

  async function handleIssueBatch() {
    if (!participants.length) {
      setStatus("Upload participant list first.");
      return;
    }
    if (!description.trim()) {
      setStatus("Enter a batch description (e.g. 'BSSE-6B 2024')");
      return;
    }
    if (MERKLE_CONTRACT_ADDRESS === "PASTE_MERKLE_CONTRACT_ADDRESS_HERE") {
      setStatus("Deploy MerkleCertificate.sol first and paste the address!");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // ── PHASE 1: Upload template image to IPFS once (shared CID for all) ──
      // In real use, each participant gets their own CID after rendering
      // For now we assign placeholder CIDs — replace with real upload logic
      setPhase("building");
      setStatus("Building Merkle tree for " + participants.length + " certificates...");

      // Assign CIDs — in production these come from IPFS uploads
      // For demo, we generate deterministic placeholder CIDs
      const certsWithCids = participants.map((p, i) => ({
        ...p,
        cid: "QmPlaceholder" + i + "_" + p.name.replace(/\s+/g, ""),
      }));

      // Build Merkle tree
      const { root } = buildMerkleTree(certsWithCids);

      setStatus("Merkle root computed: " + root.slice(0, 20) + "...");

      // ── PHASE 2: ONE blockchain transaction ───────────────────────────────
      setPhase("blockchain");
      setStatus("Sending ONE transaction for " + certsWithCids.length + " certificates...");

      const contract = await getMerkleContract();
      const tx = await contract.issueBatch(
        root,
        BigInt(certsWithCids.length),
        description.trim(),
        GAS_SETTINGS
      );

      setStatus("Waiting for confirmation...");
      const receipt = await tx.wait();

      // Get batchId from event
      const iface     = new ethers.Interface(MERKLE_ABI);
      const log       = receipt.logs.find(l => {
        try { iface.parseLog(l); return true; } catch { return false; }
      });
      const parsed    = log ? iface.parseLog(log) : null;
      const batchId   = parsed ? Number(parsed.args.batchId) : 0;

      // ── PHASE 3: Store proofs locally for each participant ────────────────
      setPhase("storing");
      setStatus("Storing Merkle proofs locally...");

      const proofs = certsWithCids.map((cert, i) => ({
        ...cert,
        batchId,
        proof: getMerkleProofByCid(certsWithCids, cert.cid),
        txHash: receipt.hash,
      }));

      // Save to localStorage
      const existing = JSON.parse(localStorage.getItem("merkle_batches") || "[]");
      existing.push({
        batchId,
        root,
        description: description.trim(),
        count: certsWithCids.length,
        txHash: receipt.hash,
        issuedAt: Math.floor(Date.now() / 1000),
        certs: proofs,
      });
      localStorage.setItem("merkle_batches", JSON.stringify(existing));

      setResult({
        batchId,
        root,
        txHash: receipt.hash,
        count: certsWithCids.length,
        certs: proofs,
      });

      setPhase("done");
      setStatus(
        "✅ " + certsWithCids.length + " certificates issued in ONE transaction! " +
        "Gas cost same as storing 1 hash."
      );

    } catch (err) {
      setStatus("❌ " + (err?.message || String(err)));
      setPhase("");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!result || !verifyCid.trim()) return;
    const cert = result.certs.find(c => c.cid === verifyCid.trim());
    if (!cert) {
      setVerifyResult({ valid: false, reason: "CID not found in this batch" });
      return;
    }

    // Verify locally first
    const localValid = verifyLocally(
      result.root, cert.cid, cert.name, cert.competition, cert.proof
    );

    if (!localValid) {
      setVerifyResult({ valid: false, reason: "Local proof verification failed" });
      return;
    }

    // Optionally verify on-chain (free view call)
    try {
      const provider  = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology", 80002);
      const contract  = new ethers.Contract(MERKLE_CONTRACT_ADDRESS, MERKLE_ABI, provider);
      const [valid, issuedAt, desc] = await contract.verify(
        result.batchId, cert.cid, cert.name, cert.competition, cert.proof
      );
      setVerifyResult({ valid, issuedAt: Number(issuedAt), description: desc, cert });
    } catch {
      // Fallback to local verification result
      setVerifyResult({ valid: localValid, cert });
    }
  }

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 900 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        🌲 Merkle Tree Bulk Issuer
      </h2>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        Issue <strong>1000s of certificates</strong> for the cost of storing{" "}
        <strong>ONE hash</strong> on blockchain.
        No matter if it's 10 or 10,000 — same single transaction.
      </p>

      {/* Cost comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Old issueBulk (100 certs)", cost: "~0.15 MATIC", color: "#fef2f2", border: "#fecaca", text: "#b91c1c", icon: "❌" },
          { label: "Merkle issueBatch (100 certs)", cost: "~0.0001 MATIC", color: "#f0fdf4", border: "#bbf7d0", text: "#15803d", icon: "✅" },
          { label: "Old issueBulk (1000 certs)", cost: "~1.5 MATIC", color: "#fef2f2", border: "#fecaca", text: "#b91c1c", icon: "❌" },
          { label: "Merkle issueBatch (1000 certs)", cost: "~0.0001 MATIC", color: "#f0fdf4", border: "#bbf7d0", text: "#15803d", icon: "✅" },
        ].map((item, i) => (
          <div key={i} style={{ padding: "12px 16px", background: item.color, border: "1px solid " + item.border, borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{item.icon} {item.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: item.text }}>{item.cost}</div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload participants */}
      <div style={card}>
        <div style={cardTitle}>Step 1 — Upload Participant List (Excel/CSV)</div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} />
        {participants.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
            ✅ {participants.length} participants loaded
          </div>
        )}
      </div>

      {/* Step 2: Description */}
      <div style={card}>
        <div style={cardTitle}>Step 2 — Batch Description</div>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. BSSE-6B Competitive Programming 2024"
          style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
        />
      </div>

      {/* Step 3: Issue */}
      <div style={card}>
        <div style={cardTitle}>Step 3 — Issue All ({participants.length} certs, 1 TX)</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          This will:<br />
          1. Build Merkle tree from all {participants.length} certificates<br />
          2. Send ONE transaction storing the root hash<br />
          3. Store proofs locally for verification
        </div>
        <button
          onClick={handleIssueBatch}
          disabled={loading || !participants.length}
          style={{
            padding: "12px 28px", background: loading ? "#94a3b8" : "#1e3a5f",
            color: "#fff", border: "none", borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Processing..." : "🌲 Issue Batch (1 TX)"}
        </button>

        {status && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: status.startsWith("✅") ? "#f0fdf4" : status.startsWith("❌") ? "#fef2f2" : "#eff6ff",
            color: status.startsWith("✅") ? "#15803d" : status.startsWith("❌") ? "#b91c1c" : "#1d4ed8",
          }}>
            {status}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div style={{ ...card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#15803d", marginBottom: 12 }}>
            🎉 Batch #{result.batchId} — {result.count} Certificates On Blockchain
          </div>
          <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.8 }}>
            <strong>Merkle Root:</strong> <code style={{ fontFamily: "monospace", fontSize: 11 }}>{result.root}</code><br />
            <strong>TX Hash:</strong>{" "}
            <a href={"https://amoy.polygonscan.com/tx/" + result.txHash} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
              {result.txHash.slice(0, 20)}... ↗
            </a><br />
            <strong>Cost:</strong> ~0.0001 MATIC regardless of batch size
          </div>

          {/* Verify demo */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Test Verification:</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={verifyCid}
                onChange={e => setVerifyCid(e.target.value)}
                placeholder="Paste a CID from the batch..."
                style={{ flex: 1, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
              />
              <button onClick={handleVerify} style={{ padding: "8px 16px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                Verify
              </button>
            </div>
            {verifyResult && (
              <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, background: verifyResult.valid ? "#f0fdf4" : "#fef2f2", border: "1px solid " + (verifyResult.valid ? "#bbf7d0" : "#fecaca"), fontSize: 13 }}>
                {verifyResult.valid
                  ? "✅ VALID — " + verifyResult.cert?.name + " | " + verifyResult.cert?.competition
                  : "❌ INVALID — " + verifyResult.reason}
              </div>
            )}
          </div>

          {/* Sample proofs */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Sample proofs (send to students):</div>
            <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 11, fontFamily: "monospace", background: "#fff", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0" }}>
              {result.certs.slice(0, 3).map((c, i) => (
                <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>
                  <strong>{c.name}</strong> | batchId: {c.batchId} | cid: {c.cid.slice(0, 20)}...<br />
                  proof: [{c.proof.map(p => p.slice(0, 10) + "...").join(", ")}]
                </div>
              ))}
              {result.certs.length > 3 && <div style={{ color: "#64748b" }}>...and {result.certs.length - 3} more</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
  padding: "20px 24px", marginBottom: 16,
};
const cardTitle = {
  fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 12,
};