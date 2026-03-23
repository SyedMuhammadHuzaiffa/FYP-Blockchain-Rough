// src/Verify.jsx
// PUBLIC verification portal — NO MetaMask needed
// Checks BOTH contracts:
//   1. Certificate.sol  — Single/Bulk tab certs
//   2. MerkleCertificate.sol — AI Generator certs
//      Proof comes from initialMp prop (passed by App.jsx from ?mp= URL param)
//      OR from localStorage (same device fallback)

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { filebaseGatewayUrl } from "./ipfsClient";
import MERKLE_ABI from "./merkle-abi.json";
import { verifyLocally } from "./libs/merkleUtils";

const OLD_CONTRACT   = "0xd274A64A924491032ADf7A12E58Bd4662Fd36E69";
const MERKLE_ADDRESS = "0xa9e704750FdF85D168965db823728199840EC840";

const OLD_ABI = [
  "function verify(string cid) view returns (string name, string competition, uint256 issuedAt, bool exists)"
];

const PUBLIC_RPCS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://polygon-amoy.drpc.org",
];

async function getProvider() {
  for (const url of PUBLIC_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 80002);
      await p.getBlockNumber();
      return p;
    } catch { continue; }
  }
  throw new Error("All public RPCs failed. Check internet connection.");
}

async function checkOldContract(cid) {
  const provider = await getProvider();
  const contract = new ethers.Contract(OLD_CONTRACT, OLD_ABI, provider);
  const result   = await contract.verify(cid);
  if (!result.exists) return null;
  return {
    source:      "certificate",
    studentName: result.name,
    course:      result.competition,
    issuedAt:    Number(result.issuedAt),
    exists:      true,
    cid,
  };
}

// Parse merkle data from the prop (already read from URL by App.jsx)
function parseMpProp(mpString) {
  if (!mpString) return null;
  try {
    return JSON.parse(decodeURIComponent(mpString));
  } catch { return null; }
}

// Fallback: check localStorage (same device only)
function getMerkleDataFromStorage(cid) {
  try {
    const batches = JSON.parse(localStorage.getItem("merkle_batches") || "[]");
    for (const batch of batches) {
      const cert = batch.certs?.find(c => c.cid === cid);
      if (cert) return {
        batchId:     batch.batchId,
        name:        cert.name,
        competition: cert.competition,
        proof:       cert.proof,
        root:        batch.root,
        txHash:      batch.txHash,
        issuedAt:    batch.issuedAt,
        batchDesc:   batch.description,
      };
    }
  } catch { /* ignore */ }
  return null;
}

async function verifyMerkleData(cid, data) {
  if (!data) return null;

  const localValid = verifyLocally(data.root, cid, data.name, data.competition, data.proof);
  if (!localValid) return null;

  try {
    const provider = await getProvider();
    const contract = new ethers.Contract(MERKLE_ADDRESS, MERKLE_ABI, provider);
    const [valid, issuedAt, description] = await contract.verify(
      data.batchId, cid, data.name, data.competition, data.proof
    );
    if (!valid) return null;
    return {
      source:      "merkle",
      studentName: data.name,
      course:      data.competition,
      issuedAt:    Number(issuedAt),
      exists:      true,
      cid,
      batchId:     data.batchId,
      batchDesc:   description || data.batchDesc,
      txHash:      data.txHash,
      merkleRoot:  data.root,
    };
  } catch {
    // RPC failed — trust local proof
    return {
      source:      "merkle",
      studentName: data.name,
      course:      data.competition,
      issuedAt:    data.issuedAt,
      exists:      true,
      cid,
      batchId:     data.batchId,
      batchDesc:   data.batchDesc,
      txHash:      data.txHash,
      merkleRoot:  data.root,
      localOnly:   true,
    };
  }
}

async function verifyAnywhere(cid, merkleDataFromUrl, setStep) {
  const cleanCid = decodeURIComponent(cid.trim());

  setStep("Checking Certificate.sol...");
  const oldResult = await checkOldContract(cleanCid).catch(() => null);
  if (oldResult) return oldResult;

  setStep("Checking Merkle proof...");
  // Prefer data passed directly from App.jsx (from URL), then fall back to localStorage
  const merkleData = merkleDataFromUrl || getMerkleDataFromStorage(cleanCid);
  if (merkleData) {
    const result = await verifyMerkleData(cleanCid, merkleData);
    if (result) return result;
  }

  return { exists: false, cid: cleanCid };
}

