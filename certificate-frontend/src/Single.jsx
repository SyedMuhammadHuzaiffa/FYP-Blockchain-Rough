// src/Single.jsx
import React, { useState, useRef } from "react";
import { ethers } from "ethers";
import { resolveCertificate } from "./ethers-client";
import { pushIssued, cidExists } from "./libs/store";
import { uploadToIpfsFilebase, filebaseGatewayUrl } from "./ipfsClient";
import CertQRCode from "./QRCode";

// ─── Certificate Card shown after issuing ─────────────────────────────────────
function CertificateCard({ name, course, className, cid, issuedAt, txHash, imageUrl }) {
  const printRef = useRef(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;

    const win = window.open("", "_blank", "width=920,height=700");
    if (!win) {
      alert("Popup blocked — please allow popups for this site.");
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>Certificate – ${name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Georgia, serif; background: #fff; }
            .cert {
              width: 820px; margin: 20px auto;
              border: 8px double #1e3a5f;
              padding: 36px 44px;
              background: linear-gradient(135deg, #fdfcfb 0%, #f8f6f0 100%);
            }
            .header { text-align: center; margin-bottom: 14px; }
            .org { font-size: 26px; font-weight: bold; color: #1e3a5f; }
            .sub { font-size: 10px; color: #888; letter-spacing: 3px; margin-top: 2px; }
            hr { border: none; border-top: 1px solid #c9a84c; margin: 14px auto; width: 75%; }
            .body { text-align: center; margin: 18px 0; }
            .label { font-size: 11px; color: #666; letter-spacing: 2px; margin-bottom: 6px; }
            .sname { font-size: 38px; color: #1e3a5f; font-style: italic; margin: 8px 0 12px; }
            .clabel { font-size: 11px; color: #666; letter-spacing: 1px; }
            .cname { font-size: 22px; font-weight: bold; color: #c9a84c; margin: 4px 0 6px; }
            .cls { font-size: 13px; color: #666; margin-bottom: 6px; }
            .date { font-size: 12px; color: #666; margin-top: 6px; }
            .cimg { text-align: center; margin: 14px 0; }
            .cimg img { max-width: 320px; max-height: 180px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 6px; }
            .bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; }
            .seal {
              width: 80px; height: 80px; border-radius: 50%;
              border: 3px double #c9a84c;
              display: flex; align-items: center; justify-content: center;
              font-size: 9px; color: #c9a84c; font-weight: bold;
              letter-spacing: 1px; text-align: center; padding: 8px;
            }
            .cidsec { flex: 1; text-align: center; padding: 0 16px; }
            .cidlbl { font-size: 9px; color: #aaa; margin-bottom: 4px; }
            .cidval { font-size: 8px; color: #888; word-break: break-all; font-family: monospace; }
            .qrsec { text-align: center; }
            .qrsec img { border: 2px solid #e2e8f0; border-radius: 6px; display: block; }
            .qrlbl { font-size: 9px; color: #888; margin-top: 3px; }
          </style>
        </head>
        <body>
          <div class="cert">
            <div class="header">
              <div style="font-size:11px;letter-spacing:4px;color:#1e3a5f;text-transform:uppercase;">This is to Certify that</div>
              <div class="org">Blockchain Certificate System</div>
              <div class="sub">POLYGON AMOY TESTNET · VERIFIED ON CHAIN</div>
            </div>
            <hr/>
            <div class="body">
              <div class="label">PROUDLY PRESENTED TO</div>
              <div class="sname">${name}</div>
              <div class="clabel">has successfully completed the course</div>
              <div class="cname">${course}</div>
              ${className ? `<div class="cls">Class / Batch: ${className}</div>` : ""}
              ${issuedAt ? `<div class="date">Issued on ${new Date(issuedAt * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>` : ""}
            </div>
            ${imageUrl ? `<div class="cimg"><img src="${imageUrl}" alt="cert"/></div>` : ""}
            <hr/>
            <div class="bottom">
              <div class="seal">OFFICIAL<br/>SEAL<br/>✦</div>
              <div class="cidsec">
                <div class="cidlbl">Certificate ID (verify at portal)</div>
                <div class="cidval">${cid}</div>
              </div>
              <div class="qrsec" id="qr-container">
                <div class="qrlbl">Generating QR...</div>
              </div>
            </div>
          </div>
          <script>
            // Generate QR inline using qrcode CDN for the print window
            (function() {
              const verifyUrl = "${window.location.origin}${window.location.pathname}#verify?cid=${cid}";
              const script = document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
              script.onload = function() {
                const container = document.getElementById("qr-container");
                container.innerHTML = "";
                new QRCode(container, {
                  text: verifyUrl,
                  width: 110,
                  height: 110,
                  colorDark: "#0f172a",
                  colorLight: "#ffffff",
                });
                const lbl = document.createElement("div");
                lbl.className = "qrlbl";
                lbl.textContent = "Scan to Verify";
                container.appendChild(lbl);
                setTimeout(function() { window.print(); }, 800);
              };
              document.head.appendChild(script);
            })();
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  const explorerUrl = txHash ? `https://amoy.polygonscan.com/tx/${txHash}` : "";
  const dateStr = issuedAt
    ? new Date(issuedAt * 1000).toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : "";

  return (
    <div style={{ marginTop: 28 }}>
      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: "9px 20px",
            background: "#1e3a5f",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          🖨 Print / Save as PDF
        </button>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "9px 20px",
              background: "#f0f9ff",
              color: "#0369a1",
              border: "1px solid #7dd3fc",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            ⛓ View on Blockchain
          </a>
        )}
      </div>

      {/* Certificate Preview */}
      <div
        ref={printRef}
        style={{
          border: "8px double #1e3a5f",
          borderRadius: 4,
          padding: "36px 44px",
          background: "linear-gradient(135deg, #fdfcfb 0%, #f8f6f0 100%)",
          maxWidth: 820,
          fontFamily: "Georgia, serif",
          color: "#1e3a5f",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, textTransform: "uppercase" }}>
            This is to Certify that
          </div>
          <div style={{ fontSize: 26, fontWeight: "bold", marginTop: 4 }}>
            Blockchain Certificate System
          </div>
          <div style={{ fontSize: 11, color: "#888", letterSpacing: 2, marginTop: 2 }}>
            Polygon Amoy Testnet · Verified on Chain
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #c9a84c", margin: "14px auto", width: "75%" }} />

        {/* Body */}
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <div style={{ fontSize: 12, color: "#666", letterSpacing: 2, marginBottom: 6 }}>
            PROUDLY PRESENTED TO
          </div>
          <div style={{ fontSize: 40, fontStyle: "italic", margin: "8px 0 14px" }}>
            {name}
          </div>
          <div style={{ fontSize: 12, color: "#666", letterSpacing: 1, marginBottom: 6 }}>
            has successfully completed the course
          </div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: "#c9a84c", margin: "4px 0 6px" }}>
            {course}
          </div>
          {className && (
            <div style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>
              Class / Batch: {className}
            </div>
          )}
          {dateStr && (
            <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
              Issued on {dateStr}
            </div>
          )}
        </div>

        {/* Image */}
        {imageUrl && (
          <div style={{ textAlign: "center", margin: "16px 0" }}>
            <img
              src={imageUrl}
              alt="Certificate"
              style={{ maxWidth: 340, maxHeight: 200, objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: 6 }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid #c9a84c", margin: "14px auto", width: "75%" }} />

        {/* Bottom: Seal + CID + QR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}>
          {/* Seal */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: "3px double #c9a84c",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto",
              fontSize: 9, color: "#c9a84c", textAlign: "center",
              fontWeight: "bold", letterSpacing: 1, padding: 8,
            }}>
              OFFICIAL<br />SEAL<br />✦
            </div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Authorized</div>
          </div>

          {/* CID */}
          <div style={{ textAlign: "center", flex: 1, padding: "0 20px" }}>
            <div style={{ fontSize: 9, color: "#aaa", marginBottom: 4 }}>
              Certificate ID (verify at portal)
            </div>
            <div style={{ fontSize: 8, color: "#888", wordBreak: "break-all", fontFamily: "monospace" }}>
              {cid}
            </div>
          </div>

          {/* QR */}
          <div style={{ textAlign: "center" }}>
            <CertQRCode cid={cid} size={110} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Single Component ────────────────────────────────────────────────────
export default function Single() {
  const [name, setName]               = useState("");
  const [course, setCourse]           = useState("");
  const [className, setClassName]     = useState("");
  const [studentWallet, setStudentWallet] = useState("");
  const [cid, setCid]                 = useState("");
  const [status, setStatus]           = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading]     = useState(false);
  const [issuing, setIssuing]         = useState(false);
  const [issuedData, setIssuedData]   = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    setStatus("");
    setUploadStatus("Uploading to IPFS via Pinata...");
    setUploading(true);
    setIssuedData(null);

    try {
      const newCid = (await uploadToIpfsFilebase(file)).trim();
      if (cidExists(newCid)) {
        setUploading(false);
        setCid("");
        setUploadStatus("");
        setStatus("❗ This image/CID is already used. Duplicate not allowed.");
        return;
      }
      setCid(newCid);
      setUploading(false);
      setUploadStatus(`✅ Uploaded — CID: ${newCid}`);
    } catch (err) {
      setUploading(false);
      setUploadStatus("");
      setStatus("❌ Upload failed: " + (err?.message || String(err)));
    }
  }

  async function handleIssue(e) {
    e.preventDefault();
    setStatus("");
    setIssuedData(null);

    const trimmedName   = name.trim();
    const trimmedCourse = course.trim();
    const trimmedClass  = className.trim();
    const trimmedCid    = cid.trim();
    const trimmedWallet = studentWallet.trim();

    if (!trimmedName)   { setStatus("❗ Please enter student name."); return; }
    if (!trimmedCourse) { setStatus("❗ Please enter course."); return; }
    if (!trimmedCid)    { setStatus("❗ Please upload the certificate image first."); return; }
    if (cidExists(trimmedCid)) { setStatus("❗ A certificate with this CID already exists."); return; }

    let issuedTo = ethers.ZeroAddress;
    if (trimmedWallet) {
      if (!ethers.isAddress(trimmedWallet)) {
        setStatus("❗ Invalid student wallet address.");
        return;
      }
      issuedTo = trimmedWallet;
    }

    try {
      setIssuing(true);
      setStatus("⏳ Connecting to MetaMask...");
      const cert = await resolveCertificate();

      setStatus("⏳ Sending transaction — confirm in MetaMask...");
      const tx = await cert.addCertificate(
        trimmedName, trimmedCourse, trimmedClass || "", trimmedCid, issuedTo
      );

      setStatus("⏳ Waiting for confirmation...");
      const receipt = await tx.wait();
      const nowSec = Math.floor(Date.now() / 1000);

      pushIssued({
        cid: trimmedCid,
        name: trimmedName,
        course: trimmedCourse,
        className: trimmedClass || "",
        imageCid: trimmedCid,
        txHash: receipt.hash,
        issuedAt: nowSec,
        revoked: false,
      });

      setStatus("✅ Certificate issued successfully!");
      setIssuedData({
        name: trimmedName,
        course: trimmedCourse,
        className: trimmedClass || "",
        cid: trimmedCid,
        issuedAt: nowSec,
        txHash: receipt.hash,
        imageUrl: filebaseGatewayUrl(trimmedCid),
      });
    } catch (err) {
      console.error(err);
      setStatus("❌ Failed: " + (err?.message || String(err)));
    } finally {
      setIssuing(false);
    }
  }

  const previewUrl = cid ? filebaseGatewayUrl(cid) : "";

  return (
    <section style={{ padding: "1.5rem 0" }}>
      <h2>Teacher – Single Certificate</h2>

      <form onSubmit={handleIssue} style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Student Name<br />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ali Ahmed" style={{ width: "100%" }} />
          </label>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Course<br />
            <input type="text" value={course} onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Web3 Basics" style={{ width: "100%" }} />
          </label>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Class (optional)<br />
            <input type="text" value={className} onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. BSSE-6B" style={{ width: "100%" }} />
          </label>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Student Wallet (optional)<br />
            <input type="text" value={studentWallet} onChange={(e) => setStudentWallet(e.target.value)}
              placeholder="0x..." style={{ width: "100%" }} />
          </label>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>Certificate Image (Pinata IPFS)<br />
            <input type="file" accept="image/*" onChange={handleFileChange}
              disabled={uploading || issuing} />
          </label>
          {uploadStatus && (
            <div style={{ marginTop: 4, fontSize: 13, color: "#15803d" }}>{uploadStatus}</div>
          )}
          {previewUrl && !issuedData && (
            <div style={{ marginTop: 8 }}>
              <img src={previewUrl} alt="preview"
                style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </div>
          )}
        </div>

        <button type="submit" disabled={issuing || uploading}
          style={{
            padding: "10px 28px",
            background: issuing ? "#94a3b8" : "#1e3a5f",
            color: "#fff", border: "none", borderRadius: 8,
            fontWeight: 700, fontSize: 15,
            cursor: issuing ? "not-allowed" : "pointer",
          }}>
          {issuing ? "Issuing..." : "Issue Certificate"}
        </button>
      </form>

      {status && (
        <pre style={{
          marginTop: 16, whiteSpace: "pre-wrap", padding: "12px 16px",
          background: status.startsWith("✅") ? "#f0fdf4" : status.startsWith("❌") ? "#fef2f2" : "#f8fafc",
          border: `1px solid ${status.startsWith("✅") ? "#bbf7d0" : status.startsWith("❌") ? "#fecaca" : "#e2e8f0"}`,
          borderRadius: 8, fontSize: 14,
          color: status.startsWith("✅") ? "#15803d" : status.startsWith("❌") ? "#b91c1c" : "#334155",
          maxWidth: 560,
        }}>
          {status}
        </pre>
      )}

      {issuedData && (
        <CertificateCard
          name={issuedData.name}
          course={issuedData.course}
          className={issuedData.className}
          cid={issuedData.cid}
          issuedAt={issuedData.issuedAt}
          txHash={issuedData.txHash}
          imageUrl={issuedData.imageUrl}
        />
      )}
    </section>
  );
}