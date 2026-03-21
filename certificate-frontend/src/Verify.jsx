// src/Verify.jsx
// PUBLIC verification portal — NO MetaMask needed
// Uses public RPC directly — anyone with CID can verify

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { filebaseGatewayUrl } from "./ipfsClient";
import registryMap from "./registry.json";

// ─── Public RPC list for Polygon Amoy — no wallet needed ─────────────────────
const PUBLIC_RPCS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://polygon-amoy.drpc.org",
  "https://rpc.ankr.com/polygon_amoy",
];

const CHAIN_ID = 80002;

const REGISTRY_ABI = [
  "function getAddressByString(string keyStr) view returns (address)"
];
const CERT_ABI = [
  "function verifyByCid(string ipfsHash) view returns (string studentName, string course, string className, address issuedTo, uint256 issuedAt, bool exists)"
];

// ─── Get a working public RPC provider ───────────────────────────────────────
async function getPublicProvider() {
  for (const url of PUBLIC_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url, CHAIN_ID);
      await provider.getBlockNumber(); // health check
      return provider;
    } catch {
      continue; // try next RPC
    }
  }
  throw new Error("All public RPCs failed. Please check your internet connection.");
}

// ─── Verify CID using public RPC — no wallet needed ──────────────────────────
async function verifyOnChain(cid) {
  const provider  = await getPublicProvider();
  const chainId   = String(CHAIN_ID);
  const regAddr   = registryMap[chainId];

  if (!regAddr) throw new Error(`No registry configured for chainId ${chainId}`);

  const registry  = new ethers.Contract(regAddr, REGISTRY_ABI, provider);
  const certAddr  = await registry.getAddressByString("Certificate");

  if (!certAddr || certAddr === ethers.ZeroAddress) {
    throw new Error("Certificate contract not found in registry.");
  }

  const contract  = new ethers.Contract(certAddr, CERT_ABI, provider);
  const cleanCid  = decodeURIComponent(cid.trim());
  const result    = await contract.verifyByCid(cleanCid);

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
        const scanner = new Html5Qrcode("qr-reader-verify");
        instanceRef.current = scanner;
        setLoading(false);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            let cid = text.trim();
            try {
              const url    = new URL(text);
              const param  = url.searchParams.get("cid");
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
          : msg.toLowerCase().includes("permission") ? "Camera permission denied. Please allow camera access in browser settings."
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
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0f172a", border:"1px solid rgba(255,255,255,0.1)", borderRadius:16, width:"min(460px,95vw)", overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>📷 Scan QR Code</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, color:"#94a3b8", cursor:"pointer", width:30, height:30, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>✕</button>
        </div>
        <div style={{ background:"#000", minHeight:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {loading && (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:34, height:34, border:"3px solid rgba(255,255,255,0.1)", borderTop:"3px solid #3b82f6", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
              <p style={{ color:"#94a3b8", fontSize:14, margin:0 }}>Starting camera…</p>
            </div>
          )}
          {scanError
            ? <div style={{ padding:28, textAlign:"center", color:"#fca5a5", fontSize:13, lineHeight:1.6 }}>{scanError}</div>
            : <div id="qr-reader-verify" style={{ width:"100%", minHeight:300 }} />
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

// ─── Verified Certificate Card ────────────────────────────────────────────────
function CertCard({ data, cid }) {
  const imgUrl    = filebaseGatewayUrl(cid);
  const verifyUrl = `${window.location.origin}?tab=verify&cid=${encodeURIComponent(cid)}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(verifyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ borderRadius:14, border:"2px solid #22c55e", overflow:"hidden", background:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
      {/* Banner */}
      <div style={{ padding:"14px 20px", background:"#14532d", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:24 }}>✅</span>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:"#f1f5f9" }}>
            CERTIFICATE VERIFIED ON BLOCKCHAIN
          </div>
          <div style={{ fontSize:11, color:"#86efac", marginTop:2 }}>
            Verified via Polygon Amoy public RPC — no wallet required
          </div>
        </div>
      </div>

      <div style={{ display:"flex", gap:20, padding:20, flexWrap:"wrap" }}>
        {/* Image */}
        <div style={{ flexShrink:0 }}>
          <img
            src={imgUrl}
            alt="Certificate"
            style={{ width:190, height:190, objectFit:"cover", borderRadius:10, border:"1px solid #e2e8f0", display:"block" }}
            onError={(e) => { e.currentTarget.style.display="none"; }}
          />
          <a
            href={imgUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display:"block", textAlign:"center", fontSize:11, color:"#3b82f6", marginTop:6, textDecoration:"none" }}
          >
            🖼 View Full Image
          </a>
        </div>

        {/* Details */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#0f172a", marginBottom:4 }}>
            {data.studentName}
          </div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>
            has successfully completed
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:"#2563eb", marginBottom:6 }}>
            {data.course}
          </div>
          {data.className && (
            <div style={{ fontSize:13, color:"#64748b", marginBottom:4 }}>
              Class / Batch: {data.className}
            </div>
          )}

          <div style={{ height:1, background:"#f1f5f9", margin:"14px 0" }} />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Issued On</div>
              <div style={{ fontSize:13, color:"#334155", fontWeight:600 }}>
                {new Date(data.issuedAt * 1000).toLocaleDateString("en-GB", {
                  day:"2-digit", month:"long", year:"numeric"
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>Certificate ID</div>
              <div style={{ fontSize:10, color:"#334155", fontFamily:"monospace", wordBreak:"break-all", lineHeight:1.4 }}>
                {cid}
              </div>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <a
              href={`https://amoy.polygonscan.com`}
              target="_blank"
              rel="noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"8px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, color:"#1d4ed8", fontSize:12, textDecoration:"none", fontWeight:600 }}
            >
              ⛓ View on Blockchain
            </a>
            <button
              onClick={copyLink}
              style={{
                padding:"8px 14px",
                background: copied ? "#f0fdf4" : "#f8fafc",
                border: `1px solid ${copied ? "#bbf7d0" : "#e2e8f0"}`,
                borderRadius:8, color: copied ? "#15803d" : "#475569",
                fontSize:12, cursor:"pointer", fontWeight:600,
              }}
            >
              {copied ? "✅ Copied!" : "🔗 Share Link"}
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
        <span style={{ fontSize:24 }}>❌</span>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:"#f1f5f9" }}>CERTIFICATE NOT FOUND ON BLOCKCHAIN</div>
          <div style={{ fontSize:11, color:"#fca5a5", marginTop:2 }}>This certificate does not exist on Polygon Amoy</div>
        </div>
      </div>
      <div style={{ padding:20 }}>
        <p style={{ fontSize:14, color:"#475569", lineHeight:1.7, margin:"0 0 12px" }}>
          This certificate ID does not exist on the blockchain.<br />
          It may be <strong>fake</strong>, <strong>invalid</strong>, or the ID may be incomplete.
        </p>
        {cid && (
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#94a3b8", wordBreak:"break-all", background:"#f8fafc", padding:"8px 10px", borderRadius:6, border:"1px solid #e2e8f0" }}>
            Searched for: {cid}
          </div>
        )}
        <div style={{ marginTop:12, fontSize:12, color:"#92400e", background:"#fefce8", padding:"10px 14px", borderRadius:8, border:"1px solid #fde68a" }}>
          💡 Make sure you copied the <strong>full</strong> Certificate ID from the email or certificate document.
        </div>
      </div>
    </div>
  );
}

