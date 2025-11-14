// src/Single.tsx
import React, { useState } from "react";
import { ethers } from "ethers";
import { resolveCertificate } from "./ethers-client";
import { pushIssued } from "./libs/store";
import { uploadToIpfsFilebase, filebaseGatewayUrl } from "./ipfsClient";

export default function Single() {
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [className, setClassName] = useState(""); // optional
  const [studentWallet, setStudentWallet] = useState(""); // optional
  const [cid, setCid] = useState("");

  const [status, setStatus] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ----------------- ISSUE CERTIFICATE -----------------
  const issueCertificate = async () => {
    setStatus("");

    // ----- VALIDATION -----
    if (!name || !course || !cid) {
      setStatus("❗ Please enter Student Name, Course, and CID.");
      return;
    }

    // Wallet only if provided
    let issuedTo = ethers.ZeroAddress;
    const trimmed = studentWallet.trim();
    if (trimmed) {
      if (!ethers.isAddress(trimmed)) {
        setStatus("❗ Invalid student wallet address.");
        return;
      }
      issuedTo = trimmed;
    }

    try {
      setStatus("⏳ Connecting to MetaMask...");
      const cert = await resolveCertificate();

      setStatus("⏳ Sending transaction...");
      const tx = await cert.addCertificate(
        name,
        course,
        className || "",
        cid,
        issuedTo
      );

      setStatus("⏳ Waiting for confirmation...");
      const receipt = await tx.wait();

      const nowSec = Math.floor(Date.now() / 1000);

      // Save in Admin – Issued (local)
      pushIssued({
        cid,
        name,
        course,
        className: className || "",
        imageCid: cid,
        txHash: receipt.hash,
        issuedAt: nowSec,
        revoked: false,
      });

      setStatus(
        `✅ Certificate issued successfully!
Tx: ${receipt.hash}
CID: ${cid}`
      );

      // Reset form
      setName("");
      setCourse("");
      setClassName("");
      setStudentWallet("");
      setCid("");
      setUploadStatus("");
    } catch (err) {
      console.error(err);
      setStatus("❌ Error issuing certificate. Check console / MetaMask.");
    }
  };

  // ----------------- HANDLE FILE → IPFS UPLOAD -----------------
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadStatus("⏳ Uploading to IPFS via Filebase...");

      const newCid = await uploadToIpfsFilebase(file);

      setCid(newCid);
      setUploadStatus(`✅ Uploaded to IPFS. CID: ${newCid}`);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || String(err);
      setUploadStatus(`❌ IPFS upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const previewUrl = cid ? filebaseGatewayUrl(cid) : "";

  // ----------------- RENDER -----------------
  return (
    <div>
      <h2>Teacher – Single Certificate</h2>
      <p>Issue a single blockchain certificate and store it in Admin Issued.</p>

      {/* BASIC FIELDS */}
      <div style={{ marginTop: "20px" }}>
        <label>
          Student Name:&nbsp;
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ali Raza"
          />
        </label>

        <label style={{ marginLeft: "10px" }}>
          Course:&nbsp;
          <input
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="Blockchain Fundamentals"
          />
        </label>

        <label style={{ marginLeft: "10px" }}>
          Class / Batch (optional):&nbsp;
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="BSCS-8A (optional)"
          />
        </label>

        <label style={{ marginLeft: "10px" }}>
          Student Wallet (optional):&nbsp;
          <input
            value={studentWallet}
            onChange={(e) => setStudentWallet(e.target.value)}
            placeholder="0x..."
          />
        </label>
      </div>

      {/* IPFS UPLOAD */}
      <div style={{ marginTop: "20px" }}>
        <div>
          <label>
            Certificate Image:&nbsp;
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
        </div>

        <div style={{ marginTop: "8px" }}>
          <label>
            IPFS CID:&nbsp;
            <input
              style={{ minWidth: "320px" }}
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              placeholder="Qm... or bafy..."
            />
          </label>
        </div>

        {uploadStatus && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "13px",
              color: uploadStatus.startsWith("✅")
                ? "green"
                : uploadStatus.startsWith("❌")
                ? "red"
                : "#444",
            }}
          >
            {uploadStatus}
          </div>
        )}

        {previewUrl && (
          <div style={{ marginTop: "10px" }}>
            <strong>Preview:</strong>
            <div style={{ marginTop: "6px" }}>
              <img
                src={previewUrl}
                alt="Certificate preview"
                style={{
                  width: "200px",
                  height: "200px",
                  objectFit: "cover",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                }}
              />
            </div>
            <div style={{ marginTop: "4px", fontSize: "12px" }}>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                {previewUrl}
              </a>
            </div>
          </div>
        )}
      </div>

      <button
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: isUploading ? "#555" : "black",
          color: "white",
          borderRadius: "8px",
          cursor: isUploading ? "not-allowed" : "pointer",
        }}
        onClick={issueCertificate}
        disabled={isUploading}
      >
        {isUploading ? "Uploading..." : "Issue Certificate"}
      </button>

      {status && (
        <pre
          style={{
            marginTop: "20px",
            whiteSpace: "pre-wrap",
            padding: "10px",
            background: "#f8f8f8",
            borderRadius: "8px",
          }}
        >
          {status}
        </pre>
      )}
    </div>
  );
}
