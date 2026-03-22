// src/IssuedTable.jsx
// Reads certificates from NEW clean contract — CertificateIssued events

import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { filebaseGatewayUrl } from "./ipfsClient";
import { getIssued, setRevoked } from "./libs/store";
import CertQRCode from "./QRCode.jsx";
import EmailSender from "./EmailSender.jsx";

// ─── New contract address & ABI ───────────────────────────────────────────────
const CONTRACT_ADDRESS = "0xd274A64A924491032ADf7A12E58Bd4662Fd36E69";

const CERT_ABI = [
  "event CertificateIssued(string cid, string name, string competition, uint256 issuedAt)"
];

const PUBLIC_RPCS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://polygon-amoy.drpc.org",
];

// ─── Fetch certificates from blockchain events ────────────────────────────────
async function fetchCertificatesFromChain() {
  let provider = null;
  for (const url of PUBLIC_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 80002);
      await p.getBlockNumber();
      provider = p;
      break;
    } catch { continue; }
  }
  if (!provider) throw new Error("All public RPCs failed.");

  const contract = new ethers.Contract(CONTRACT_ADDRESS, CERT_ABI, provider);
  const latest   = await provider.getBlockNumber();
  const filter   = contract.filters.CertificateIssued();

  // Try progressively smaller block ranges
  const ranges = [500000, 200000, 100000, 50000, 20000, 10000];
  let events = [];
  let usedRange = 0;

  for (const range of ranges) {
    const fromBlock = Math.max(0, latest - range);
    try {
      events = await contract.queryFilter(filter, fromBlock, latest);
      usedRange = range;
      break;
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("block range") || msg.includes("coalesce") || msg.includes("limit")) {
        continue;
      }
      throw err;
    }
  }

  const certs = events.map((ev) => ({
    cid:         ev.args.cid,
    name:        ev.args.name,
    course:      ev.args.competition,
    issuedAt:    Number(ev.args.issuedAt),
    txHash:      ev.transactionHash,
    blockNumber: ev.blockNumber,
    imageCid:    ev.args.cid,
    revoked:     isRevokedLocally(ev.args.cid),
    source:      "blockchain",
  }));

  return {
    certs: certs.sort((a, b) => b.issuedAt - a.issuedAt),
    usedRange,
    latestBlock: latest,
  };
}

// ─── Local revocation ─────────────────────────────────────────────────────────
const REVOKED_KEY = "revoked_cids_v1";

