// src/Verify.jsx
import React, { useState, useEffect, useRef } from "react";
import { getIssued } from "./libs/store";
import { filebaseGatewayUrl } from "./ipfsClient";

// ─── QR Scanner ───────────────────────────────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const instanceRef = useRef(null);
  const [scanError, setScanError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let html5QrCode = null;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        html5QrCode = new Html5Qrcode("qr-reader");
        instanceRef.current = html5QrCode;
        setLoading(false);

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Extract CID from URL or use raw text
            let cid = decodedText.trim();
            try {
              const url = new URL(decodedText);
              const fromParam = url.searchParams.get("cid");
              if (fromParam) cid = fromParam;
            } catch {
              // not a URL, use as-is
            }
            onResult(cid);
          },
          () => {}
        );
      } catch (err) {
        setLoading(false);
        const msg = err && err.message ? err.message : String(err);
        if (msg.includes("Cannot find module")) {
          setScanError("Run: npm install html5-qrcode");
        } else if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
          setScanError("Camera permission denied. Please allow camera access.");
        } else {
          setScanError("Could not start camera: " + msg);
        }
      }
    }

    startScanner();

    return () => {
      if (instanceRef.current) {
        instanceRef.current.stop().catch(() => {});
        instanceRef.current = null;
      }
    };
  }, [onResult]);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>📷 Scan QR Code</span>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.viewfinder}>
          {loading && (
            <div style={styles.loadingBox}>
              <div style={styles.spinner} />
              <p style={{ color: "#94a3b8", fontSize: 14, margin: "12px 0 0" }}>
                Starting camera…
              </p>
            </div>
          )}
          {scanError ? (
            <div style={styles.errorBox}>
              <span style={{ fontSize: 32, display: "block", marginBottom: 12 }}>📵</span>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#fca5a5", margin: 0 }}>
                {scanError}
              </pre>
            </div>
          ) : (
            <div id="qr-reader" style={{ width: "100%", minHeight: 300 }} />
          )}
        </div>

        <p style={styles.hint}>Point the camera at the QR code on the certificate</p>
      </div>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function CertCard({ rec, status }) {
  const cidToShow = rec && (rec.imageCid || rec.cid);
  const imgUrl = cidToShow ? filebaseGatewayUrl(cidToShow) : "";
  const explorerUrl = rec && rec.txHash
    ? "https://amoy.polygonscan.com/tx/" + rec.txHash
    : "";
  const isValid = rec && !rec.revoked;
  const isRevoked = rec && rec.revoked;

  return (
    <div style={{
      ...styles.card,
      borderColor: isValid ? "#22c55e" : isRevoked ? "#ef4444" : "#334155",
    }}>
      {/* Status banner */}
      <div style={{
        ...styles.banner,
        background: isValid ? "#14532d" : isRevoked ? "#7f1d1d" : "#1e293b",
      }}>
        <span style={{ fontSize: 20 }}>
          {isValid ? "✅" : isRevoked ? "🚫" : "❓"}
        </span>
        <span style={styles.bannerText}>
          {isValid ? "CERTIFICATE VERIFIED" : isRevoked ? "CERTIFICATE REVOKED" : status}
        </span>
      </div>

      {rec && (
        <div style={styles.cardBody}>
          {/* Image */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {imgUrl ? (
              <img
                src={imgUrl}
                alt="Certificate"
                style={styles.certImg}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div style={styles.certImgPlaceholder}>🎓</div>
            )}
            {isRevoked && (
              <div style={styles.revokedStamp}>REVOKED</div>
            )}
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={styles.certName}>{rec.name}</div>
            <div style={styles.certLabel}>has successfully completed</div>
            <div style={styles.certCourse}>{rec.course}</div>
            {rec.className && (
              <div style={styles.certClass}>Class / Batch: {rec.className}</div>
            )}

            <div style={styles.divider} />

            <div style={styles.metaGrid}>
              <div>
                <div style={styles.metaLabel}>Issued On</div>
                <div style={styles.metaValue}>
                  {new Date(rec.issuedAt * 1000).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div style={styles.metaLabel}>Certificate ID</div>
                <div style={{ ...styles.metaValue, fontSize: 11, wordBreak: "break-all", fontFamily: "monospace" }}>
                  {rec.cid}
                </div>
              </div>
            </div>

            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noreferrer" style={styles.chainLink}>
                ⛓ View on Blockchain Explorer
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Verify ──────────────────────────────────────────────────────────────
export default function Verify({ initialCid, onCidUsed }) {
  const [inputCid, setInputCid] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);

  // Auto-verify if CID came from QR deep link
  useEffect(() => {
    if (initialCid && initialCid.trim()) {
      setInputCid(initialCid.trim());
      runVerify(initialCid.trim());
      if (onCidUsed) onCidUsed();
    }
  }, [initialCid]);

  function runVerify(cid) {
    const trimmed = (cid || "").trim();
    if (!trimmed) {
      setStatus("⚠️ Please enter a Certificate ID or scan a QR code.");
      setResult(null);
      return;
    }

    const list = getIssued();
    const rec = list.find((r) => r.cid === trimmed);

    if (!rec) {
      setStatus("❌ Certificate NOT FOUND in records.");
      setResult(null);
      return;
    }

    if (rec.revoked) {
      setStatus("🚫 This certificate has been REVOKED.");
      setResult(rec);
      return;
    }

    setStatus("✅ Certificate is VALID.");
    setResult(rec);
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

  function handleClear() {
    setInputCid("");
    setResult(null);
    setStatus("");
  }

  return (
    <div style={styles.page}>
      {showScanner && (
        <QRScanner
          onResult={handleQRResult}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.badge}>PUBLIC VERIFICATION PORTAL</div>
        <h2 style={styles.heroTitle}>
          Verify Certificate <span style={styles.accent}>Authenticity</span>
        </h2>
        <p style={styles.heroSub}>
          Enter the Certificate ID or scan the QR code on the printed certificate.
          Works from anywhere in the world.
        </p>
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          <div style={styles.inputRow}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                type="text"
                value={inputCid}
                onChange={(e) => setInputCid(e.target.value)}
                placeholder="Paste Certificate ID here…"
                style={styles.input}
                autoComplete="off"
                spellCheck={false}
              />
              {inputCid && (
                <button type="button" onClick={handleClear} style={styles.clearBtn}>✕</button>
              )}
            </div>
            <button type="submit" style={styles.verifyBtn}>Verify</button>
            <button type="button" onClick={() => setShowScanner(true)} style={styles.qrBtn}>
              📷 Scan QR
            </button>
          </div>
        </form>

        {scanned && (
          <div style={styles.scannedBadge}>✅ QR scanned successfully</div>
        )}
      </div>

      {/* Status (no card) */}
      {status && !result && (
        <div style={styles.statusMsg}>{status}</div>
      )}

      {/* Result Card */}
      {result && (
        <div style={{ maxWidth: 720, margin: "24px auto 0", padding: "0 16px" }}>
          <CertCard rec={result} status={status} />
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "60vh",
    paddingBottom: 60,
  },
  hero: {
    textAlign: "center",
    padding: "36px 16px 24px",
  },
  badge: {
    display: "inline-block",
    padding: "4px 14px",
    border: "1px solid rgba(59,130,246,0.4)",
    borderRadius: 100,
    fontSize: 11,
    letterSpacing: "0.12em",
    color: "#3b82f6",
    marginBottom: 14,
    background: "rgba(59,130,246,0.07)",
  },
  heroTitle: {
    fontSize: "clamp(22px,4vw,38px)",
    fontWeight: 800,
    margin: "0 0 12px",
  },
  accent: { color: "#3b82f6" },
  heroSub: {
    maxWidth: 480,
    margin: "0 auto",
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.7,
  },
  searchBox: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "0 16px",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 15,
    pointerEvents: "none",
  },
  input: {
    width: "100%",
    padding: "12px 36px 12px 38px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  clearBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 13,
    padding: "2px 4px",
  },
  verifyBtn: {
    padding: "12px 24px",
    background: "#2563eb",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  qrBtn: {
    padding: "12px 18px",
    background: "#f0f9ff",
    border: "1px solid #7dd3fc",
    borderRadius: 10,
    color: "#0369a1",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  scannedBadge: {
    marginTop: 10,
    display: "inline-block",
    padding: "5px 14px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 100,
    color: "#15803d",
    fontSize: 13,
  },
  statusMsg: {
    maxWidth: 720,
    margin: "20px auto 0",
    padding: "14px 20px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 15,
    textAlign: "center",
  },
  // Card
  card: {
    borderRadius: 14,
    border: "1px solid",
    overflow: "hidden",
    background: "#fff",
    boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  },
  banner: {
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  bannerText: {
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: "0.04em",
    color: "#f1f5f9",
  },
  cardBody: {
    display: "flex",
    gap: 20,
    padding: 20,
    flexWrap: "wrap",
  },
  certImg: {
    width: 180,
    height: 180,
    objectFit: "cover",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    display: "block",
  },
  certImgPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 48,
    background: "#f8fafc",
  },
  revokedStamp: {
    position: "absolute",
    inset: 0,
    background: "rgba(127,29,29,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    color: "#fca5a5",
    fontWeight: 800,
    fontSize: 16,
    letterSpacing: "0.1em",
  },
  certName: { fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  certLabel: { fontSize: 12, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" },
  certCourse: { fontSize: 17, fontWeight: 700, color: "#2563eb", marginBottom: 4 },
  certClass: { fontSize: 13, color: "#64748b" },
  divider: { height: 1, background: "#f1f5f9", margin: "14px 0" },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  metaLabel: { fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  metaValue: { fontSize: 13, color: "#334155", fontWeight: 500 },
  chainLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 7,
    color: "#1d4ed8",
    fontSize: 13,
    textDecoration: "none",
    fontWeight: 500,
  },
  // Scanner overlay
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    width: "min(460px,95vw)",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  modalTitle: { fontWeight: 700, fontSize: 15, color: "#f1f5f9" },
  closeBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7,
    color: "#94a3b8",
    cursor: "pointer",
    width: 30,
    height: 30,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  viewfinder: {
    background: "#000",
    minHeight: 300,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  loadingBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 40,
  },
  spinner: {
    width: 34,
    height: 34,
    border: "3px solid rgba(255,255,255,0.1)",
    borderTop: "3px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorBox: { padding: 28, textAlign: "center" },
  hint: {
    textAlign: "center",
    padding: "12px 18px",
    margin: 0,
    fontSize: 13,
    color: "#64748b",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
};

// Spinner keyframe
if (typeof document !== "undefined" && !document.getElementById("verify-spin")) {
  const s = document.createElement("style");
  s.id = "verify-spin";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}