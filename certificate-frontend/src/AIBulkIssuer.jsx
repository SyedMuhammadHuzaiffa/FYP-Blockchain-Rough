// src/AIBulkIssuer.jsx  — MERKLE TREE VERSION
// Phase 2 now uses MerkleCertificate.issueBatch() instead of Certificate.issueBulk()
// Cost: ~0.0001 MATIC for ANY batch size (10 or 10,000 certs = same price)
//
// npm install papaparse jszip pdfjs-dist xlsx qrcode

import React, { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { uploadToIpfsFilebase } from "./ipfsClient";
import { pushIssued } from "./libs/store";
import { getContract, GAS_SETTINGS } from "./ethers-client";
import { buildMerkleTree, getMerkleProofByCid, verifyLocally } from "./libs/merkleUtils";
import EmailSender from "./EmailSender.jsx";
import MERKLE_ABI from "./merkle-abi.json";

// ─── Merkle Contract ──────────────────────────────────────────────────────────
const MERKLE_ADDRESS = "0xa9e704750FdF85D168965db823728199840EC840";

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
  return new ethers.Contract(MERKLE_ADDRESS, MERKLE_ABI, signer);
}

// ─── Performance tracker ──────────────────────────────────────────────────────
class PerfTracker {
  constructor() { this.marks = {}; }
  start(label) { this.marks[label] = performance.now(); }
  end(label) { return Math.round(performance.now() - (this.marks[label] || 0)); }
}

// ─── URL builder ──────────────────────────────────────────────────────────────
function buildVerifyUrl(cid) {
  return `${window.location.origin}?tab=verify&cid=${encodeURIComponent(cid)}`;
}