function getRevokedSet() {
  try {
    const raw = localStorage.getItem(REVOKED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function isRevokedLocally(cid) { return getRevokedSet().has(cid); }

function toggleRevoked(cid, value) {
  const set = getRevokedSet();
  if (value) set.add(cid); else set.delete(cid);
  localStorage.setItem(REVOKED_KEY, JSON.stringify([...set]));
}

// ─── Merge blockchain + localStorage ─────────────────────────────────────────
function mergeCerts(chainCerts, localCerts) {
  const chainCids = new Set(chainCerts.map(c => c.cid));
  const localOnly = localCerts
    .filter(l => !chainCids.has(l.cid))
    .map(l => ({ ...l, source: "local" }));
  return [...chainCerts, ...localOnly];
}

// ─── Print certificate ────────────────────────────────────────────────────────
function printCertificate(rec) {
  const imgUrl    = filebaseGatewayUrl(rec.imageCid || rec.cid);
  const dateStr   = new Date(rec.issuedAt * 1000).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" });
  const verifyUrl = `${window.location.origin}?tab=verify&cid=${encodeURIComponent(rec.cid)}`;

  import("qrcode").then((mod) => {
    mod.default.toDataURL(verifyUrl, { width:120, margin:2 }).then((qrDataUrl) => {
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
          .cidval{font-size:7px;color:#888;word-break:break-all;font-family:monospace;}
          .txlbl{font-size:9px;color:#aaa;margin-top:5px;margin-bottom:2px;}
          .txval{font-size:7px;color:#555;word-break:break-all;font-family:monospace;}
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
            <div style="font-size:11px;color:#666;letter-spacing:1px;">has successfully completed</div>
            <div class="cname">${rec.course}</div>
            <div class="date">Issued on ${dateStr}</div>
          </div>
          ${imgUrl ? `<div class="cimg"><img src="${imgUrl}" alt="cert"/></div>` : ""}
          <hr/>
          <div class="bottom">
            <div class="seal">OFFICIAL<br/>SEAL<br/>✦</div>
            <div class="cidsec">
              <div class="cidlbl">Certificate ID</div>
              <div class="cidval">${rec.cid}</div>
              <div class="txlbl">Blockchain Transaction</div>
              <div class="txval">${rec.txHash || "—"}</div>
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
  }).catch(() => alert("Run: npm install qrcode"));
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function IssuedTable() {
  const [certs, setCerts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [chainWarning, setChainWarning] = useState("");
  const [chainInfo, setChainInfo]       = useState("");
  const [query, setQuery]               = useState("");
  const [expandedQR, setExpandedQR]     = useState(null);
  const [copiedCid, setCopiedCid]       = useState("");
  const [source, setSource]             = useState("");
  const [showEmailSender, setShowEmailSender] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setChainWarning("");
    setChainInfo("");

    const localCerts = getIssued().map(l => ({ ...l, source:"local" }));

    try {
      const { certs: chainCerts, usedRange, latestBlock } = await fetchCertificatesFromChain();
      setCerts(mergeCerts(chainCerts, localCerts));
      setSource("blockchain");
      setChainInfo(`✅ Live from blockchain · Last ${usedRange.toLocaleString()} blocks · Block #${latestBlock.toLocaleString()}`);
    } catch (err) {
      console.warn("Blockchain fetch failed:", err);
      setCerts(localCerts);
      setSource("local");
      setChainWarning("⚠️ Blockchain unavailable — showing local cache. " + (err?.message?.slice(0,120) || ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleRevokeToggle(rec) {
    const newVal = !rec.revoked;
    toggleRevoked(rec.cid, newVal);
    try { setRevoked(rec.cid, newVal); } catch {}
    setCerts(prev => prev.map(c => c.cid === rec.cid ? { ...c, revoked: newVal } : c));
  }

  function handleCopyCid(cid) {
    navigator.clipboard.writeText(cid).then(() => {
      setCopiedCid(cid);
      setTimeout(() => setCopiedCid(""), 2000);
    });
  }

  const filtered = certs.filter((rec) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (rec.name   || "").toLowerCase().includes(q) ||
      (rec.course || "").toLowerCase().includes(q) ||
      (rec.cid    || "").toLowerCase().includes(q)
    );
  });

  return (
    <section style={{ padding:"1.5rem 0" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:12 }}>
        <div>
          <h2 style={{ margin:"0 0 4px", fontSize:22, fontWeight:800 }}>Admin – Issued Certificates</h2>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{
              fontSize:12, padding:"2px 8px", borderRadius:100, fontWeight:600,
              background: source==="blockchain"?"#f0fdf4": source==="local"?"#fefce8":"#f8fafc",
              color: source==="blockchain"?"#15803d": source==="local"?"#92400e":"#64748b",
              border: `1px solid ${source==="blockchain"?"#bbf7d0": source==="local"?"#fde68a":"#e2e8f0"}`,
            }}>
              {source==="blockchain" ? "⛓ Blockchain" : source==="local" ? "💾 Local cache" : "⏳"}
            </span>
            {!loading && <span style={{ fontSize:12, color:"#64748b" }}>{certs.length} total</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button onClick={load} disabled={loading} style={{
            padding:"9px 18px", background:"#1e3a5f", color:"#fff",
            border:"none", borderRadius:8, fontWeight:600, fontSize:13,
            cursor: loading?"not-allowed":"pointer", opacity: loading?0.7:1,
          }}>
            {loading ? "⏳ Loading..." : "🔄 Refresh from Blockchain"}
          </button>
          <button onClick={() => setShowEmailSender(true)} disabled={certs.length===0} style={{
            padding:"9px 18px", background:"linear-gradient(135deg,#7c3aed,#6d28d9)",
            color:"#fff", border:"none", borderRadius:8, fontWeight:600, fontSize:13,
            cursor: certs.length===0?"not-allowed":"pointer", opacity: certs.length===0?0.5:1,
          }}>
            📧 Send Emails
          </button>
        </div>
        {showEmailSender && (
          <EmailSender
            certificates={certs.map(c => ({
              name: c.name, email: c.email||"",
              course: c.course, competition: c.course,
              cid: c.cid, txHash: c.txHash,
            }))}
            onClose={() => setShowEmailSender(false)}
          />
        )}
      </div>

      {chainInfo    && <div style={{ marginBottom:10, padding:"8px 12px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, fontSize:12, color:"#15803d" }}>{chainInfo}</div>}
      {chainWarning && <div style={{ marginBottom:10, padding:"10px 14px", background:"#fefce8", border:"1px solid #fde68a", borderRadius:8, fontSize:12, color:"#92400e" }}>{chainWarning}</div>}

      {/* Search */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input type="text" placeholder="Search name, course, CID..." value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width:260, padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:14 }} />
        {!loading && <span style={{ fontSize:13, color:"#64748b" }}>{filtered.length} result{filtered.length!==1?"s":""}</span>}
      </div>

      {loading && (
        <div style={{ padding:"48px 24px", textAlign:"center", background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>⛓</div>
          <div style={{ fontSize:15, fontWeight:600, color:"#1e3a5f" }}>Reading from blockchain...</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>Fetching CertificateIssued events from new contract</div>
        </div>
      )}

      {!loading && certs.length === 0 && (
        <div style={{ padding:"48px 24px", textAlign:"center", background:"#f8fafc", borderRadius:12, border:"1px dashed #e2e8f0" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🎓</div>
          <div style={{ fontSize:15, fontWeight:600, color:"#475569" }}>No certificates issued yet</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>Issue from Teacher – Single or 🤖 AI Generator</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.88rem" }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["Preview","Student","Competition","Certificate ID","Issued At","Status","QR / Print","Tx","Actions"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"9px 10px", borderBottom:"2px solid #e2e8f0", fontWeight:700, fontSize:"0.82rem", color:"#475569", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec) => {
                if (!rec?.cid) return null;
                const imgUrl      = filebaseGatewayUrl(rec.imageCid || rec.cid);
                const explorerUrl = rec.txHash ? `https://amoy.polygonscan.com/tx/${rec.txHash}` : "";
                const isQROpen    = expandedQR === rec.cid;
                const isCopied    = copiedCid === rec.cid;
                const isLocal     = rec.source === "local";

                return (
                  <tr key={rec.cid} style={{ borderBottom:"1px solid #f1f5f9", background: isLocal?"#fffbeb":"#fff" }}>
                    <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
                      {imgUrl && <img src={imgUrl} alt="cert" style={{ width:64, height:64, objectFit:"cover", borderRadius:6, border:"1px solid #e2e8f0", display:"block" }} onError={(e)=>{e.currentTarget.style.display="none"}} />}
                      {isLocal && <span style={{ fontSize:9, color:"#92400e", display:"block", marginTop:3 }}>local</span>}
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top", fontWeight:600 }}>{rec.name}</td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top" }}>{rec.course}</td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top", maxWidth:240 }}>
                      <div style={{ fontFamily:"monospace", fontSize:10, color:"#334155", wordBreak:"break-all", lineHeight:1.5, background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 8px", marginBottom:4 }}>{rec.cid}</div>
                      <button onClick={() => handleCopyCid(rec.cid)} style={{ fontSize:11, padding:"3px 10px", cursor:"pointer", background:isCopied?"#f0fdf4":"#f8fafc", border:`1px solid ${isCopied?"#bbf7d0":"#e2e8f0"}`, borderRadius:5, color:isCopied?"#15803d":"#64748b", fontWeight:600 }}>
                        {isCopied ? "✅ Copied!" : "📋 Copy"}
                      </button>
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top", whiteSpace:"nowrap", fontSize:12 }}>
                      {rec.issuedAt ? new Date(rec.issuedAt*1000).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
                      <span style={{ padding:"3px 10px", borderRadius:100, fontSize:12, fontWeight:600, background:rec.revoked?"#fef2f2":"#f0fdf4", color:rec.revoked?"#b91c1c":"#15803d", border:`1px solid ${rec.revoked?"#fecaca":"#bbf7d0"}` }}>
                        {rec.revoked ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top", textAlign:"center" }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                        <button onClick={() => setExpandedQR(isQROpen?null:rec.cid)} style={{ padding:"4px 10px", fontSize:12, cursor:"pointer", background:isQROpen?"#dbeafe":"#f0f9ff", border:"1px solid #93c5fd", borderRadius:6, color:"#1d4ed8", fontWeight:600 }}>
                          {isQROpen ? "Hide QR" : "Show QR"}
                        </button>
                        <button onClick={() => printCertificate(rec)} style={{ padding:"4px 10px", fontSize:12, cursor:"pointer", background:"#fefce8", border:"1px solid #ca8a04", borderRadius:6, color:"#92400e", fontWeight:600 }}>
                          🖨 Print
                        </button>
                      </div>
                      {isQROpen && <div style={{ marginTop:8 }}><CertQRCode cid={rec.cid} size={120} /></div>}
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
                      {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color:"#2563eb", fontSize:12 }}>View Tx ↗</a> : "—"}
                      {rec.blockNumber && <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>Block #{rec.blockNumber}</div>}
                    </td>
                    <td style={{ padding:"8px 10px", verticalAlign:"top" }}>
                      <button onClick={() => handleRevokeToggle(rec)} style={{ fontSize:12, cursor:"pointer", padding:"4px 10px", background:rec.revoked?"#f0fdf4":"#fef2f2", border:`1px solid ${rec.revoked?"#bbf7d0":"#fecaca"}`, borderRadius:6, color:rec.revoked?"#15803d":"#b91c1c", fontWeight:600 }}>
                        {rec.revoked ? "Restore" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && certs.length > 0 && (
        <div style={{ marginTop:14, padding:"10px 14px", background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, fontSize:12, color:"#0369a1" }}>
          ⛓ {certs.filter(c=>c.source==="blockchain").length} from blockchain
          {certs.filter(c=>c.source==="local").length > 0 && ` · 💾 ${certs.filter(c=>c.source==="local").length} from local cache`}
          {" · "}Contract: 0xd274A64...E69
        </div>
      )}
    </section>
  );
}