// ─── QR Scanner ───────────────────────────────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const instanceRef = useRef(null);
  const [scanError, setScanError] = useState("");
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("qr-reader-verify");
        instanceRef.current = scanner;
        setLoading(false);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            let cid = text.trim();
            try {
              const url   = new URL(text);
              const param = url.searchParams.get("cid");
              if (param) cid = decodeURIComponent(param);
            } catch { /* raw CID */ }
            onResult(cid);
          },
          () => {}
        );
      } catch (err) {
        setLoading(false);
        const msg = err?.message || String(err);
        setScanError(
          msg.includes("Cannot find module") ? "Run: npm install html5-qrcode"
          : msg.toLowerCase().includes("permission") ? "Camera permission denied."
          : "Camera error: " + msg
        );
      }
    }
    start();
    return () => {
      if (instanceRef.current) { instanceRef.current.stop().catch(() => {}); instanceRef.current = null; }
    };
  }, [onResult]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0f172a", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, width:"min(460px,95vw)", overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>Scan QR Code</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, color:"#94a3b8", cursor:"pointer", width:30, height:30, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>X</button>
        </div>
        <div style={{ background:"#000", minHeight:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {loading && (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:34, height:34, border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #3b82f6", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
              <p style={{ color:"#94a3b8", fontSize:14, margin:0 }}>Starting camera...</p>
            </div>
          )}
          {scanError
            ? <div style={{ padding:28, textAlign:"center", color:"#fca5a5", fontSize:13 }}>{scanError}</div>
            : <div id="qr-reader-verify" style={{ width:"100%", minHeight:300 }} />
          }
        </div>
        <p style={{ textAlign:"center", padding:"12px 18px", margin:0, fontSize:13, color:"#64748b" }}>
          Point camera at the QR code on the certificate
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Verified Card ────────────────────────────────────────────────────────────
function CertCard({ data, cid }) {
  const imgUrl    = filebaseGatewayUrl(cid);
  const verifyUrl = window.location.origin + "?tab=verify&cid=" + encodeURIComponent(cid);
  const [copied, setCopied] = useState(false);
  const isMerkle  = data.source === "merkle";

  return (
    <div style={{ borderRadius:14, border:"2px solid #22c55e", overflow:"hidden", background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ padding:"14px 20px", background:"#14532d", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:22 }}>✅</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:15, color:"#f1f5f9" }}>CERTIFICATE VERIFIED ON BLOCKCHAIN</div>
          <div style={{ fontSize:11, color:"#86efac", marginTop:2 }}>
            {isMerkle ? "Verified via Merkle proof — Polygon Amoy" : "Verified via Certificate.sol — Polygon Amoy"}
          </div>
        </div>
        <div style={{ padding:"3px 10px", borderRadius:100, fontSize:11, fontWeight:700,
          background: isMerkle ? "rgba(124,58,237,0.3)" : "rgba(37,99,235,0.3)",
          color:      isMerkle ? "#c4b5fd"               : "#93c5fd" }}>
          {isMerkle ? "Merkle Batch" : "Certificate"}
        </div>
      </div>

      <div style={{ display:"flex", gap:20, padding:20, flexWrap:"wrap" }}>
        <div style={{ flexShrink:0 }}>
          <img src={imgUrl} alt="Certificate"
            style={{ width:190, height:190, objectFit:"cover", borderRadius:10, border:"1px solid #e2e8f0", display:"block" }}
            onError={e => { e.currentTarget.style.display="none"; }} />
          <a href={imgUrl} target="_blank" rel="noreferrer"
            style={{ display:"block", textAlign:"center", fontSize:11, color:"#3b82f6", marginTop:6, textDecoration:"none" }}>
            View Full Image
          </a>
        </div>

        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#0f172a", marginBottom:4 }}>{data.studentName}</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>has successfully completed</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#2563eb", marginBottom:6 }}>{data.course}</div>
          <div style={{ height:1, background:"#f1f5f9", margin:"14px 0" }} />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Issued on</div>
              <div style={{ fontSize:13, color:"#334155", fontWeight:600 }}>
                {data.issuedAt ? new Date(data.issuedAt * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" }) : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>
                {isMerkle ? "Batch ID" : "Certificate ID"}
              </div>
              <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace", wordBreak:"break-all", lineHeight:1.4 }}>
                {isMerkle ? "Batch #" + data.batchId : cid}
              </div>
            </div>
          </div>

          {isMerkle && (
            <div style={{ padding:"10px 12px", background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:8, marginBottom:12, fontSize:12 }}>
              <div style={{ fontWeight:700, color:"#7c3aed", marginBottom:4 }}>Merkle Batch Certificate</div>
              <div style={{ color:"#6d28d9", lineHeight:1.6 }}>
                {data.batchDesc && <span>Batch: {data.batchDesc}<br /></span>}
                Root: <code style={{ fontFamily:"monospace", fontSize:10 }}>{data.merkleRoot?.slice(0,24)}...</code>
                {data.localOnly && <><br /><span style={{ color:"#92400e" }}>Verified locally (RPC unavailable)</span></>}
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {data.txHash && (
              <a href={"https://amoy.polygonscan.com/tx/" + data.txHash} target="_blank" rel="noreferrer"
                style={{ padding:"8px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, color:"#1d4ed8", fontSize:12, textDecoration:"none", fontWeight:600 }}>
                View on Blockchain
              </a>
            )}
            <button onClick={() => { navigator.clipboard.writeText(verifyUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
              style={{ padding:"8px 14px", background: copied?"#f0fdf4":"#f8fafc", border:"1px solid "+(copied?"#bbf7d0":"#e2e8f0"), borderRadius:8, color: copied?"#15803d":"#475569", fontSize:12, cursor:"pointer", fontWeight:600 }}>
              {copied ? "Copied!" : "Share Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Not Found Card ───────────────────────────────────────────────────────────
function NotFoundCard({ cid }) {
  return (
    <div style={{ borderRadius:14, border:"2px solid #ef4444", overflow:"hidden", background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ padding:"14px 20px", background:"#7f1d1d", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:22 }}>❌</span>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:"#f1f5f9" }}>CERTIFICATE NOT FOUND</div>
          <div style={{ fontSize:11, color:"#fca5a5", marginTop:2 }}>Checked both Certificate.sol and Merkle batches</div>
        </div>
      </div>
      <div style={{ padding:20 }}>
        <p style={{ fontSize:14, color:"#475569", lineHeight:1.7, margin:"0 0 12px" }}>
          This certificate was not found on the blockchain.<br />
          It may be <strong>fake</strong>, <strong>invalid</strong>, or you need to use the full link from your email.
        </p>
        {cid && (
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#94a3b8", wordBreak:"break-all", background:"#f8fafc", padding:"8px 10px", borderRadius:6, border:"1px solid #e2e8f0" }}>
            Searched: {cid}
          </div>
        )}
        <div style={{ marginTop:12, fontSize:12, color:"#92400e", background:"#fefce8", padding:"10px 14px", borderRadius:8, border:"1px solid #fde68a" }}>
          If you received this by email — open the <strong>full link</strong> from the email, do not paste just the CID.
        </div>
      </div>
    </div>
  );
}

// ─── Main Verify Component ────────────────────────────────────────────────────
// Now accepts initialMp prop from App.jsx (read from URL before it gets wiped)
export default function Verify({ initialCid, initialMp, onCidUsed }) {
  const [inputCid, setInputCid]       = useState("");
  const [result, setResult]           = useState(null);
  const [notFound, setNotFound]       = useState(false);
  const [verifying, setVerifying]     = useState(false);
  const [verifyStep, setVerifyStep]   = useState("");
  const [error, setError]             = useState("");
  const [verifiedCid, setVerifiedCid] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned]         = useState(false);

  // Store merkle data from URL so it persists after URL is wiped
  const merkleDataRef = useRef(null);

  useEffect(() => {
    if (initialCid && initialCid.trim()) {
      const decoded = decodeURIComponent(initialCid.trim());
      setInputCid(decoded);

      // Parse merkle data from prop BEFORE it gets cleared
      if (initialMp) {
        try {
          merkleDataRef.current = JSON.parse(decodeURIComponent(initialMp));
        } catch { merkleDataRef.current = null; }
      }

      runVerify(decoded, merkleDataRef.current);
      if (onCidUsed) onCidUsed();
    }
  }, [initialCid, initialMp]);

  async function runVerify(cid, merkleDataOverride) {
    const trimmed = decodeURIComponent((cid || "").trim());
    if (!trimmed) { setError("Please enter a Certificate ID."); return; }
    setVerifying(true);
    setResult(null);
    setNotFound(false);
    setError("");
    setVerifiedCid("");

    // Use passed-in merkle data, or what was stored from the URL prop
    const merkleData = merkleDataOverride !== undefined
      ? merkleDataOverride
      : merkleDataRef.current;

    try {
      const data = await verifyAnywhere(trimmed, merkleData, setVerifyStep);
      setVerifiedCid(trimmed);
      if (data.exists) setResult(data);
      else setNotFound(true);
    } catch (err) {
      setError("Error: " + (err?.message || String(err)));
    } finally {
      setVerifying(false);
      setVerifyStep("");
    }
  }

  function handleManualVerify(cid) {
    // Manual search — no merkle data from URL, only localStorage fallback
    merkleDataRef.current = null;
    runVerify(cid, null);
  }

  function handleQRResult(cid) {
    setShowScanner(false);
    setScanned(true);
    const decoded = decodeURIComponent(cid);
    setInputCid(decoded);
    handleManualVerify(decoded);
    setTimeout(() => setScanned(false), 3000);
  }

  return (
    <div style={{ paddingBottom:60 }}>
      {showScanner && <QRScanner onResult={handleQRResult} onClose={() => setShowScanner(false)} />}

      <div style={{ textAlign:"center", padding:"36px 16px 24px" }}>
        <div style={{ display:"inline-block", padding:"4px 14px", border:"1px solid rgba(59,130,246,0.4)", borderRadius:100, fontSize:11, letterSpacing:"0.12em", color:"#3b82f6", marginBottom:14, background:"rgba(59,130,246,0.07)" }}>
          PUBLIC VERIFICATION PORTAL
        </div>
        <h2 style={{ fontSize:"clamp(22px,4vw,38px)", fontWeight:800, margin:"0 0 12px", color:"#0f172a" }}>
          Verify Certificate <span style={{ color:"#3b82f6" }}>Authenticity</span>
        </h2>
        <p style={{ maxWidth:520, margin:"0 auto", color:"#64748b", fontSize:14, lineHeight:1.7 }}>
          Checks both <strong>Certificate.sol</strong> and <strong>Merkle batch contracts</strong>.<br />
          <span style={{ color:"#22c55e", fontWeight:600 }}>✅ No wallet or MetaMask needed — works for everyone</span>
        </p>
      </div>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"0 16px" }}>
        <form onSubmit={e => { e.preventDefault(); handleManualVerify(inputCid); }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <div style={{ flex:1, position:"relative", minWidth:200 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
              <input type="text" value={inputCid} onChange={e => setInputCid(e.target.value)}
                placeholder="Paste Certificate ID / CID here..."
                style={{ width:"100%", padding:"13px 36px 13px 40px", border:"1px solid #e2e8f0", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
                autoComplete="off" spellCheck={false} />
              {inputCid && (
                <button type="button" onClick={() => { setInputCid(""); setResult(null); setNotFound(false); setError(""); }}
                  style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:14 }}>✕</button>
              )}
            </div>
            <button type="submit" disabled={verifying}
              style={{ padding:"13px 24px", background:"#2563eb", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor: verifying?"not-allowed":"pointer", opacity: verifying?0.7:1, whiteSpace:"nowrap" }}>
              {verifying ? "Verifying..." : "Verify"}
            </button>
            <button type="button" onClick={() => setShowScanner(true)}
              style={{ padding:"13px 18px", background:"#f0f9ff", border:"1px solid #7dd3fc", borderRadius:10, color:"#0369a1", fontWeight:600, fontSize:14, cursor:"pointer", whiteSpace:"nowrap" }}>
              📷 Scan QR
            </button>
          </div>
        </form>

        {scanned && <div style={{ marginTop:10, display:"inline-block", padding:"5px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:100, color:"#15803d", fontSize:13 }}>✅ QR scanned</div>}

        {verifying && (
          <div style={{ marginTop:20, textAlign:"center", padding:"24px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0" }}>
            <div style={{ fontSize:14, color:"#1e3a5f", fontWeight:600, marginBottom:8 }}>Querying blockchain...</div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              {[
                { label:"Certificate.sol", active: verifyStep.includes("Certificate") },
                { label:"Merkle proof",    active: verifyStep.includes("Merkle") },
              ].map(({ label, active }) => (
                <div key={label} style={{ padding:"4px 12px", borderRadius:100, fontSize:12, fontWeight:600,
                  background: active?"#eff6ff":"#f8fafc", color: active?"#1d4ed8":"#94a3b8",
                  border:"1px solid "+(active?"#bfdbfe":"#e2e8f0") }}>
                  {active ? "Checking " : ""}{label}
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:8 }}>No wallet needed</div>
          </div>
        )}

        {error && !verifying && (
          <div style={{ marginTop:16, padding:"14px 16px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, color:"#b91c1c", fontSize:14 }}>{error}</div>
        )}

        {!verifying && (
          <div style={{ marginTop:24 }}>
            {result   && <CertCard data={result} cid={verifiedCid} />}
            {notFound && <NotFoundCard cid={verifiedCid} />}
          </div>
        )}

        {!result && !notFound && !verifying && !error && (
          <div style={{ marginTop:32, display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
            {[
              { n:"1", text:"Get the full link from your email" },
              { n:"2", text:"Click the link — proof is embedded automatically" },
              { n:"3", text:"Instant verification on any device" },
            ].map(({ n, text }) => (
              <div key={n} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10 }}>
                <span style={{ width:22, height:22, borderRadius:"50%", background:"rgba(59,130,246,0.15)", color:"#3b82f6", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{n}</span>
                <span style={{ fontSize:13, color:"#64748b" }}>{text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}