// src/IssuedTable.jsx
import React, { useEffect, useState } from "react";
import {
  getIssued,
  setRevoked,
  removeIssuedByCid,
  clearIssued,
} from "./libs/store";
import { filebaseGatewayUrl } from "./ipfsClient";
import CertQRCode from "./QRCode.jsx";

export default function IssuedTable() {
  const [list, setList]         = useState([]);
  const [query, setQuery]       = useState("");
  const [expandedQR, setExpandedQR] = useState(null);
  const [copiedCid, setCopiedCid]   = useState("");
  const [error, setError]           = useState("");

  useEffect(() => {
    try {
      setList(getIssued());
    } catch (err) {
      setError("Failed to load certificates: " + (err?.message || String(err)));
    }
  }, []);

  function refresh() {
    try {
      setList(getIssued());
    } catch (err) {
      setError("Failed to refresh: " + (err?.message || String(err)));
    }
  }

  function handleRevokeToggle(rec) {
    try {
      setRevoked(rec.cid, !rec.revoked);
      refresh();
    } catch (err) {
      alert("Error: " + err?.message);
    }
  }

  function handleRemove(rec) {
    if (!window.confirm("Remove this record from local database?")) return;
    try {
      removeIssuedByCid(rec.cid);
      refresh();
    } catch (err) {
      alert("Error: " + err?.message);
    }
  }

  function handleClearAll() {
    if (!window.confirm("Clear all locally stored certificates?")) return;
    try {
      clearIssued();
      refresh();
    } catch (err) {
      alert("Error: " + err?.message);
    }
  }

  function handleCopyCid(cid) {
    navigator.clipboard.writeText(cid).then(() => {
      setCopiedCid(cid);
      setTimeout(() => setCopiedCid(""), 2000);
    });
  }

  function handlePrintOne(rec) {
    if (!rec) return;
    const imgUrl    = rec.imageCid ? filebaseGatewayUrl(rec.imageCid) : filebaseGatewayUrl(rec.cid);
    const dateStr   = new Date(rec.issuedAt * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
    const verifyUrl = `${window.location.origin}?tab=verify&cid=${rec.cid}`;
    const explorerUrl = rec.txHash ? `https://amoy.polygonscan.com/tx/${rec.txHash}` : "";

    import("qrcode").then((mod) => {
      const QRCode = mod.default;
      QRCode.toDataURL(verifyUrl, { width:120, margin:2 }).then((qrDataUrl) => {
        const win = window.open("", "_blank", "width=920,height=700");
        if (!win) { alert("Allow popups for this site."); return; }
        win.document.write(`
          <html><head><title>Certificate – ${rec.name}</title>
          <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:Georgia,serif;background:#fff;}
            .cert{width:820px;margin:20px auto;border:8px double #1e3a5f;padding:36px 44px;background:linear-gradient(135deg,#fdfcfb,#f8f6f0);}
            .header{text-align:center;margin-bottom:14px;}
            .org{font-size:26px;font-weight:bold;color:#1e3a5f;}
            hr{border:none;border-top:1px solid #c9a84c;margin:14px auto;width:75%;}
            .body{text-align:center;margin:18px 0;}
            .sname{font-size:38px;color:#1e3a5f;font-style:italic;margin:8px 0 12px;}
            .cname{font-size:22px;font-weight:bold;color:#c9a84c;margin:4px 0 6px;}
            .date{font-size:12px;color:#666;margin-top:6px;}
            .cimg{text-align:center;margin:14px 0;}
            .cimg img{max-width:320px;max-height:180px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;}
            .bottom{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;}
            .seal{width:80px;height:80px;border-radius:50%;border:3px double #c9a84c;display:flex;align-items:center;justify-content:center;font-size:9px;color:#c9a84c;font-weight:bold;text-align:center;padding:8px;}
            .cidsec{flex:1;text-align:center;padding:0 16px;}
            .cidlbl{font-size:9px;color:#aaa;margin-bottom:3px;}
            .cidval{font-size:8px;color:#888;word-break:break-all;font-family:monospace;}
            .txlbl{font-size:9px;color:#aaa;margin-top:6px;margin-bottom:2px;}
            .txval{font-size:8px;color:#555;word-break:break-all;font-family:monospace;}
            .qrsec{text-align:center;}
            .qrsec img{border:2px solid #e2e8f0;border-radius:6px;display:block;}
            .qrlbl{font-size:9px;color:#888;margin-top:3px;}
          </style></head>
          <body><div class="cert">
            <div class="header">
              <div style="font-size:11px;letter-spacing:4px;color:#1e3a5f;text-transform:uppercase;">This is to Certify that</div>
              <div class="org">Blockchain Certificate System</div>
              <div style="font-size:10px;color:#888;letter-spacing:3px;margin-top:2px;">POLYGON AMOY TESTNET · VERIFIED ON CHAIN</div>
            </div>
            <hr/>
            <div class="body">
              <div style="font-size:11px;color:#666;letter-spacing:2px;margin-bottom:6px;">PROUDLY PRESENTED TO</div>
              <div class="sname">${rec.name}</div>
              <div style="font-size:11px;color:#666;letter-spacing:1px;">has successfully completed the course</div>
              <div class="cname">${rec.course || ""}</div>
              <div class="date">Issued on ${dateStr}</div>
            </div>
            ${imgUrl ? `<div class="cimg"><img src="${imgUrl}" alt="cert"/></div>` : ""}
            <hr/>
            <div class="bottom">
              <div class="seal">OFFICIAL<br/>SEAL<br/>✦</div>
              <div class="cidsec">
                <div class="cidlbl">Certificate ID</div>
                <div class="cidval">${rec.cid}</div>
                ${rec.txHash ? `<div class="txlbl">Blockchain Transaction</div><div class="txval">${rec.txHash}</div>` : ""}
                ${explorerUrl ? `<div style="margin-top:6px;font-size:9px;color:#2563eb;">Verify: ${verifyUrl}</div>` : ""}
              </div>
              <div class="qrsec">
                <img src="${qrDataUrl}" width="110" height="110" alt="QR"/>
                <div class="qrlbl">Scan to Verify</div>
              </div>
            </div>
          </div>
          <script>setTimeout(function(){window.print();},800);</script>
          </body></html>
        `);
        win.document.close();
      });
    }).catch(() => { alert("Run: npm install qrcode"); });
  }

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = list.filter((rec) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (rec.name  || "").toLowerCase().includes(q) ||
      (rec.course || "").toLowerCase().includes(q) ||
      (rec.cid   || "").toLowerCase().includes(q)
    );
  });

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <section style={{ padding:"1.5rem 0" }}>
        <h2>Admin – Issued Certificates</h2>
        <div style={{ padding:"16px 20px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, color:"#b91c1c", marginTop:16 }}>
          <strong>Error loading certificates:</strong> {error}
          <br /><br />
          <button onClick={() => { setError(""); refresh(); }} style={{ padding:"8px 16px", background:"#fff", border:"1px solid #fecaca", borderRadius:6, cursor:"pointer", color:"#b91c1c", fontWeight:600 }}>
            Try Again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding:"1.5rem 0" }}>
      <h2>Admin – Issued Certificates</h2>

      <div style={{ margin:"0.75rem 0", display:"flex", gap:"0.5rem", flexWrap:"wrap", alignItems:"center" }}>
        <input
          type="text"
          placeholder="Search name, course, CID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width:240 }}
        />
        <button type="button" onClick={refresh} style={{ padding:"6px 12px", cursor:"pointer" }}>
          🔄 Refresh
        </button>
        <button type="button" onClick={handleClearAll} style={{ color:"#b91c1c", padding:"6px 12px", cursor:"pointer" }}>
          Clear All
        </button>
        <span style={{ fontSize:12, color:"#888" }}>
          {filtered.length} certificate{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {list.length === 0 && !error && (
        <div style={{ padding:"40px 24px", textAlign:"center", background:"#f8fafc", borderRadius:12, border:"1px dashed #e2e8f0", color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🎓</div>
          <div style={{ fontSize:15, fontWeight:600 }}>No certificates issued yet</div>
          <div style={{ fontSize:13, marginTop:4 }}>Issue a certificate from Teacher – Single or 🤖 AI Generator tab</div>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.88rem" }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["Preview","Student","Course","Certificate ID (Full)","Issued At","Status","QR / Print","Tx","Actions"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => {
                if (!rec || !rec.cid) return null; // safety check
                const cidToShow   = rec.imageCid || rec.cid;
                const imgUrl      = cidToShow ? filebaseGatewayUrl(cidToShow) : "";
                const explorerUrl = rec.txHash ? `https://amoy.polygonscan.com/tx/${rec.txHash}` : "";
                const isQROpen    = expandedQR === rec.cid;
                const isCopied    = copiedCid === rec.cid;

                return (
                  <tr key={rec.cid} style={{ borderBottom:"1px solid #f1f5f9" }}>

                    {/* Preview */}
                    <td style={td}>
                      {imgUrl && (
                        <img src={imgUrl} alt="cert"
                          style={{ width:64, height:64, objectFit:"cover", borderRadius:6, border:"1px solid #e2e8f0", display:"block" }}
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                    </td>

                    {/* Student */}
                    <td style={{ ...td, fontWeight:600 }}>{rec.name || "—"}</td>

                    {/* Course */}
                    <td style={td}>{rec.course || "—"}</td>

                    {/* Full CID */}
                    <td style={{ ...td, maxWidth:260 }}>
                      <div style={{ fontFamily:"monospace", fontSize:11, color:"#334155", wordBreak:"break-all", lineHeight:1.5, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 8px", marginBottom:4 }}>
                        {rec.cid}
                      </div>
                      <button onClick={() => handleCopyCid(rec.cid)} style={{
                        fontSize:11, padding:"3px 10px", cursor:"pointer",
                        background: isCopied?"#f0fdf4":"#f8fafc",
                        border: isCopied?"1px solid #bbf7d0":"1px solid #e2e8f0",
                        borderRadius:5, color: isCopied?"#15803d":"#64748b", fontWeight:600,
                      }}>
                        {isCopied ? "✅ Copied!" : "📋 Copy CID"}
                      </button>
                    </td>

                    {/* Issued At */}
                    <td style={{ ...td, whiteSpace:"nowrap", fontSize:12 }}>
                      {rec.issuedAt
                        ? new Date(rec.issuedAt * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })
                        : "—"
                      }
                    </td>

                    {/* Status */}
                    <td style={td}>
                      <span style={{
                        padding:"3px 10px", borderRadius:100, fontSize:12, fontWeight:600,
                        background: rec.revoked?"#fef2f2":"#f0fdf4",
                        color: rec.revoked?"#b91c1c":"#15803d",
                        border: `1px solid ${rec.revoked?"#fecaca":"#bbf7d0"}`,
                      }}>
                        {rec.revoked ? "Revoked" : "Active"}
                      </span>
                    </td>

                    {/* QR / Print */}
                    <td style={{ ...td, textAlign:"center" }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                        <button onClick={() => setExpandedQR(isQROpen ? null : rec.cid)} style={{
                          padding:"4px 10px", fontSize:12, cursor:"pointer",
                          background: isQROpen?"#dbeafe":"#f0f9ff",
                          border:"1px solid #93c5fd", borderRadius:6,
                          color:"#1d4ed8", fontWeight:600,
                        }}>
                          {isQROpen ? "Hide QR" : "Show QR"}
                        </button>
                        <button onClick={() => handlePrintOne(rec)} style={{
                          padding:"4px 10px", fontSize:12, cursor:"pointer",
                          background:"#fefce8", border:"1px solid #ca8a04",
                          borderRadius:6, color:"#92400e", fontWeight:600,
                        }}>
                          🖨 Print
                        </button>
                      </div>
                      {isQROpen && (
                        <div style={{ marginTop:8 }}>
                          <CertQRCode cid={rec.cid} size={120} />
                        </div>
                      )}
                    </td>

                    {/* Tx */}
                    <td style={td}>
                      {explorerUrl
                        ? <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color:"#2563eb", fontSize:12 }}>View Tx ↗</a>
                        : "—"
                      }
                    </td>

                    {/* Actions */}
                    <td style={td}>
                      <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                        <button onClick={() => handleRevokeToggle(rec)} style={{ fontSize:12, cursor:"pointer" }}>
                          {rec.revoked ? "Restore" : "Revoke"}
                        </button>
                        <button onClick={() => handleRemove(rec)} style={{ fontSize:12, color:"#b91c1c", cursor:"pointer" }}>
                          Remove
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const th = { textAlign:"left", padding:"8px 10px", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", fontWeight:700, fontSize:"0.82rem", color:"#475569" };
const td = { padding:"8px 10px", verticalAlign:"top" };