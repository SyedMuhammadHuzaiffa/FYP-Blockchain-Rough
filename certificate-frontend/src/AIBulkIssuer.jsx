// src/AIBulkIssuer.jsx
// Competition Certificate Generator
// npm install papaparse jszip pdfjs-dist xlsx qrcode

import React, { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { uploadToIpfsFilebase } from "./ipfsClient";
import { pushIssued } from "./libs/store";
import { getContract, GAS_SETTINGS } from "./ethers-client";
import EmailSender from "./EmailSender.jsx";

// ─── Production-ready URL builder ────────────────────────────────────────────
// Automatically works on localhost, WiFi, and Vercel — no manual config needed
function buildVerifyUrl(cid) {
  return `${window.location.origin}?tab=verify&cid=${cid}`;
}

// ─── Generate QR code as data URL ────────────────────────────────────────────
async function generateQR(text, size = 160) {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(text, {
      width: size, margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch { return null; }
}

// ─── Claude AI CSV cleaner ────────────────────────────────────────────────────
async function cleanWithAI(rows) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Clean this participant list for certificates:
- Capitalize names properly ("ali ahmed" → "Ali Ahmed")
- Fix spelling mistakes in names
- Title Case competition names
- Mark skip:true for empty/invalid rows
Return ONLY raw JSON array, no markdown.
Each: {name, competition, email, skip, original_name, note}
Data: ${JSON.stringify(rows)}`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "[]";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    return rows.map(r => ({ ...r, skip: false, original_name: r.name, note: "" }));
  }
}

// ─── PDF → image ─────────────────────────────────────────────────────────────
async function pdfToImage(file) {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buf  = await file.arrayBuffer();
  const pdf  = await lib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const vp   = page.getViewport({ scale: 2.5 });
  const c    = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return { dataUrl: c.toDataURL("image/png"), width: vp.width, height: vp.height };
}

// ─── Render certificate with text + QR + TX ──────────────────────────────────
async function renderCertificate({
  templateDataUrl,
  namePlacement, compPlacement,
  nameFont, compFont,
  participantName, competitionName,
  cid, txHash,
  showQR, showTx,
  qrPosition,   // {xPct, yPct}
  txPosition,   // {xPct, yPct}
}) {
  // Generate QR data URL
  const verifyUrl = cid ? buildVerifyUrl(cid) : "";
  const qrDataUrl = showQR && verifyUrl ? await generateQR(verifyUrl, 180) : null;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // ── Draw participant name ──
      if (namePlacement) {
        const f = nameFont;
        ctx.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${f.size}px "${f.family}"`;
        ctx.fillStyle   = f.color;
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.15)";
        ctx.shadowBlur  = 2;
        ctx.fillText(participantName, namePlacement.xPct * img.width, namePlacement.yPct * img.height);
        ctx.shadowBlur = 0;
      }

      // ── Draw competition name ──
      if (compPlacement) {
        const f = compFont;
        ctx.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${f.size}px "${f.family}"`;
        ctx.fillStyle    = f.color;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(competitionName, compPlacement.xPct * img.width, compPlacement.yPct * img.height);
      }

      // ── Draw QR code ──
      if (showQR && qrDataUrl && qrPosition) {
        const qrSize = Math.round(img.width * 0.10); // 10% of cert width
        const qrX = qrPosition.xPct * img.width  - qrSize / 2;
        const qrY = qrPosition.yPct * img.height - qrSize / 2;

        // White background box
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);

        // QR image
        const qrImg = new Image();
        await new Promise((res) => {
          qrImg.onload = res;
          qrImg.src = qrDataUrl;
        });
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // "Scan to Verify" label below QR
        ctx.font         = `${Math.round(img.width * 0.012)}px Arial`;
        ctx.fillStyle    = "#555555";
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillText("Scan to Verify", qrX + qrSize / 2, qrY + qrSize + 6);
      }

      // ── Draw TX hash ──
      if (showTx && txHash && txPosition) {
        const txFontSize = Math.round(img.width * 0.011);
        ctx.font         = `${txFontSize}px "Courier New"`;
        ctx.fillStyle    = "#444444";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        const x = txPosition.xPct * img.width;
        const y = txPosition.yPct * img.height;

        // Label
        ctx.fillStyle = "#888888";
        ctx.font = `bold ${txFontSize}px Arial`;
        ctx.fillText("Blockchain TX:", x, y - txFontSize);

        // TX hash (split into 2 lines if too long)
        ctx.fillStyle = "#333333";
        ctx.font = `${txFontSize}px "Courier New"`;
        const half = Math.floor(txHash.length / 2);
        ctx.fillText(txHash.slice(0, half), x, y + 2);
        ctx.fillText(txHash.slice(half),    x, y + txFontSize + 4);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = templateDataUrl;
  });
}

// ─── Parse Excel / CSV ────────────────────────────────────────────────────────
async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const Papa = (await import("papaparse")).default;
    return new Promise((res, rej) => {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => res(normalize(r.data)), error: rej });
    });
  }
  const XLSX = await import("xlsx");
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array" });
  return normalize(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
}

function normalize(rows) {
  return rows.map(r => {
    const k = Object.keys(r);
    const f = (kws) => k.find(x => kws.some(kw => x.toLowerCase().includes(kw)));
    return {
      name:        String(r[f(["name"])]                            || "").trim(),
      competition: String(r[f(["competition","event","course"])]    || "").trim(),
      email:       String(r[f(["email","mail"])]                    || "").trim(),
    };
  }).filter(r => r.name);
}

// ─── Steps indicator ──────────────────────────────────────────────────────────
function Steps({ current }) {
  const list = ["Upload Template","Mark Fields","Upload Excel","Preview","Issue & Done"];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:28, flexWrap:"wrap" }}>
      {list.map((label, i) => {
        const n = i + 1;
        return (
          <React.Fragment key={n}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{
                width:34, height:34, borderRadius:"50%",
                background: current > n ? "#15803d" : current===n ? "#1e3a5f" : "#e2e8f0",
                color: current >= n ? "#fff" : "#94a3b8",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:700, fontSize:13,
                border: current===n ? "3px solid #3b82f6" : "3px solid transparent",
              }}>
                {current > n ? "✓" : n}
              </div>
              <span style={{ fontSize:11, color: current>=n?"#1e3a5f":"#94a3b8", fontWeight: current===n?700:500, whiteSpace:"nowrap" }}>
                {label}
              </span>
            </div>
            {i < list.length-1 && (
              <div style={{ height:2, width:36, background: current>n?"#15803d":"#e2e8f0", margin:"0 3px", marginBottom:20, flexShrink:0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Clickable image with marker overlay ──────────────────────────────────────
function ClickableTemplate({ src, markers, onClickField, imgRef }) {
  return (
    <div style={{ position:"relative", display:"inline-block", cursor:"crosshair", maxWidth:"100%" }}>
      <img ref={imgRef} src={src} alt="template" onClick={onClickField} draggable={false}
        style={{ maxWidth:"100%", maxHeight:500, borderRadius:8, border:"2px solid #3b82f6", display:"block", userSelect:"none" }} />
      {markers.map((m, i) => {
        const colors = { name:"#3b82f6", competition:"#f59e0b", qr:"#10b981", tx:"#8b5cf6" };
        const labels = { name:"👤 Name", competition:"🏆 Competition", qr:"⬡ QR Code", tx:"⛓ TX Hash" };
        const c = colors[m.field] || "#64748b";
        return (
          <div key={i} style={{ position:"absolute", left: m.xPct*100+"%", top: m.yPct*100+"%", transform:"translate(-50%,-50%)", pointerEvents:"none", zIndex:5 }}>
            <div style={{ background: c+"ee", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:5, whiteSpace:"nowrap", boxShadow:"0 2px 8px rgba(0,0,0,0.3)" }}>
              {labels[m.field] || m.field}
            </div>
            <div style={{ width:2, height:7, background:c, margin:"0 auto" }} />
            <div style={{ width:7, height:7, borderRadius:"50%", background:c, margin:"0 auto" }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function AIBulkIssuer() {
  const [step, setStep]           = useState(1);
  const [templateImg, setTImg]    = useState("");
  const [templateErr, setTErr]    = useState("");
  const [tLoading, setTLoading]   = useState(false);
  const imgRef = useRef(null);

  // All field placements: name, competition, qr, tx
  const [placements, setPlacements] = useState({});
  // name | competition | qr | tx
  const [activeField, setActiveField] = useState("name");

  // Fonts
  const [nameFont, setNameFont] = useState({ size:72, family:"Dancing Script", color:"#8B0000", bold:false, italic:true });
  const [compFont, setCompFont] = useState({ size:54, family:"Dancing Script", color:"#8B0000", bold:false, italic:true });

  // Options
  const [showQR, setShowQR]   = useState(true);
  const [showTx, setShowTx]   = useState(true);

  // Participants
  const [participants, setParticipants] = useState([]);
  const [cleaned, setCleaned]           = useState([]);
  const [fileErr, setFileErr]           = useState("");
  const [fileLoading, setFileLoading]   = useState(false);
  const [aiLoading, setAiLoading]       = useState(false);

  // Previews (without QR/TX — added after blockchain)
  const [previews, setPreviews]             = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Issuing
  const [log, setLog]           = useState([]);
  const [issueStatus, setIS]    = useState("");
  const [phase, setPhase]       = useState("");
  const [issuing, setIssuing]   = useState(false);
  const [done, setDone]         = useState(false);
  const [showEmailSender, setShowEmailSender] = useState(false);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&family=Pinyon+Script&family=Sacramento&display=swap";
    document.head.appendChild(l);
  }, []);

  // ── Step 1 ───────────────────────────────────────────────────────────────────
  async function handleTemplate(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setTErr(""); setTLoading(true); setPlacements({});
    try {
      if (file.type === "application/pdf") {
        const { dataUrl } = await pdfToImage(file);
        setTImg(dataUrl);
      } else if (file.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = ev => setTImg(ev.target.result);
        r.readAsDataURL(file);
      } else throw new Error("Upload PNG, JPG, or PDF only.");
    } catch (err) { setTErr(err?.message || String(err)); }
    finally { setTLoading(false); }
  }

  // ── Step 2: Click to place ───────────────────────────────────────────────────
  function handleImgClick(e) {
    const rect = imgRef.current.getBoundingClientRect();
    setPlacements(prev => ({
      ...prev,
      [activeField]: {
        field: activeField,
        xPct: (e.clientX - rect.left) / rect.width,
        yPct: (e.clientY - rect.top)  / rect.height,
      }
    }));
  }

  const allMarkers = Object.values(placements);

  // ── Step 3: Parse file ───────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setFileErr(""); setFileLoading(true);
    try {
      const rows = await parseFile(file);
      if (!rows.length) throw new Error("No valid rows found.");
      setParticipants(rows); setCleaned(rows);
    } catch (err) { setFileErr(err?.message || String(err)); }
    finally { setFileLoading(false); }
  }

  async function handleAIClean() {
    setAiLoading(true);
    try { setCleaned(await cleanWithAI(participants)); }
    catch (err) { setFileErr("AI failed: " + err?.message); }
    finally { setAiLoading(false); }
  }

  // ── Step 4: Previews (without QR/TX yet — those need CID/txHash) ─────────────
  async function generatePreviews() {
    setPreviewLoading(true);
    const valid = cleaned.filter(r => !r.skip && r.name);
    const results = [];
    for (const row of valid) {
      const dataUrl = await renderCertificate({
        templateDataUrl: templateImg,
        namePlacement: placements.name,
        compPlacement: placements.competition,
        nameFont, compFont,
        participantName: row.name,
        competitionName: row.competition,
        cid: null, txHash: null,
        showQR: false, showTx: false,
        qrPosition: null, txPosition: null,
      });
      results.push({ name: row.name, competition: row.competition, email: row.email || "", dataUrl, status: "pending", cid: "", txHash: "" });
    }
    setPreviews(results);
    setPreviewLoading(false);
    setStep(4);
  }

  // ── Step 5: PHASE 1 upload all → PHASE 2 one tx → PHASE 3 re-render with QR+TX ──
  async function handleIssueAll() {
    setIssuing(true); setDone(false); setStep(5);
    const entries = previews.map(p => ({ ...p, status: "pending", cid: "", txHash: "", finalDataUrl: "" }));
    setLog([...entries]);

    // ── PHASE 1: Upload plain certificates to IPFS ──
    setPhase("uploading");
    setIS(`⬆ Phase 1/3 — Uploading ${entries.length} certificates to IPFS...`);

    const uploaded = [];
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      entries[i] = { ...entries[i], status: "uploading" };
      setLog([...entries]);
      setIS(`⬆ Phase 1/3 — Uploading ${i+1}/${entries.length}: ${item.name}`);
      try {
        const res  = await fetch(item.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `cert-${item.name.replace(/\s+/g,"-")}-${i}.png`, { type:"image/png" });
        const cid  = await uploadToIpfsFilebase(file);
        entries[i] = { ...entries[i], cid, status: "uploaded" };
        setLog([...entries]);
        uploaded.push({ index:i, cid, name:item.name, competition:item.competition, email:item.email });
      } catch (err) {
        entries[i] = { ...entries[i], status: "upload_failed", error: err?.message };
        setLog([...entries]);
      }
    }

    if (!uploaded.length) {
      setIS("❌ All uploads failed. Check Pinata JWT.");
      setIssuing(false); return;
    }

    // ── PHASE 2: ONE blockchain transaction ──
    setPhase("blockchain");
    setIS(`⛓ Phase 2/3 — ONE MetaMask approval for all ${uploaded.length} certificates...`);

    let txHash = "";
    let nowSec = 0;
    try {
      const cert = await getContract();
      // ✅ New contract: issueBulk(cids[], names[], competitions[])
      const tx = await cert.issueBulk(
        uploaded.map(u => u.cid),
        uploaded.map(u => u.name),
        uploaded.map(u => u.competition),
        GAS_SETTINGS
      );
      setIS("⏳ Phase 2/3 — Waiting for blockchain confirmation...");
      const receipt = await tx.wait();
      txHash = receipt.hash;
      nowSec = Math.floor(Date.now() / 1000);

      // mark uploaded ones as "tx_done" — will finalize in phase 3
      for (const u of uploaded) {
        entries[u.index] = { ...entries[u.index], txHash, status: "tx_done" };
      }
      setLog([...entries]);
    } catch (err) {
      setIS("❌ Blockchain error: " + (err?.message || String(err)));
      setIssuing(false); return;
    }

    // ── PHASE 3: Re-render each certificate WITH QR + TX, re-upload final version ──
    setPhase("finalizing");
    setIS(`🎨 Phase 3/3 — Adding QR code & TX hash to each certificate...`);

    for (const u of uploaded) {
      setIS(`🎨 Phase 3/3 — Finalizing ${u.index+1}/${uploaded.length}: ${u.name}`);
      try {
        // Render final certificate with QR + TX printed on it
        const finalDataUrl = await renderCertificate({
          templateDataUrl: templateImg,
          namePlacement: placements.name,
          compPlacement: placements.competition,
          nameFont, compFont,
          participantName: u.name,
          competitionName: u.competition,
          cid: u.cid,
          txHash,
          showQR: showQR && !!placements.qr,
          showTx: showTx && !!placements.tx,
          qrPosition: placements.qr || null,
          txPosition: placements.tx || null,
        });

        // Upload final version to IPFS (overwrites/adds the final CID)
        const res  = await fetch(finalDataUrl);
        const blob = await res.blob();
        const file = new File([blob], `cert-final-${u.name.replace(/\s+/g,"-")}.png`, { type:"image/png" });
        const finalCid = await uploadToIpfsFilebase(file);

        // ✅ KEY FIX:
        // u.cid   = original CID stored ON BLOCKCHAIN (Phase 1) → use for verify
        // finalCid = re-rendered cert with QR printed → use only for display/image
        // Email and QR must always use u.cid (blockchain CID), NOT finalCid
        pushIssued({
          cid:      u.cid,       // ← blockchain CID (for verification)
          name:     u.name,
          course:   u.competition,
          className: "",
          imageCid: finalCid,    // ← final image CID (for display only)
          txHash,
          issuedAt: nowSec,
          revoked:  false,
          email:    u.email,
        });

        entries[u.index] = { ...entries[u.index], status: "issued", finalDataUrl, cid: u.cid, imageCid: finalCid, txHash };
        setLog([...entries]);
      } catch (err) {
        entries[u.index] = { ...entries[u.index], status: "finalize_failed", error: err?.message };
        setLog([...entries]);
      }
    }

    const issuedCount = entries.filter(e => e.status === "issued").length;
    setIS(`✅ Done! ${issuedCount}/${entries.length} certificates issued with QR & TX on blockchain.`);
    setPhase("done");
    setDone(true);
    setIssuing(false);
  }

  // ── Download finalized ZIP ───────────────────────────────────────────────────
  async function downloadZip() {
    try {
      const JSZip  = (await import("jszip")).default;
      const zip    = new JSZip();
      const folder = zip.folder("certificates");
      const source = log.length ? log : previews;
      for (const p of source) {
        const url  = p.finalDataUrl || p.dataUrl;
        const b64  = url.split(",")[1];
        folder.file(`${p.name.replace(/\s+/g,"_")}_${(p.competition||"").replace(/\s+/g,"_")}.png`, b64, { base64:true });
      }
      const blob = await zip.generateAsync({ type:"blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "certificates.zip"; a.click();
    } catch { alert("Run: npm install jszip"); }
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const fieldButtons = [
    { field:"name",        label:"👤 Name",        color:"#3b82f6", required:true },
    { field:"competition", label:"🏆 Competition",  color:"#f59e0b", required:false },
    { field:"qr",          label:"⬡ QR Code",      color:"#10b981", required:false, toggle: showQR, onToggle: setShowQR },
    { field:"tx",          label:"⛓ TX Hash",      color:"#8b5cf6", required:false, toggle: showTx, onToggle: setShowTx },
  ];

  return (
    <div style={{ padding:"1.5rem 0", maxWidth:960, margin:"0 auto" }}>

      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", margin:"0 0 4px" }}>
          🤖 AI Competition Certificate Generator
        </h2>
        <p style={{ fontSize:13, color:"#64748b", margin:0 }}>
          Blank template + Excel → AI cleans names → certificates rendered with <strong>QR code & blockchain TX</strong> → all issued in <strong>ONE transaction</strong>
        </p>
      </div>

      <Steps current={step} />

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div style={C.card}>
          <div style={C.cardTitle}>📄 Step 1 — Upload Blank Certificate Template</div>
          <p style={C.desc}>Upload your certificate with name & competition fields <strong>left blank/empty</strong>.</p>

          <label style={C.dropzone}>
            <input type="file" accept="image/*,application/pdf" onChange={handleTemplate} style={{ display:"none" }} />
            <div style={{ fontSize:52, marginBottom:10 }}>📋</div>
            <div style={{ fontWeight:700, fontSize:16, color:"#1e3a5f" }}>Click to upload template</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>PNG · JPG · PDF</div>
          </label>

          {tLoading && <div style={C.info}>⏳ Loading...</div>}
          {templateErr && <div style={{ ...C.info, background:"#fef2f2", color:"#b91c1c", borderColor:"#fecaca" }}>❌ {templateErr}</div>}

          {templateImg && !tLoading && (
            <div style={{ marginTop:20 }}>
              <img src={templateImg} alt="t" style={{ maxWidth:"100%", maxHeight:360, borderRadius:8, border:"1px solid #e2e8f0", display:"block" }} />
              <button onClick={() => setStep(2)} style={{ ...C.nextBtn, marginTop:16 }}>Next: Mark Field Positions →</button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div style={C.card}>
          <div style={C.cardTitle}>📍 Step 2 — Mark All Field Positions</div>
          <p style={C.desc}>Select each field below, then click where it should appear on the certificate.</p>

          {/* Field buttons */}
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {fieldButtons.map(({ field, label, color, required, toggle, onToggle }) => (
              <div key={field} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {onToggle && (
                  <label style={{ fontSize:11, color:"#64748b", display:"flex", gap:4, alignItems:"center", cursor:"pointer" }}>
                    <input type="checkbox" checked={toggle} onChange={e => onToggle(e.target.checked)} />
                    Include
                  </label>
                )}
                <button
                  onClick={() => { if (onToggle && !toggle) onToggle(true); setActiveField(field); }}
                  style={{
                    padding:"8px 14px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer",
                    background: activeField===field ? color : "#f8fafc",
                    color: activeField===field ? "#fff" : "#475569",
                    border: `2px solid ${activeField===field ? color : "#e2e8f0"}`,
                    opacity: (onToggle && !toggle) ? 0.5 : 1,
                  }}
                >
                  {label} {placements[field] ? "✅" : required ? "❌" : ""}
                </button>
              </div>
            ))}
          </div>

          {/* Font settings for name/competition */}
          {(activeField === "name" || activeField === "competition") && (() => {
            const font    = activeField==="name" ? nameFont : compFont;
            const setFont = activeField==="name" ? setNameFont : setCompFont;
            return (
              <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#334155", marginBottom:10 }}>
                  ✍ Font for {activeField==="name" ? "Name" : "Competition"}:
                </div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div>
                    <label style={C.fLabel}>Font</label>
                    <select value={font.family} onChange={e => setFont({...font,family:e.target.value})} style={C.fInput}>
                      <option value="Dancing Script">Dancing Script (Cursive)</option>
                      <option value="Great Vibes">Great Vibes (Elegant)</option>
                      <option value="Pinyon Script">Pinyon Script (Classic)</option>
                      <option value="Sacramento">Sacramento</option>
                      <option value="Pacifico">Pacifico</option>
                      <option value="Georgia">Georgia (Serif)</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                  <div>
                    <label style={C.fLabel}>Size</label>
                    <input type="number" value={font.size} min={16} max={200}
                      onChange={e => setFont({...font,size:Number(e.target.value)})}
                      style={{ ...C.fInput, width:64 }} />
                  </div>
                  <div>
                    <label style={C.fLabel}>Color</label>
                    <input type="color" value={font.color} onChange={e => setFont({...font,color:e.target.value})}
                      style={{ ...C.fInput, width:44, padding:2, cursor:"pointer" }} />
                  </div>
                  <label style={{ display:"flex", gap:4, alignItems:"center", fontSize:12, color:"#475569", cursor:"pointer", paddingBottom:4 }}>
                    <input type="checkbox" checked={font.italic} onChange={e => setFont({...font,italic:e.target.checked})} /> Italic
                  </label>
                  <label style={{ display:"flex", gap:4, alignItems:"center", fontSize:12, color:"#475569", cursor:"pointer", paddingBottom:4 }}>
                    <input type="checkbox" checked={font.bold} onChange={e => setFont({...font,bold:e.target.checked})} /> Bold
                  </label>
                  {/* preview */}
                  <div style={{ flex:"1 1 100%", marginTop:6 }}>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>Preview: </span>
                    <span style={{ fontFamily:`"${font.family}"`, fontSize:Math.min(font.size*0.45,36), color:font.color, fontWeight:font.bold?"bold":"normal", fontStyle:font.italic?"italic":"normal" }}>
                      {activeField==="name" ? "Tulaib Tauseef" : "Competitive Programming"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeField === "qr" && (
            <div style={{ ...C.info, marginBottom:12 }}>
              ℹ️ Click where the <strong>QR code</strong> should appear. It will be ~10% of certificate width. Students scan it to verify on blockchain.
            </div>
          )}
          {activeField === "tx" && (
            <div style={{ ...C.info, marginBottom:12 }}>
              ℹ️ Click where the <strong>transaction hash</strong> should appear. It links this certificate to the blockchain.
            </div>
          )}

          <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>
            👆 Click on the certificate to place: <strong style={{ color: fieldButtons.find(f=>f.field===activeField)?.color }}>
              {fieldButtons.find(f=>f.field===activeField)?.label}
            </strong>
          </div>

          <ClickableTemplate src={templateImg} markers={allMarkers} onClickField={handleImgClick} imgRef={imgRef} />

          {/* Status chips */}
          <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
            {fieldButtons.map(({ field, label, color, required }) => (
              <span key={field} style={{
                fontSize:11, padding:"3px 10px", borderRadius:100, fontWeight:600,
                background: placements[field] ? "#f0fdf4" : required ? "#fef2f2" : "#f8fafc",
                color: placements[field] ? "#15803d" : required ? "#b91c1c" : "#64748b",
                border: `1px solid ${placements[field] ? "#bbf7d0" : required ? "#fecaca" : "#e2e8f0"}`,
              }}>
                {placements[field] ? "✅" : required ? "❌" : "○"} {label}
              </span>
            ))}
            {allMarkers.length > 0 && (
              <button onClick={() => setPlacements({})} style={{ fontSize:11, padding:"3px 10px", borderRadius:100, fontWeight:600, background:"#fef2f2", color:"#b91c1c", border:"1px solid #fecaca", cursor:"pointer" }}>
                🗑 Reset all
              </button>
            )}
          </div>

          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            <button onClick={() => setStep(1)} style={C.backBtn}>← Back</button>
            <button onClick={() => setStep(3)} disabled={!placements.name}
              style={{ ...C.nextBtn, opacity: placements.name?1:0.5, cursor: placements.name?"pointer":"not-allowed" }}>
              Next: Upload Participant List →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div style={C.card}>
          <div style={C.cardTitle}>📊 Step 3 — Upload Participant List</div>
          <p style={C.desc}>Excel (.xlsx) or CSV with <code style={{ background:"#f1f5f9", padding:"1px 5px", borderRadius:3, fontFamily:"monospace" }}>name, competition, email</code> columns.</p>

          <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
            <pre style={{ margin:0, fontSize:12, color:"#334155", fontFamily:"monospace" }}>{`name           | competition              | email
Ali Ahmed      | Competitive Programming  | ali@email.com
Sara Khan      | Web Dev Hackathon        | sara@email.com`}</pre>
          </div>

          <label style={C.dropzone}>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display:"none" }} />
            <div style={{ fontSize:40, marginBottom:8 }}>📊</div>
            <div style={{ fontWeight:700, color:"#1e3a5f" }}>Click to upload Excel or CSV</div>
          </label>

          {fileLoading && <div style={C.info}>⏳ Parsing...</div>}
          {fileErr     && <div style={{ ...C.info, background:"#fef2f2", color:"#b91c1c", borderColor:"#fecaca" }}>❌ {fileErr}</div>}

          {cleaned.length > 0 && (
            <div style={{ marginTop:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                <span style={{ fontWeight:700, fontSize:15 }}>{cleaned.filter(r=>!r.skip).length} participants</span>
                <button onClick={handleAIClean} disabled={aiLoading} style={{
                  padding:"7px 14px", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer", border:"none",
                  background: aiLoading?"#e2e8f0":"linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: aiLoading?"#94a3b8":"#fff",
                }}>
                  {aiLoading ? "🤖 Cleaning..." : "🤖 Clean with AI"}
                </button>
              </div>

              <div style={{ overflowX:"auto", maxHeight:280, border:"1px solid #e2e8f0", borderRadius:8 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead style={{ position:"sticky", top:0, background:"#f8fafc", zIndex:1 }}>
                    <tr>{["#","Name","Competition","Email","Status"].map(h => (
                      <th key={h} style={{ padding:"7px 10px", borderBottom:"2px solid #e2e8f0", textAlign:"left", fontWeight:700, fontSize:12, color:"#475569" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {cleaned.map((r,i) => (
                      <tr key={i} style={{ background: r.skip?"#fef2f2": i%2===0?"#fff":"#fafafa", borderBottom:"1px solid #f1f5f9" }}>
                        <td style={C.td}>{i+1}</td>
                        <td style={{ ...C.td, fontWeight:600 }}>
                          {r.name}
                          {r.original_name && r.original_name!==r.name && <div style={{ fontSize:10, color:"#94a3b8" }}>was: {r.original_name}</div>}
                        </td>
                        <td style={C.td}>{r.competition||"—"}</td>
                        <td style={{ ...C.td, fontSize:11, color:"#64748b" }}>{r.email||"—"}</td>
                        <td style={C.td}>
                          {r.skip
                            ? <span style={{ color:"#b91c1c", fontWeight:700, fontSize:11 }}>Skip</span>
                            : <span style={{ color:"#15803d", fontWeight:700, fontSize:11 }}>✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                <button onClick={() => setStep(2)} style={C.backBtn}>← Back</button>
                <button onClick={generatePreviews} disabled={previewLoading} style={C.nextBtn}>
                  {previewLoading ? "⏳ Generating..." : `👁 Preview ${cleaned.filter(r=>!r.skip).length} Certificates →`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <div style={C.card}>
          <div style={C.cardTitle}>👁 Step 4 — Preview Certificates</div>

          {/* What will be added notice */}
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
            <div style={{ fontWeight:700, color:"#15803d", marginBottom:6, fontSize:14 }}>✅ One MetaMask approval for all {previews.length} certificates</div>
            <div style={{ fontSize:13, color:"#166534", lineHeight:1.7 }}>
              After issuing, each certificate will automatically get:<br />
              {showQR && placements.qr && <span>⬡ <strong>QR code</strong> printed at marked position — students scan to verify<br /></span>}
              {showTx && placements.tx && <span>⛓ <strong>Blockchain TX hash</strong> printed at marked position<br /></span>}
              📌 Preview below shows certificate <em>without</em> QR/TX (added after blockchain confirmation)
            </div>
          </div>

          <button onClick={downloadZip} style={{ ...C.backBtn, background:"#fefce8", borderColor:"#fcd34d", color:"#92400e", marginBottom:14 }}>
            ⬇ Download Preview ZIP
          </button>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, maxHeight:480, overflowY:"auto" }}>
            {previews.map((p,i) => (
              <div key={i} style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden", background:"#fff", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                <img src={p.dataUrl} alt={p.name} style={{ width:"100%", height:125, objectFit:"cover", display:"block" }} />
                <div style={{ padding:"7px 10px" }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:"#3b82f6" }}>{p.competition}</div>
                  {p.email && <div style={{ fontSize:10, color:"#94a3b8" }}>{p.email}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <button onClick={() => setStep(3)} style={C.backBtn}>← Back</button>
            <button onClick={handleIssueAll} style={{ ...C.nextBtn, background:"linear-gradient(135deg,#1e3a5f,#2563eb)", padding:"12px 28px", fontSize:15 }}>
              ⛓ Issue All {previews.length} — One Transaction →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5 ── */}
      {step === 5 && (
        <div style={C.card}>
          <div style={C.cardTitle}>⛓ Issuing Certificates on Blockchain</div>

          {/* Phase pills */}
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {[
              { key:"uploading",   label:"⬆ 1. IPFS Upload" },
              { key:"blockchain",  label:"⛓ 2. Blockchain (1 TX)" },
              { key:"finalizing",  label:"🎨 3. Add QR & TX" },
              { key:"done",        label:"✅ Done" },
            ].map(({ key, label }, i, arr) => {
              const order = ["uploading","blockchain","finalizing","done"];
              const phaseIdx   = order.indexOf(phase);
              const thisIdx    = order.indexOf(key);
              const isActive   = phase === key;
              const isDone     = phaseIdx > thisIdx;
              return (
                <React.Fragment key={key}>
                  <div style={{
                    padding:"5px 12px", borderRadius:100, fontSize:12, fontWeight:700,
                    background: isDone?"#f0fdf4": isActive?"#eff6ff":"#f8fafc",
                    color: isDone?"#15803d": isActive?"#1d4ed8":"#94a3b8",
                    border: `1px solid ${isDone?"#bbf7d0": isActive?"#bfdbfe":"#e2e8f0"}`,
                  }}>
                    {isDone ? label.replace(/^[^\s]+\s/, "✅ ") : label}
                  </div>
                  {i < arr.length-1 && <span style={{ color:"#cbd5e1", fontSize:16 }}>→</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Status */}
          <div style={{
            padding:"11px 16px", borderRadius:8, marginBottom:12, fontWeight:600, fontSize:14,
            background: issueStatus.startsWith("✅")?"#f0fdf4": issueStatus.startsWith("❌")?"#fef2f2":"#eff6ff",
            color: issueStatus.startsWith("✅")?"#15803d": issueStatus.startsWith("❌")?"#b91c1c":"#1d4ed8",
            border: `1px solid ${issueStatus.startsWith("✅")?"#bbf7d0": issueStatus.startsWith("❌")?"#fecaca":"#bfdbfe"}`,
          }}>
            {issueStatus || "Starting..."}
          </div>

          {/* Counters */}
          <div style={{ fontSize:13, color:"#475569", marginBottom:10 }}>
            ✅ {log.filter(l=>l.status==="issued").length} issued &nbsp;|&nbsp;
            🎨 {log.filter(l=>l.status==="tx_done").length} adding QR/TX &nbsp;|&nbsp;
            ⬆ {log.filter(l=>l.status==="uploaded"||l.status==="uploading").length} uploading &nbsp;|&nbsp;
            ❌ {log.filter(l=>["upload_failed","tx_failed","finalize_failed"].includes(l.status)).length} failed
          </div>

          {/* Log */}
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:440, overflowY:"auto" }}>
            {log.map((item, i) => {
              const sm = {
                pending:          { icon:"⏳", bg:"#f8fafc", color:"#64748b",  label:"Pending" },
                uploading:        { icon:"⬆",  bg:"#eff6ff", color:"#1d4ed8",  label:"Uploading..." },
                uploaded:         { icon:"✅",  bg:"#eff6ff", color:"#1d4ed8",  label:"Uploaded" },
                tx_done:          { icon:"🎨",  bg:"#faf5ff", color:"#7c3aed",  label:"Adding QR & TX..." },
                issued:           { icon:"✅",  bg:"#f0fdf4", color:"#15803d",  label:"Issued ✓" },
                upload_failed:    { icon:"❌",  bg:"#fef2f2", color:"#b91c1c",  label:"Upload Failed" },
                tx_failed:        { icon:"❌",  bg:"#fef2f2", color:"#b91c1c",  label:"TX Failed" },
                finalize_failed:  { icon:"⚠️", bg:"#fffbeb", color:"#92400e",  label:"QR/TX Failed" },
              };
              const s = sm[item.status] || sm.pending;
              const imgSrc = item.finalDataUrl || item.dataUrl;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:s.bg, border:"1px solid #e2e8f0" }}>
                  <span style={{ fontSize:16 }}>{s.icon}</span>
                  <img src={imgSrc} alt={item.name} style={{ width:52, height:36, objectFit:"cover", borderRadius:4, border:"1px solid #e2e8f0", flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{item.name}</div>
                    <div style={{ fontSize:11, color:"#64748b" }}>{item.competition}</div>
                    {item.email && <div style={{ fontSize:10, color:"#94a3b8" }}>{item.email}</div>}
                    {item.cid && <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{item.cid.slice(0,30)}…</div>}
                    {item.error && <div style={{ fontSize:10, color:"#b91c1c" }}>{item.error}</div>}
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:100, fontWeight:700, color:s.color, border:`1px solid ${s.color}33`, background:"#fff" }}>
                      {s.label}
                    </span>
                    {item.txHash && (
                      <a href={`https://amoy.polygonscan.com/tx/${item.txHash}`} target="_blank" rel="noreferrer"
                        style={{ fontSize:10, color:"#2563eb" }}>View Tx ↗</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {done && (
            <div style={{ marginTop:20, padding:"16px 20px", background:"#f0fdf4", borderRadius:12, border:"1px solid #bbf7d0" }}>
              <div style={{ fontWeight:800, color:"#15803d", fontSize:16, marginBottom:8 }}>
                🎉 {log.filter(l=>l.status==="issued").length} Certificates Successfully Issued!
              </div>
              <div style={{ fontSize:13, color:"#166534", lineHeight:1.8 }}>
                ✅ Each certificate has a unique CID on IPFS (Pinata)<br />
                ✅ All issued in ONE blockchain transaction<br />
                ✅ QR code & TX hash printed on each certificate<br />
                ✅ Saved to Admin – Issued tab
              </div>
              <div style={{ display:"flex", gap:10, marginTop:14, flexWrap:"wrap" }}>
                <button onClick={downloadZip} style={{ ...C.nextBtn, background:"#15803d" }}>
                  ⬇ Download All (ZIP)
                </button>
                <button
                  onClick={() => setShowEmailSender(true)}
                  style={{ ...C.nextBtn, background:"linear-gradient(135deg,#7c3aed,#6d28d9)" }}
                >
                  📧 Send Emails to Participants
                </button>
              </div>
            </div>
          )}
          {showEmailSender && (
            <EmailSender
              certificates={log.filter(l => l.status === "issued").map(l => ({
                name:        l.name,
                email:       l.email || "",
                course:      l.competition,
                competition: l.competition,
                cid:         l.cid,
                txHash:      l.txHash,
              }))}
              onClose={() => setShowEmailSender(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared style constants ───────────────────────────────────────────────────
const C = {
  card:    { background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"24px 28px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" },
  cardTitle: { fontSize:17, fontWeight:800, color:"#0f172a", marginBottom:8 },
  desc:    { fontSize:14, color:"#64748b", marginBottom:20, lineHeight:1.6 },
  dropzone:{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"2px dashed #cbd5e1", borderRadius:12, padding:"30px 24px", cursor:"pointer", background:"#f8fafc", textAlign:"center" },
  info:    { marginTop:10, padding:"10px 14px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, fontSize:13, color:"#1d4ed8" },
  nextBtn: { padding:"11px 24px", background:"#1e3a5f", border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" },
  backBtn: { padding:"11px 18px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, color:"#475569", fontWeight:600, fontSize:14, cursor:"pointer" },
  fLabel:  { display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:3 },
  fInput:  { padding:"5px 8px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:13, outline:"none" },
  td:      { padding:"7px 10px", verticalAlign:"top", fontSize:13 },
};