// ─── Generate QR ──────────────────────────────────────────────────────────────
async function generateQR(text, size = 160) {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(text, {
      width: size, margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch { return null; }
}

// ─── AI cleaner ───────────────────────────────────────────────────────────────
async function cleanWithAI(rows) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Clean this participant list for certificates:
- Capitalize names properly, fix spelling, Title Case competitions
- Mark skip:true for empty/invalid rows
Return ONLY raw JSON array. Each: {name, competition, email, skip, original_name, note}
Data: ${JSON.stringify(rows)}`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "[]";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return rows.map(r => ({ ...r, skip: false, original_name: r.name, note: "" }));
  }
}

// ─── PDF to image ─────────────────────────────────────────────────────────────
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
  return { dataUrl: c.toDataURL("image/png") };
}

// ─── Render certificate canvas ────────────────────────────────────────────────
async function renderCertificate({
  templateDataUrl, namePlacement, compPlacement,
  nameFont, compFont, participantName, competitionName,
  cid, txHash, showQR, showTx, qrPosition, txPosition,
}) {
  const verifyUrl = cid ? buildVerifyUrl(cid) : "";
  const qrDataUrl = showQR && verifyUrl ? await generateQR(verifyUrl, 180) : null;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      if (namePlacement) {
        const f = nameFont;
        ctx.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${f.size}px "${f.family}"`;
        ctx.fillStyle = f.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.15)"; ctx.shadowBlur = 2;
        ctx.fillText(participantName, namePlacement.xPct * img.width, namePlacement.yPct * img.height);
        ctx.shadowBlur = 0;
      }
      if (compPlacement) {
        const f = compFont;
        ctx.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${f.size}px "${f.family}"`;
        ctx.fillStyle = f.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(competitionName, compPlacement.xPct * img.width, compPlacement.yPct * img.height);
      }
      if (showQR && qrDataUrl && qrPosition) {
        const qrSize = Math.round(img.width * 0.10);
        const qrX = qrPosition.xPct * img.width - qrSize / 2;
        const qrY = qrPosition.yPct * img.height - qrSize / 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
        const qrImg = new Image();
        await new Promise(res => { qrImg.onload = res; qrImg.src = qrDataUrl; });
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        ctx.font = `${Math.round(img.width * 0.012)}px Arial`;
        ctx.fillStyle = "#555555"; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("Scan to Verify", qrX + qrSize / 2, qrY + qrSize + 6);
      }
      if (showTx && txHash && txPosition) {
        const fs = Math.round(img.width * 0.011);
        const x = txPosition.xPct * img.width, y = txPosition.yPct * img.height;
        ctx.fillStyle = "#888888"; ctx.font = `bold ${fs}px Arial`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("Blockchain TX:", x, y - fs);
        ctx.fillStyle = "#333333"; ctx.font = `${fs}px "Courier New"`;
        const half = Math.floor(txHash.length / 2);
        ctx.fillText(txHash.slice(0, half), x, y + 2);
        ctx.fillText(txHash.slice(half), x, y + fs + 4);
      }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = templateDataUrl;
  });
}

// ─── Parallel upload with concurrency control ─────────────────────────────────
async function uploadParallel(tasks, concurrency, onProgress) {
  const results = new Array(tasks.length);
  let index = 0, completed = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try { results[i] = { status: "fulfilled", value: await tasks[i]() }; }
      catch (err) { results[i] = { status: "rejected", reason: err }; }
      completed++;
      if (onProgress) onProgress(completed, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ─── Parse Excel/CSV ──────────────────────────────────────────────────────────
async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const Papa = (await import("papaparse")).default;
    return new Promise((res, rej) => {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: r => res(normalize(r.data)), error: rej,
      });
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
    const f = kws => k.find(x => kws.some(kw => x.toLowerCase().includes(kw)));
    return {
      name:        String(r[f(["name"])]                         || "").trim(),
      competition: String(r[f(["competition", "event", "course"])] || "").trim(),
      email:       String(r[f(["email", "mail"])]                 || "").trim(),
    };
  }).filter(r => r.name);
}

// ─── Steps indicator ──────────────────────────────────────────────────────────
function Steps({ current }) {
  const list = ["Upload Template", "Mark Fields", "Upload Excel", "Preview", "Issue & Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28, flexWrap: "wrap" }}>
      {list.map((label, i) => {
        const n = i + 1;
        return (
          <React.Fragment key={n}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: current > n ? "#15803d" : current === n ? "#1e3a5f" : "#e2e8f0",
                color: current >= n ? "#fff" : "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 13,
                border: current === n ? "3px solid #3b82f6" : "3px solid transparent",
              }}>
                {current > n ? "✓" : n}
              </div>
              <span style={{ fontSize: 11, color: current >= n ? "#1e3a5f" : "#94a3b8", fontWeight: current === n ? 700 : 500, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < list.length - 1 && (
              <div style={{ height: 2, width: 36, background: current > n ? "#15803d" : "#e2e8f0", margin: "0 3px", marginBottom: 20, flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ClickableTemplate({ src, markers, onClickField, imgRef }) {
  return (
    <div style={{ position: "relative", display: "inline-block", cursor: "crosshair", maxWidth: "100%" }}>
      <img ref={imgRef} src={src} alt="template" onClick={onClickField} draggable={false}
        style={{ maxWidth: "100%", maxHeight: 500, borderRadius: 8, border: "2px solid #3b82f6", display: "block", userSelect: "none" }} />
      {markers.map((m, i) => {
        const colors = { name: "#3b82f6", competition: "#f59e0b", qr: "#10b981", tx: "#8b5cf6" };
        const labels = { name: "Name", competition: "Competition", qr: "QR Code", tx: "TX Hash" };
        const c = colors[m.field] || "#64748b";
        return (
          <div key={i} style={{ position: "absolute", left: m.xPct * 100 + "%", top: m.yPct * 100 + "%", transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 5 }}>
            <div style={{ background: c + "ee", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>
              {labels[m.field] || m.field}
            </div>
            <div style={{ width: 2, height: 7, background: c, margin: "0 auto" }} />
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, margin: "0 auto" }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Research Metrics Panel ───────────────────────────────────────────────────
function MetricsPanel({ metrics }) {
  if (!metrics) return null;
  const speedup = metrics.uploadMs > 0
    ? (metrics.totalCerts * 3 / (metrics.uploadMs / 1000)).toFixed(1)
    : "—";
  return (
    <div style={{ background: "#0f172a", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
      <div style={{ fontWeight: 800, color: "#f1f5f9", fontSize: 14, marginBottom: 4 }}>
        Research Paper Performance Metrics
      </div>
      <div style={{ fontSize: 11, color: "#38bdf8", marginBottom: 12 }}>
        Merkle Tree — {metrics.totalCerts} certs stored as ONE bytes32 root
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
        {[
          { label: "Total Certificates", value: metrics.totalCerts,                                    unit: "certs"    },
          { label: "IPFS Upload Time",   value: (metrics.uploadMs / 1000).toFixed(1),                  unit: "seconds"  },
          { label: "Upload Speed",       value: metrics.uploadMs > 0 ? (metrics.totalCerts / (metrics.uploadMs / 1000)).toFixed(1) : "—", unit: "certs/sec" },
          { label: "Blockchain TX Time", value: (metrics.blockchainMs / 1000).toFixed(1),              unit: "seconds"  },
          { label: "Total Pipeline",     value: (metrics.totalMs / 1000).toFixed(1),                   unit: "seconds"  },
          { label: "Concurrency",        value: metrics.concurrency,                                   unit: "parallel" },
          { label: "Blockchain TXs",     value: "1",                                                   unit: "always"   },
          { label: "Gas Cost",           value: metrics.gasMatic || "~0.0001",                         unit: "MATIC"    },
          { label: "Speedup vs Seq.",    value: speedup + "x",                                         unit: "faster"   },
        ].map(({ label, value, unit }) => (
          <div key={label} style={{ background: "#1e293b", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#38bdf8" }}>{value}</div>
            <div style={{ fontSize: 10, color: "#475569" }}>{unit}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: "8px 12px", background: "#1e293b", borderRadius: 8, fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
        issueBulk (old): ~{(metrics.totalCerts * 0.005).toFixed(3)} MATIC |
        issueBatch Merkle (new): ~0.0001 MATIC |
        Savings: {((metrics.totalCerts * 0.005 - 0.0001) / (metrics.totalCerts * 0.005) * 100).toFixed(0)}%
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AIBulkIssuer() {
  const [step, setStep]         = useState(1);
  const [templateImg, setTImg]  = useState("");
  const [templateErr, setTErr]  = useState("");
  const [tLoading, setTLoading] = useState(false);
  const imgRef = useRef(null);
  const perf   = useRef(new PerfTracker());

  const [placements, setPlacements]   = useState({});
  const [activeField, setActiveField] = useState("name");
  const [nameFont, setNameFont] = useState({ size: 72, family: "Dancing Script", color: "#8B0000", bold: false, italic: true });
  const [compFont, setCompFont] = useState({ size: 54, family: "Dancing Script", color: "#8B0000", bold: false, italic: true });
  const [showQR, setShowQR] = useState(true);
  const [showTx, setShowTx] = useState(true);

  const [participants, setParticipants] = useState([]);
  const [cleaned, setCleaned]           = useState([]);
  const [fileErr, setFileErr]           = useState("");
  const [fileLoading, setFileLoading]   = useState(false);
  const [aiLoading, setAiLoading]       = useState(false);

  const [previews, setPreviews]               = useState([]);
  const [previewLoading, setPreviewLoading]   = useState(false);

  const [log, setLog]                   = useState([]);
  const [issueStatus, setIS]            = useState("");
  const [issueProgress, setIP]          = useState({ current: 0, total: 0 });
  const [phase, setPhase]               = useState("");
  const [issuing, setIssuing]           = useState(false);
  const [done, setDone]                 = useState(false);
  const [metrics, setMetrics]           = useState(null);
  const [concurrency, setConcurrency]   = useState(10);
  const [showEmailSender, setShowEmailSender] = useState(false);
  const [batchResult, setBatchResult]   = useState(null);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&family=Pinyon+Script&family=Sacramento&display=swap";
    document.head.appendChild(l);
  }, []);

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

  function handleImgClick(e) {
    const rect = imgRef.current.getBoundingClientRect();
    setPlacements(prev => ({
      ...prev,
      [activeField]: {
        field: activeField,
        xPct: (e.clientX - rect.left) / rect.width,
        yPct: (e.clientY - rect.top) / rect.height,
      },
    }));
  }

  const allMarkers = Object.values(placements);

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

  async function generatePreviews() {
    setPreviewLoading(true);
    const valid = cleaned.filter(r => !r.skip && r.name);
    const tasks = valid.map(row => async () => {
      const dataUrl = await renderCertificate({
        templateDataUrl: templateImg,
        namePlacement: placements.name, compPlacement: placements.competition,
        nameFont, compFont,
        participantName: row.name, competitionName: row.competition,
        cid: null, txHash: null, showQR: false, showTx: false,
        qrPosition: null, txPosition: null,
      });
      return { name: row.name, competition: row.competition, email: row.email || "", dataUrl, status: "pending", cid: "", txHash: "" };
    });
    const results = await uploadParallel(tasks, 8, null);
    setPreviews(results.filter(r => r.status === "fulfilled").map(r => r.value));
    setPreviewLoading(false);
    setStep(4);
  }

  // ─── MAIN ISSUE — MERKLE TREE VERSION ─────────────────────────────────────
  async function handleIssueAll() {
    setIssuing(true); setDone(false); setStep(5); setMetrics(null); setBatchResult(null);
    perf.current = new PerfTracker();
    perf.current.start("total");

    const entries = previews.map(p => ({
      ...p, status: "pending", cid: "", txHash: "", finalDataUrl: "",
    }));
    setLog([...entries]);

    // ── PHASE 1: Upload plain certs to IPFS in parallel ──────────────────────
    setPhase("uploading");
    setIS("Phase 1/3 — Uploading " + entries.length + " certs (" + concurrency + " parallel)...");
    setIP({ current: 0, total: entries.length });
    perf.current.start("upload");

    const uploadTasks = entries.map((item, i) => async () => {
      entries[i] = { ...entries[i], status: "uploading" };
      const res  = await fetch(item.dataUrl);
      const blob = await res.blob();
      const file = new File(
        [blob],
        "cert-" + item.name.replace(/\s+/g, "-") + "-" + i + ".png",
        { type: "image/png" }
      );
      const cid = await uploadToIpfsFilebase(file);
      return { index: i, cid, item };
    });

    const uploadResults = await uploadParallel(
      uploadTasks, concurrency,
      (done, total) => {
        setIP({ current: done, total });
        setIS("Phase 1/3 — Uploaded " + done + "/" + total + " (" + concurrency + " parallel)");
      }
    );
    const uploadMs = perf.current.end("upload");

    const uploaded = [];
    for (const result of uploadResults) {
      if (result.status === "fulfilled") {
        const { index, cid, item } = result.value;
        entries[index] = { ...entries[index], cid, status: "uploaded" };
        uploaded.push({ index, cid, name: item.name, competition: item.competition, email: item.email || "" });
      } else {
        const i = uploadResults.indexOf(result);
        entries[i] = { ...entries[i], status: "upload_failed", error: result.reason?.message || "Failed" };
      }
    }
    setLog([...entries]);

    if (!uploaded.length) {
      setIS("All uploads failed. Check Pinata JWT.");
      setIssuing(false); return;
    }

    // ── PHASE 2: Build Merkle tree + ONE blockchain TX ────────────────────────
    setPhase("blockchain");
    setIS("Phase 2/3 — Building Merkle tree for " + uploaded.length + " certificates...");
    perf.current.start("blockchain");

    let txHash = "", nowSec = 0, gasMatic = "", batchId = 0;
    try {
      // Build Merkle tree off-chain from all uploaded CIDs
      const certsForTree = uploaded.map(u => ({
        cid:         u.cid,
        name:        u.name,
        competition: u.competition,
      }));
      const { root } = buildMerkleTree(certsForTree);

      setIS("Phase 2/3 — ONE MetaMask TX storing Merkle root for " + uploaded.length + " certs...");

      // ONE transaction — stores only ONE bytes32 root
      const merkleContract = await getMerkleContract();
      const tx = await merkleContract.issueBatch(
        root,
        BigInt(uploaded.length),
        "AI Bulk Batch " + new Date().toLocaleDateString(),
        GAS_SETTINGS
      );

      setIS("Phase 2/3 — Waiting for blockchain confirmation...");
      const receipt = await tx.wait();
      txHash = receipt.hash;
      nowSec = Math.floor(Date.now() / 1000);

      // Get batchId from event logs
      try {
        const iface  = new ethers.Interface(MERKLE_ABI);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.name === "BatchIssued") {
              batchId = Number(parsed.args.batchId);
              break;
            }
          } catch { continue; }
        }
      } catch { batchId = 0; }

      // Estimate gas cost
      try {
        const gasUsed  = receipt.gasUsed  || BigInt(0);
        const gasPrice = receipt.gasPrice || ethers.parseUnits("30", "gwei");
        gasMatic = parseFloat(ethers.formatEther(gasUsed * gasPrice)).toFixed(6);
      } catch { gasMatic = "~0.0001"; }

      // Save batch info for verification
      setBatchResult({ batchId, root, txHash, count: uploaded.length });

      // Store Merkle proofs locally for each certificate
      const batchData = {
        batchId, root,
        description: "AI Bulk Batch",
        count: uploaded.length,
        txHash,
        issuedAt: nowSec,
        certs: uploaded.map(u => ({
          ...u,
          proof: getMerkleProofByCid(certsForTree, u.cid),
        })),
      };
      const existing = JSON.parse(localStorage.getItem("merkle_batches") || "[]");
      existing.push(batchData);
      localStorage.setItem("merkle_batches", JSON.stringify(existing));

      for (const u of uploaded) {
        entries[u.index] = { ...entries[u.index], txHash, batchId, status: "tx_done" };
      }
      setLog([...entries]);

    } catch (err) {
      setIS("Blockchain error: " + (err?.message || String(err)));
      setIssuing(false); return;
    }

    const blockchainMs = perf.current.end("blockchain");

    // ── PHASE 3: Re-render with QR + TX, upload final versions ───────────────
    setPhase("finalizing");
    setIS("Phase 3/3 — Adding QR & TX to all " + uploaded.length + " certificates...");
    setIP({ current: 0, total: uploaded.length });
    perf.current.start("finalize");

    const finalizeTasks = uploaded.map(u => async () => {
      const finalDataUrl = await renderCertificate({
        templateDataUrl: templateImg,
        namePlacement: placements.name, compPlacement: placements.competition,
        nameFont, compFont,
        participantName: u.name, competitionName: u.competition,
        cid: u.cid, txHash,
        showQR: showQR && !!placements.qr,
        showTx: showTx && !!placements.tx,
        qrPosition: placements.qr || null,
        txPosition:  placements.tx || null,
      });

      const res      = await fetch(finalDataUrl);
      const blob     = await res.blob();
      const file     = new File([blob], "final-" + u.name.replace(/\s+/g, "-") + ".png", { type: "image/png" });
      const finalCid = await uploadToIpfsFilebase(file);

      // Save to local store — cid = blockchain CID, imageCid = final rendered CID
      pushIssued({
        cid:       u.cid,
        name:      u.name,
        course:    u.competition,
        className: "",
        imageCid:  finalCid,
        txHash,
        issuedAt:  nowSec,
        revoked:   false,
        email:     u.email,
        batchId,
      });

      return { u, finalDataUrl, finalCid };
    });

    const finalResults = await uploadParallel(
      finalizeTasks,
      Math.min(5, concurrency),
      (done, total) => {
        setIP({ current: done, total });
        setIS("Phase 3/3 — Finalized " + done + "/" + total);
      }
    );

    const finalizeMs = perf.current.end("finalize");
    const totalMs    = perf.current.end("total");

    for (let i = 0; i < finalResults.length; i++) {
      const result = finalResults[i];
      const u      = uploaded[i];
      if (result.status === "fulfilled") {
        const { finalDataUrl, finalCid } = result.value;
        entries[u.index] = { ...entries[u.index], status: "issued", finalDataUrl, imageCid: finalCid, txHash };
      } else {
        entries[u.index] = { ...entries[u.index], status: "finalize_failed", error: result.reason?.message };
      }
    }
    setLog([...entries]);

    const issuedCount = entries.filter(e => e.status === "issued").length;
    setMetrics({ totalCerts: entries.length, uploadMs, blockchainMs, finalizeMs, totalMs, concurrency, gasMatic, issuedCount });
    setIS("Done! " + issuedCount + "/" + entries.length + " certificates issued via Merkle tree in " + (totalMs / 1000).toFixed(1) + "s");
    setPhase("done");
    setDone(true);
    setIssuing(false);
  }

  async function downloadZip() {
    try {
      const JSZip  = (await import("jszip")).default;
      const zip    = new JSZip();
      const folder = zip.folder("certificates");
      const source = log.length ? log : previews;
      for (const p of source) {
        const b64 = (p.finalDataUrl || p.dataUrl).split(",")[1];
        folder.file(
          p.name.replace(/\s+/g, "_") + "_" + (p.competition || "").replace(/\s+/g, "_") + ".png",
          b64, { base64: true }
        );
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a    = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "certificates.zip"; a.click();
    } catch { alert("Run: npm install jszip"); }
  }

  const fieldButtons = [
    { field: "name",        label: "Name",        color: "#3b82f6", required: true  },
    { field: "competition", label: "Competition",  color: "#f59e0b", required: false },
    { field: "qr",          label: "QR Code",      color: "#10b981", required: false, toggle: showQR, onToggle: setShowQR },
    { field: "tx",          label: "TX Hash",      color: "#8b5cf6", required: false, toggle: showTx, onToggle: setShowTx },
  ];

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
          AI Certificate Generator — Merkle Tree
        </h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 100, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontWeight: 700 }}>
            ~0.0001 MATIC for ANY batch size
          </span>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 100, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontWeight: 700 }}>
            Contract: 0xa9e7...EC840
          </span>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 100, background: "#faf5ff", border: "1px solid #e9d5ff", color: "#7c3aed", fontWeight: 700 }}>
            {concurrency} parallel uploads
          </span>
        </div>
      </div>

      <Steps current={step} />

      {/* STEP 1 */}
      {step === 1 && (
        <div style={C.card}>
          <div style={C.cardTitle}>Step 1 — Upload Blank Certificate Template</div>
          <label style={C.dropzone}>
            <input type="file" accept="image/*,application/pdf" onChange={handleTemplate} style={{ display: "none" }} />
            <div style={{ fontSize: 52, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>Click to upload template</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>PNG · JPG · PDF</div>
          </label>
          {tLoading && <div style={C.info}>Loading...</div>}
          {templateErr && <div style={{ ...C.info, background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" }}>{templateErr}</div>}
          {templateImg && !tLoading && (
            <div style={{ marginTop: 20 }}>
              <img src={templateImg} alt="t" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid #e2e8f0", display: "block" }} />
              <button onClick={() => setStep(2)} style={{ ...C.nextBtn, marginTop: 16 }}>Next: Mark Field Positions</button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div style={C.card}>
          <div style={C.cardTitle}>Step 2 — Mark All Field Positions</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {fieldButtons.map(({ field, label, color, required, toggle, onToggle }) => (
              <div key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {onToggle && (
                  <label style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                    <input type="checkbox" checked={toggle} onChange={e => onToggle(e.target.checked)} /> Include
                  </label>
                )}
                <button
                  onClick={() => { if (onToggle && !toggle) onToggle(true); setActiveField(field); }}
                  style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", background: activeField === field ? color : "#f8fafc", color: activeField === field ? "#fff" : "#475569", border: `2px solid ${activeField === field ? color : "#e2e8f0"}` }}>
                  {label} {placements[field] ? "✅" : required ? "❌" : ""}
                </button>
              </div>
            ))}
          </div>

          {(activeField === "name" || activeField === "competition") && (() => {
            const font    = activeField === "name" ? nameFont : compFont;
            const setFont = activeField === "name" ? setNameFont : setCompFont;
            return (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>
                  Font for {activeField === "name" ? "Name" : "Competition"}:
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={C.fLabel}>Font</label>
                    <select value={font.family} onChange={e => setFont({ ...font, family: e.target.value })} style={C.fInput}>
                      <option value="Dancing Script">Dancing Script</option>
                      <option value="Great Vibes">Great Vibes</option>
                      <option value="Pinyon Script">Pinyon Script</option>
                      <option value="Sacramento">Sacramento</option>
                      <option value="Pacifico">Pacifico</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                  <div>
                    <label style={C.fLabel}>Size</label>
                    <input type="number" value={font.size} min={16} max={200} onChange={e => setFont({ ...font, size: Number(e.target.value) })} style={{ ...C.fInput, width: 64 }} />
                  </div>
                  <div>
                    <label style={C.fLabel}>Color</label>
                    <input type="color" value={font.color} onChange={e => setFont({ ...font, color: e.target.value })} style={{ ...C.fInput, width: 44, padding: 2, cursor: "pointer" }} />
                  </div>
                  <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, cursor: "pointer", paddingBottom: 4 }}>
                    <input type="checkbox" checked={font.italic} onChange={e => setFont({ ...font, italic: e.target.checked })} /> Italic
                  </label>
                  <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, cursor: "pointer", paddingBottom: 4 }}>
                    <input type="checkbox" checked={font.bold} onChange={e => setFont({ ...font, bold: e.target.checked })} /> Bold
                  </label>
                </div>
              </div>
            );
          })()}

          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            Click on the certificate to place:{" "}
            <strong style={{ color: fieldButtons.find(f => f.field === activeField)?.color }}>
              {fieldButtons.find(f => f.field === activeField)?.label}
            </strong>
          </div>
          <ClickableTemplate src={templateImg} markers={allMarkers} onClickField={handleImgClick} imgRef={imgRef} />

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {fieldButtons.map(({ field, label, required }) => (
              <span key={field} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, fontWeight: 600, background: placements[field] ? "#f0fdf4" : required ? "#fef2f2" : "#f8fafc", color: placements[field] ? "#15803d" : required ? "#b91c1c" : "#64748b", border: `1px solid ${placements[field] ? "#bbf7d0" : required ? "#fecaca" : "#e2e8f0"}` }}>
                {placements[field] ? "✅" : required ? "❌" : "○"} {label}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => setStep(1)} style={C.backBtn}>Back</button>
            <button onClick={() => setStep(3)} disabled={!placements.name} style={{ ...C.nextBtn, opacity: placements.name ? 1 : 0.5 }}>
              Next: Upload Participant List
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div style={C.card}>
          <div style={C.cardTitle}>Step 3 — Upload Participant List</div>
          <label style={C.dropzone}>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
            <div style={{ fontWeight: 700, color: "#1e3a5f" }}>Click to upload Excel or CSV</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>name, competition, email columns</div>
          </label>
          {fileLoading && <div style={C.info}>Parsing...</div>}
          {fileErr && <div style={{ ...C.info, background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" }}>{fileErr}</div>}

          {cleaned.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{cleaned.filter(r => !r.skip).length} participants</span>
                <button onClick={handleAIClean} disabled={aiLoading} style={{ padding: "7px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none", background: aiLoading ? "#e2e8f0" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: aiLoading ? "#94a3b8" : "#fff" }}>
                  {aiLoading ? "AI Cleaning..." : "Clean with AI"}
                </button>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 280, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ position: "sticky", top: 0, background: "#f8fafc" }}>
                    <tr>{["#", "Name", "Competition", "Email", "Status"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", borderBottom: "2px solid #e2e8f0", textAlign: "left", fontSize: 12, color: "#475569" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {cleaned.map((r, i) => (
                      <tr key={i} style={{ background: r.skip ? "#fef2f2" : i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={C.td}>{i + 1}</td>
                        <td style={{ ...C.td, fontWeight: 600 }}>{r.name}</td>
                        <td style={C.td}>{r.competition || "—"}</td>
                        <td style={{ ...C.td, fontSize: 11, color: "#64748b" }}>{r.email || "—"}</td>
                        <td style={C.td}>
                          {r.skip
                            ? <span style={{ color: "#b91c1c", fontSize: 11, fontWeight: 700 }}>Skip</span>
                            : <span style={{ color: "#15803d", fontSize: 11, fontWeight: 700 }}>✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={() => setStep(2)} style={C.backBtn}>Back</button>
                <button onClick={generatePreviews} disabled={previewLoading} style={C.nextBtn}>
                  {previewLoading ? "Generating..." : "Preview " + cleaned.filter(r => !r.skip).length + " Certificates"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <div style={C.card}>
          <div style={C.cardTitle}>Step 4 — Preview & Configure</div>

          {/* Concurrency slider */}
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0369a1", marginBottom: 8 }}>
              Upload Concurrency: <span style={{ fontSize: 18, color: "#1e3a5f" }}>{concurrency} parallel</span>
            </div>
            <input type="range" min={1} max={15} value={concurrency} onChange={e => setConcurrency(Number(e.target.value))} style={{ width: "100%", marginBottom: 4 }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
              <span>1 (sequential)</span><span>5 (safe)</span><span>10 (fast)</span><span>15 (max)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#b91c1c" }}>issueBulk (old way)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#b91c1c" }}>~{(previews.length * 0.005).toFixed(3)} MATIC</div>
              </div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#15803d" }}>Merkle issueBatch (new)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#15803d" }}>~0.0001 MATIC</div>
              </div>
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#7c3aed" }}>Est. upload time</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed" }}>~{Math.ceil(previews.length / concurrency * 3)}s</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12, maxHeight: 400, overflowY: "auto", marginBottom: 16 }}>
            {previews.map((p, i) => (
              <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <img src={p.dataUrl} alt={p.name} style={{ width: "100%", height: 125, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "7px 10px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#3b82f6" }}>{p.competition}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(3)} style={C.backBtn}>Back</button>
            <button onClick={handleIssueAll} style={{ ...C.nextBtn, background: "linear-gradient(135deg,#15803d,#16a34a)", padding: "12px 28px", fontSize: 15 }}>
              Issue All {previews.length} via Merkle Tree
            </button>
          </div>
        </div>
      )}

      {/* STEP 5 */}
      {step === 5 && (
        <div style={C.card}>
          <div style={C.cardTitle}>Issuing via Merkle Tree</div>

          {/* Phase pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { key: "uploading",  label: "1. IPFS Upload"     },
              { key: "blockchain", label: "2. Merkle TX (1 TX)" },
              { key: "finalizing", label: "3. Add QR & TX"      },
              { key: "done",       label: "Done"                },
            ].map(({ key, label }, i, arr) => {
              const order   = ["uploading", "blockchain", "finalizing", "done"];
              const phaseIdx = order.indexOf(phase);
              const thisIdx  = order.indexOf(key);
              const isActive = phase === key;
              const isDone   = phaseIdx > thisIdx;
              return (
                <React.Fragment key={key}>
                  <div style={{ padding: "5px 12px", borderRadius: 100, fontSize: 12, fontWeight: 700, background: isDone ? "#f0fdf4" : isActive ? "#eff6ff" : "#f8fafc", color: isDone ? "#15803d" : isActive ? "#1d4ed8" : "#94a3b8", border: `1px solid ${isDone ? "#bbf7d0" : isActive ? "#bfdbfe" : "#e2e8f0"}` }}>
                    {isDone ? "✅ " : ""}{label}
                  </div>
                  {i < arr.length - 1 && <span style={{ color: "#cbd5e1", fontSize: 16 }}>→</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Progress bar */}
          {issueProgress.total > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 4 }}>
                <span>{issueProgress.current}/{issueProgress.total}</span>
                <span>{Math.round(issueProgress.current / issueProgress.total * 100)}%</span>
              </div>
              <div style={{ height: 10, background: "#e2e8f0", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: (issueProgress.current / issueProgress.total * 100) + "%", background: phase === "done" ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#6366f1)", borderRadius: 5, transition: "width 0.15s ease" }} />
              </div>
            </div>
          )}

          <div style={{ padding: "11px 16px", borderRadius: 8, marginBottom: 12, fontWeight: 600, fontSize: 14, background: issueStatus.startsWith("Done") ? "#f0fdf4" : issueStatus.includes("error") || issueStatus.startsWith("All") ? "#fef2f2" : "#eff6ff", color: issueStatus.startsWith("Done") ? "#15803d" : issueStatus.includes("error") || issueStatus.startsWith("All") ? "#b91c1c" : "#1d4ed8" }}>
            {issueStatus || "Starting..."}
          </div>

          {/* Batch info */}
          {batchResult && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12 }}>
              <strong style={{ color: "#15803d" }}>Merkle Batch #{batchResult.batchId}</strong> — Root: <code style={{ fontFamily: "monospace", fontSize: 10 }}>{batchResult.root?.slice(0, 30)}...</code>
              <br />
              <a href={"https://amoy.polygonscan.com/tx/" + batchResult.txHash} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 11 }}>
                View TX on blockchain ↗
              </a>
            </div>
          )}

          <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
            Issued: {log.filter(l => l.status === "issued").length} |
            Failed: {log.filter(l => ["upload_failed", "finalize_failed"].includes(l.status)).length} |
            Concurrency: {concurrency}x parallel
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 360, overflowY: "auto" }}>
            {log.map((item, i) => {
              const sm = {
                pending:         { icon: "⏳", bg: "#f8fafc", color: "#64748b", label: "Pending"    },
                uploading:       { icon: "⬆",  bg: "#eff6ff", color: "#1d4ed8", label: "Uploading..." },
                uploaded:        { icon: "✅",  bg: "#eff6ff", color: "#1d4ed8", label: "Uploaded"   },
                tx_done:         { icon: "🌲",  bg: "#faf5ff", color: "#7c3aed", label: "In Merkle"  },
                issued:          { icon: "✅",  bg: "#f0fdf4", color: "#15803d", label: "Issued"     },
                upload_failed:   { icon: "❌",  bg: "#fef2f2", color: "#b91c1c", label: "Upload Failed" },
                finalize_failed: { icon: "⚠️", bg: "#fffbeb", color: "#92400e", label: "Finalize Failed" },
              };
              const s = sm[item.status] || sm.pending;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, background: s.bg, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <img src={item.finalDataUrl || item.dataUrl} alt={item.name} style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{item.competition}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, fontWeight: 700, color: s.color, border: `1px solid ${s.color}33`, background: "#fff", flexShrink: 0 }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          <MetricsPanel metrics={metrics} />

          {done && (
            <div style={{ marginTop: 20, padding: "16px 20px", background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0" }}>
              <div style={{ fontWeight: 800, color: "#15803d", fontSize: 16, marginBottom: 8 }}>
                {log.filter(l => l.status === "issued").length} Certificates Issued via Merkle Tree!
              </div>
              <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.8, marginBottom: 12 }}>
                Gas paid: <strong>{metrics?.gasMatic || "~0.0001"} MATIC</strong> for all {log.filter(l => l.status === "issued").length} certs<br />
                vs issueBulk would cost: <strong>~{(log.filter(l => l.status === "issued").length * 0.005).toFixed(3)} MATIC</strong><br />
                Savings: <strong style={{ color: "#15803d" }}>~{((log.filter(l => l.status === "issued").length * 0.005 - 0.0001)).toFixed(3)} MATIC</strong>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={downloadZip} style={{ ...C.nextBtn, background: "#15803d" }}>Download ZIP</button>
                <button onClick={() => setShowEmailSender(true)} style={{ ...C.nextBtn, background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}>Send Emails</button>
              </div>
            </div>
          )}

          // In AIBulkIssuer.jsx — find this block near the bottom (the showEmailSender section)
// and replace the certificates= prop with this version that passes merkleData:

{showEmailSender && (
  <EmailSender
    certificates={log.filter(l => l.status === "issued").map(l => {
      // Find this cert's proof from localStorage
      const batches = JSON.parse(localStorage.getItem("merkle_batches") || "[]");
      const batch   = batches.find(b => b.batchId === l.batchId);
      const cert    = batch?.certs?.find(c => c.cid === l.cid);

      return {
        name:        l.name,
        email:       l.email || "",
        course:      l.competition,
        competition: l.competition,
        cid:         l.cid,
        txHash:      l.txHash,
        // Pass merkleData so email link includes proof — works on any device
        merkleData: cert ? {
          batchId:     l.batchId,
          name:        l.name,
          competition: l.competition,
          proof:       cert.proof,
          root:        batch.root,
          txHash:      l.txHash,
          issuedAt:    batch.issuedAt,
          batchDesc:   batch.description,
        } : null,
      };
    })}
    onClose={() => setShowEmailSender(false)}
  />
)}
        </div>
      )}
    </div>
  );
}

const C = {
  card:      { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 12 },
  dropzone:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed #cbd5e1", borderRadius: 12, padding: "30px 24px", cursor: "pointer", background: "#f8fafc", textAlign: "center" },
  info:      { marginTop: 10, padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13, color: "#1d4ed8" },
  nextBtn:   { padding: "11px 24px", background: "#1e3a5f", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  backBtn:   { padding: "11px 18px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, color: "#475569", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  fLabel:    { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 3 },
  fInput:    { padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, outline: "none" },
  td:        { padding: "7px 10px", verticalAlign: "top", fontSize: 13 },
};