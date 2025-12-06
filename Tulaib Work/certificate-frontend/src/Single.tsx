// src/Single.tsx
import React, { useState } from "react";
import { ethers } from "ethers";
import { resolveCertificate } from "./ethers-client";
import { pushIssued, cidExists } from "./libs/store";
import { uploadToIpfsFilebase, filebaseGatewayUrl } from "./ipfsClient";

export default function Single() {
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [className, setClassName] = useState("");       // optional
  const [studentWallet, setStudentWallet] = useState(""); // optional
  const [cid, setCid] = useState("");

  const [status, setStatus] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [issuing, setIssuing] = useState(false);

  // 🔹 Upload certificate image to Lighthouse
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    setStatus("");
    setUploadStatus("Uploading to IPFS via Lighthouse...");
    setUploading(true);

    try {
      const newCid = (await uploadToIpfsFilebase(file)).trim();

      // Check in local DB if this CID is already used
      if (cidExists(newCid)) {
        setUploading(false);
        setCid("");
        setUploadStatus("");
        setStatus(
          "❗ This image/CID is already used in an issued certificate. Duplicate is not allowed."
        );
        return;
      }

      setCid(newCid);
      setUploading(false);
      setUploadStatus(`Uploaded ✅ CID: ${newCid}`);
    } catch (err: any) {
      console.error("Single upload error:", err);
      setUploading(false);
      setUploadStatus("");
      setStatus(
        "❌ Failed to upload to IPFS via Lighthouse. " +
          (err?.message || "")
      );
    }
  }

  // 🔹 Issue single certificate
  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");

    const trimmedName = name.trim();
    const trimmedCourse = course.trim();
    const trimmedClass = className.trim();
    const trimmedCid = cid.trim();
    const trimmedWallet = studentWallet.trim();

    if (!trimmedName) {
      setStatus("❗ Please enter student name.");
      return;
    }
    if (!trimmedCourse) {
      setStatus("❗ Please enter course.");
      return;
    }
    if (!trimmedCid) {
      setStatus("❗ Please upload the certificate image (CID is empty).");
      return;
    }

    // 🔒 IMPORTANT: block duplicate CID here
    if (cidExists(trimmedCid)) {
      setStatus(
        "❗ A certificate with this CID already exists in the local database. You cannot issue another certificate on the same CID."
      );
      return;
    }

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
      setStatus("⏳ Connecting to MetaMask & resolving contract...");
      const cert = await resolveCertificate();

      setStatus("⏳ Sending transaction to addCertificate...");
      // NOTE: adjust function name if your contract uses a different name
      const tx = await cert.addCertificate(
        trimmedName,
        trimmedCourse,
        trimmedClass || "",
        trimmedCid,
        issuedTo
      );

      setStatus("⏳ Waiting for confirmations...");
      const receipt = await tx.wait();
      const nowSec = Math.floor(Date.now() / 1000);

      // Save to local DB (Admin – Issued)
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

      setStatus(
        `✅ Certificate issued!\nCID: ${trimmedCid}\nTx: ${receipt.hash}`
      );
      // Optional: clear fields
      // setName(""); setCourse(""); setClassName(""); setStudentWallet(""); setCid(""); setUploadStatus("");
    } catch (err: any) {
      console.error("Issue single certificate error:", err);
      setStatus(
        "❌ Failed to issue certificate. " + (err?.message || "")
      );
    } finally {
      setIssuing(false);
    }
  }

  const previewUrl = cid ? filebaseGatewayUrl(cid) : "";

  return (
    <section style={{ padding: "1.5rem 0" }}>
      <h2>Teacher – Single Certificate</h2>

      <form onSubmit={handleIssue} style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label>
            Student Name
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ali Ahmed"
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>
            Course
            <br />
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Web3 Basics"
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>
            Class (optional)
            <br />
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. BSSE-6B"
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>
            Student Wallet (optional)
            <br />
            <input
              type="text"
              value={studentWallet}
              onChange={(e) => setStudentWallet(e.target.value)}
              placeholder="0x..."
              style={{ width: "100%" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <label>
            Certificate Image (Lighthouse IPFS)
            <br />
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading || issuing}
            />
          </label>
          {uploadStatus && (
            <div style={{ marginTop: "0.25rem" }}>{uploadStatus}</div>
          )}
          {previewUrl && (
            <div style={{ marginTop: "0.5rem" }}>
              <a href={previewUrl} target="_blank" rel="noreferrer">
                Preview Image
              </a>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={issuing || uploading}
          style={{ padding: "0.75rem 1.5rem", cursor: "pointer" }}
        >
          {issuing ? "Issuing..." : "Issue Certificate"}
        </button>
      </form>

      {status && (
        <pre
          style={{
            marginTop: "1rem",
            whiteSpace: "pre-wrap",
            padding: "0.75rem",
            background: "#f8f8f8",
            borderRadius: "8px",
          }}
        >
          {status}
        </pre>
      )}
    </section>
  );
}