// ─── Main Verify Component ────────────────────────────────────────────────────
export default function Verify({ initialCid, onCidUsed }) {
  const [inputCid, setInputCid]       = useState("");
  const [result, setResult]           = useState(null);
  const [notFound, setNotFound]       = useState(false);
  const [verifying, setVerifying]     = useState(false);
  const [error, setError]             = useState("");
  const [verifiedCid, setVerifiedCid] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned]         = useState(false);

  // Auto-verify from QR deep link
  useEffect(() => {
    if (initialCid && initialCid.trim()) {
      const decoded = decodeURIComponent(initialCid.trim());
      setInputCid(decoded);
      runVerify(decoded);
      if (onCidUsed) onCidUsed();
    }
  }, [initialCid]);

  async function runVerify(cid) {
    const trimmed = decodeURIComponent((cid || "").trim());
    if (!trimmed) {
      setError("Please enter a Certificate ID.");
      return;
    }

    setVerifying(true);
    setResult(null);
    setNotFound(false);
    setError("");
    setVerifiedCid("");

    try {
      const data = await verifyOnChain(trimmed);
      setVerifiedCid(trimmed);
      if (!data.exists) {
        setNotFound(true);
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error("Verify error:", err);
      setError("Error: " + (err?.message || String(err)));
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
    const decoded = decodeURIComponent(cid);
    setInputCid(decoded);
    runVerify(decoded);
    setTimeout(() => setScanned(false), 3000);
  }

  function handleClear() {
    setInputCid("");
    setResult(null);
    setNotFound(false);
    setError("");
    setVerifiedCid("");
  }

  return (
    <div style={{ paddingBottom:60 }}>
      {showScanner && (
        <QRScanner onResult={handleQRResult} onClose={() => setShowScanner(false)} />
      )}

      {/* Hero */}
      <div style={{ textAlign:"center", padding:"36px 16px 24px" }}>
        <div style={{ display:"inline-block", padding:"4px 14px", border:"1px solid rgba(59,130,246,0.4)", borderRadius:100, fontSize:11, letterSpacing:"0.12em", color:"#3b82f6", marginBottom:14, background:"rgba(59,130,246,0.07)" }}>
          PUBLIC VERIFICATION PORTAL
        </div>
        <h2 style={{ fontSize:"clamp(22px,4vw,38px)", fontWeight:800, margin:"0 0 12px", color:"#0f172a" }}>
          Verify Certificate{" "}
          <span style={{ color:"#3b82f6" }}>Authenticity</span>
        </h2>
        <p style={{ maxWidth:500, margin:"0 auto", color:"#64748b", fontSize:14, lineHeight:1.7 }}>
          Enter the Certificate ID or scan the QR code.
          Verified directly on <strong>Polygon Amoy blockchain</strong>.
          <br />
          <span style={{ color:"#22c55e", fontWeight:600 }}>
            ✅ No wallet or MetaMask needed — works for everyone
          </span>
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
                style={{
                  width:"100%", padding:"13px 36px 13px 40px",
                  border:"1px solid #e2e8f0", borderRadius:10,
                  fontSize:14, outline:"none", boxSizing:"border-box",
                  fontFamily:"monospace",
                }}
                autoComplete="off"
                spellCheck={false}
              />
              {inputCid && (
                <button type="button" onClick={handleClear}
                  style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:14, padding:"2px 4px" }}>
                  ✕
                </button>
              )}
            </div>
            <button type="submit" disabled={verifying} style={{
              padding:"13px 24px", background:"#2563eb", border:"none",
              borderRadius:10, color:"#fff", fontWeight:700, fontSize:14,
              cursor: verifying ? "not-allowed" : "pointer",
              opacity: verifying ? 0.7 : 1, whiteSpace:"nowrap",
            }}>
              {verifying ? "⏳ Verifying..." : "Verify"}
            </button>
            <button type="button" onClick={() => setShowScanner(true)} style={{
              padding:"13px 18px", background:"#f0f9ff",
              border:"1px solid #7dd3fc", borderRadius:10,
              color:"#0369a1", fontWeight:600, fontSize:14,
              cursor:"pointer", whiteSpace:"nowrap",
            }}>
              📷 Scan QR
            </button>
          </div>
        </form>

        {scanned && (
          <div style={{ marginTop:10, display:"inline-block", padding:"5px 14px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:100, color:"#15803d", fontSize:13 }}>
            ✅ QR scanned successfully
          </div>
        )}

        {/* Verifying */}
        {verifying && (
          <div style={{ marginTop:20, textAlign:"center", padding:"24px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0" }}>
            <div style={{ fontSize:14, color:"#1e3a5f", fontWeight:600 }}>⛓ Querying Polygon Amoy blockchain...</div>
            <div style={{ fontSize:12, color:"#64748b", marginTop:4 }}>Using public RPC — no wallet needed</div>
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
            {result   && <CertCard data={result} cid={verifiedCid} />}
            {notFound && <NotFoundCard cid={verifiedCid} />}
          </div>
        )}

        {/* How it works */}
        {!result && !notFound && !verifying && !error && (
          <div style={{ marginTop:32, display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
            {[
              { n:"1", text:"Get Certificate ID from email or printed certificate" },
              { n:"2", text:"Paste it above or scan the QR code" },
              { n:"3", text:"Instant blockchain verification — no account needed" },
            ].map(({ n, text }) => (
              <div key={n} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10 }}>
                <span style={{ width:22, height:22, borderRadius:"50%", background:"rgba(59,130,246,0.15)", color:"#3b82f6", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {n}
                </span>
                <span style={{ fontSize:13, color:"#64748b" }}>{text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}