// src/Verify.jsx
// Verifies certificates directly from blockchain — works on any device/domain

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { filebaseGatewayUrl } from "./ipfsClient";
import { getBaseProvider } from "./ethers-client";
import registryMap from "./registry.json";

const REGISTRY_ABI = [
  "function getAddressByString(string keyStr) view returns (address)"
];
const CERT_ABI = [
  "function verifyByCid(string ipfsHash) view returns (string studentName, string course, string className, address issuedTo, uint256 issuedAt, bool exists)"
];

// ─── Get contract instance ────────────────────────────────────────────────────
async function getCertContract() {
  const { provider } = await getBaseProvider();
  const network  = await provider.getNetwork();
  const chainId  = Number(network.chainId);
  const regAddr  = registryMap[String(chainId)];
  if (!regAddr) throw new Error(`No registry for chainId ${chainId}`);
  const registry = new ethers.Contract(regAddr, REGISTRY_ABI, provider);
  const certAddr = await registry.getAddressByString("Certificate");
  if (!certAddr || certAddr === ethers.ZeroAddress) throw new Error("Certificate contract not found.");
  return new ethers.Contract(certAddr, CERT_ABI, provider);
}

// ─── Verify CID on blockchain ─────────────────────────────────────────────────
async function verifyOnChain(cid) {
  const contract = await getCertContract();
  const result   = await contract.verifyByCid(cid.trim());
  return {
    studentName: result.studentName,
    course:      result.course,
    className:   result.className,
    issuedTo:    result.issuedTo,
    issuedAt:    Number(result.issuedAt),
    exists:      result.exists,
  };
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
        const scanner = new Html5Qrcode("qr-reader");
        instanceRef.current = scanner;
        setLoading(false);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            let cid = text.trim();
            try {
              const url = new URL(text);
              const p   = url.searchParams.get("cid");
              if (p) cid = p;
            } catch {}
            onResult(cid);
          },
          () => {}
        );
      } catch (err) {
        setLoading(false);
        const msg = err?.message || String(err);
        setScanError(
          msg.includes("Cannot find module") ? "Run: npm install html5-qrcode"
          : msg.toLowerCase().includes("permission")  ? "Camera permission denied."
          : "Camera error: " + msg
        );
      }
    }
    start();
    return () => {
      if (instanceRef.current) {
        instanceRef.current.stop().catch(() => {});
        instanceRef.current = null;
      }
    };
  }, [onResult]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0f172a", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, width:"min(460px,95vw)", overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>📷 Scan QR Code</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, color:"#94a3b8", cursor:"pointer", width:30, height:30, fontSize:13 }}>✕</button>
        </div>
        <div style={{ background:"#000", minHeight:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {loading && (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:34, height:34, border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #3b82f6", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto" }} />
              <p style={{ color:"#94a3b8", fontSize:14, margin:"12px 0 0" }}>Starting camera…</p>
            </div>
          )}
          {scanError
            ? <div style={{ padding:28, textAlign:"center", color:"#fca5a5", fontSize:13 }}>{scanError}</div>
            : <div id="qr-reader" style={{ width:"100%", minHeight:300 }} />
          }
        </div>
        <p style={{ textAlign:"center", padding:"12px 18px", margin:0, fontSize:13, color:"#64748b", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
          Point camera at the QR code on the certificate
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function CertCard({ data, cid }) {
  const imgUrl      = filebaseGatewayUrl(cid);
  const explorerUrl = `https://amoy.polygonscan.com`;
  const verifyUrl   = `${window.location.origin}?tab=verify&cid=${cid}`;

  return (
    <div style={{ borderRadius:14, border:`2px solid #22c55e`, overflow:"hidden", background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
      {/* Banner */}
      <div style={{ padding:"12px 20px", background:"#14532d", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>✅</span>
        <span style={{ fontWeight:700, fontSize:14, letterSpacing:"0.04em", color:"#f1f5f9" }}>
          CERTIFICATE VERIFIED ON BLOCKCHAIN
        </span>
      </div>

      <div style={{ display:"flex", gap:20, padding:20, flexWrap:"wrap" }}>
        {/* Image */}
        <div style={{ flexShrink:0 }}>
          <img src={imgUrl} alt="Certificate"
            style={{ width:180, height:180, objectFit:"cover", borderRadius:10, border:"1px solid #e2e8f0", display:"block" }}
            onError={(e) => { e.currentTarget.style.display="none"; }}
          />
        </div>

        {/* Details */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", marginBottom:4 }}>{data.studentName}</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>has successfully completed</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#2563eb", marginBottom:4 }}>{data.course}</div>
          {data.className && <div style={{ fontSize:13, color:"#64748b", marginBottom:4 }}>Class: {data.className}</div>}

          <div style={{ height:1, background:"#f1f5f9", margin:"14px 0" }} />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>Issued On</div>
              <div style={{ fontSize:13, color:"#334155", fontWeight:500 }}>
                {new Date(data.issuedAt * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:2 }}>Certificate ID</div>
              <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace", wordBreak:"break-all" }}>{cid}</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <a href={`https://amoy.polygonscan.com/`} target="_blank" rel="noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:7, color:"#1d4ed8", fontSize:12, textDecoration:"none", fontWeight:500 }}>
              ⛓ View on Blockchain
            </a>
            <button onClick={() => navigator.clipboard.writeText(verifyUrl).then(() => alert("Link copied!"))}
              style={{ padding:"7px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:7, color:"#475569", fontSize:12, cursor:"pointer", fontWeight:500 }}>
              🔗 Copy Verify Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Not Found Card ───────────────────────────────────────────────────────────
function NotFoundCard() {
  return (
    <div style={{ borderRadius:14, border:"2px solid #ef4444", overflow:"hidden", background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ padding:"12px 20px", background:"#7f1d1d", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>❌</span>
        <span style={{ fontWeight:700, fontSize:14, letterSpacing:"0.04em", color:"#f1f5f9" }}>
          CERTIFICATE NOT FOUND ON BLOCKCHAIN
        </span>
      </div>
      <div style={{ padding:20, fontSize:14, color:"#475569", lineHeight:1.7 }}>
        This certificate ID does not exist on the blockchain.<br />
        It may be <strong>fake</strong>, invalid, or not yet confirmed.
      </div>
    </div>
  );
}

// ─── Main Verify Component ────────────────────────────────────────────────────
export default function Verify({ initialCid, onCidUsed }) {
  const [inputCid, setInputCid]   = useState("");
  const [result, setResult]       = useState(null);   // { studentName, course, ... }
  const [notFound, setNotFound]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState("");
  const [verifiedCid, setVerifiedCid] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned]         = useState(false);

  // Auto-verify from QR deep link
  useEffect(() => {
    if (initialCid?.trim()) {
      setInputCid(initialCid.trim());
      runVerify(initialCid.trim());
      if (onCidUsed) onCidUsed();
    }
  }, [initialCid]);

  async function runVerify(cid) {
    const trimmed = (cid || "").trim();
    if (!trimmed) { setError("Please enter a Certificate ID."); return; }

    setVerifying(true);
    setResult(null);
    setNotFound(false);
    setError("");
    setVerifiedCid("");

    try {
      const data = await verifyOnChain(trimmed);
      if (!data.exists) {
        setNotFound(true);
      } else {
        setResult(data);
        setVerifiedCid(trimmed);
      }
    } catch (err) {
      setError("Blockchain error: " + (err?.message || String(err)));
    } finally {
      setVerifying(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runVerify(inputCid);
  }

  function handleQRResult(cid) {
    setShowScanner(false);
    setScanned(true);
    setInputCid(cid);
    runVerify(cid);
    setTimeout(() => setScanned(false), 3000);
  }

  return (
    <div style={{ paddingBottom:60 }}>
      {showScanner && <QRScanner onResult={handleQRResult} onClose={() => setShowScanner(false)} />}

      {/* Hero */}
      <div style={{ textAlign:"center", padding:"36px 16px 24px" }}>
        <div style={{ display:"inline-block", padding:"4px 14px", border:"1px solid rgba(59,130,246,0.4)", borderRadius:100, fontSize:11, letterSpacing:"0.12em", color:"#3b82f6", marginBottom:14, background:"rgba(59,130,246,0.07)" }}>
          PUBLIC VERIFICATION PORTAL
        </div>
        <h2 style={{ fontSize:"clamp(22px,4vw,38px)", fontWeight:800, margin:"0 0 12px" }}>
          Verify Certificate <span style={{ color:"#3b82f6" }}>Authenticity</span>
        </h2>
        <p style={{ maxWidth:480, margin:"0 auto", color:"#64748b", fontSize:14, lineHeight:1.7 }}>
          Enter the Certificate ID or scan the QR code. Verified directly on <strong>Polygon Amoy blockchain</strong> — works from anywhere in the world.
        </p>
      </div>

      {/* Search */}
      <div style={{ maxWidth:720, margin:"0 auto", padding:"0 16px" }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <div style={{ flex:1, position:"relative", minWidth:200 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
              <input
                type="text"
                value={inputCid}
                onChange={(e) => setInputCid(e.target.value)}
                placeholder="Paste Certificate ID / CID here…"
                style={{ width:"100%", padding:"12px 36px 12px 38px", border:"1px solid #e2e8f0", borderRadius:10, fontSize:14, outline:"none", boxSizing:"border-box" }}
                autoComplete="off"
                spellCheck={false}
              />
              {inputCid && (
                <button type="button" onClick={() => { setInputCid(""); setResult(null); setNotFound(false); setError(""); }}
                  style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:13 }}>✕</button>
              )}
            </div>
            <button type="submit" disabled={verifying} style={{ padding:"12px 24px", background:"#2563eb", border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:14, cursor: verifying?"not-allowed":"pointer", opacity: verifying?0.7:1, whiteSpace:"nowrap" }}>
              {verifying ? "⏳ Verifying..." : "Verify"}
            </button>
            <button type="button" onClick={() => setShowScanner(true)} style={{ padding:"12px 18px", background:"#f0f9ff", border:"1px solid #7dd3fc", borderRadius:10, color:"#0369a1", fontWeight:600, fontSize:14, cursor:"pointer", whiteSpace:"nowrap" }}>
              📷 Scan QR
            </button>
          </div>
        </form>

        {scanned && (
          <div style={{ marginTop:10, display:"inline-block", padding:"5px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:100, color:"#15803d", fontSize:13 }}>
            ✅ QR scanned
          </div>
        )}

        {/* Verifying spinner */}
        {verifying && (
          <div style={{ marginTop:20, textAlign:"center", padding:"24px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0" }}>
            <div style={{ fontSize:14, color:"#1e3a5f", fontWeight:600 }}>⛓ Querying blockchain...</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>Calling verifyByCid on Polygon Amoy</div>
          </div>
        )}

        {/* Error */}
        {error && !verifying && (
          <div style={{ marginTop:16, padding:"14px 16px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, color:"#b91c1c", fontSize:14 }}>
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {!verifying && (
          <div style={{ marginTop:24 }}>
            {result    && <CertCard data={result} cid={verifiedCid} />}
            {notFound  && <NotFoundCard />}
          </div>
        )}
      </div>
    </div>
  );
}