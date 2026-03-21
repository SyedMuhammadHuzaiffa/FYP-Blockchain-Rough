// src/QRCode.jsx
// npm install qrcode
import React, { useEffect, useRef, useState } from "react";

// ✅ Production-ready: works on localhost, WiFi, and Vercel automatically
function buildVerifyUrl(cid) {
  const origin = window.location.origin; // e.g. http://localhost:5174 or https://myapp.vercel.app
  return `${origin}?tab=verify&cid=${cid}`;
}

export default function CertQRCode({ cid, size }) {
  const canvasRef = useRef(null);
  const [error, setError]     = useState("");
  const [loaded, setLoaded]   = useState(false);
  const [verifyUrl, setVerifyUrl] = useState("");

  const qrSize = size || 160;

  useEffect(() => {
    if (!cid) return;
    setVerifyUrl(buildVerifyUrl(cid));
  }, [cid]);

  useEffect(() => {
    if (!cid || !verifyUrl || !canvasRef.current) return;
    let cancelled = false;

    async function draw() {
      try {
        const mod = await import("qrcode");
        const QRCode = mod.default;
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, verifyUrl, {
          width: qrSize, margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          const msg = err && err.message ? err.message : String(err);
          setError(msg.includes("Cannot find module") ? "Run: npm install qrcode" : "QR error: " + msg);
        }
      }
    }

    draw();
    return () => { cancelled = true; };
  }, [cid, qrSize, verifyUrl]);

  if (!cid) return null;

  if (error) {
    return (
      <div style={{ padding:"8px 12px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, fontSize:12, color:"#b91c1c", fontFamily:"monospace" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <canvas ref={canvasRef} style={{ display:"block", borderRadius:8, border:"2px solid #e2e8f0", opacity: loaded?1:0.2, transition:"opacity 0.3s" }} />
      {loaded && (
        <div style={{ textAlign:"center" }}>
          <span style={{ fontSize:10, color:"#64748b" }}>Scan to verify</span>
        </div>
      )}
    </div>
  );
}