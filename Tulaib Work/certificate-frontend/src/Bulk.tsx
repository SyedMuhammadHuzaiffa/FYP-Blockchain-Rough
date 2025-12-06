// src/Bulk.tsx
// Teacher – Bulk Certificates
// Uses a single blockchain transaction via Certificate.addCertificates(...)

import React, { useState } from "react";
import { ethers } from "ethers";
import { uploadToIpfsFilebase, filebaseGatewayUrl } from "./ipfsClient";
import { resolveCertificate } from "./ethers-client";
import { cidExists, pushIssued } from "./libs/store";

type BulkRow = {
  id: number;
  name: string;
  course: string;
  className: string;
  wallet: string;
  cid: string;
  uploading: boolean;
  uploadStatus: string;
  error: string;
};

const makeEmptyRow = (id: number): BulkRow => ({
  id,
  name: "",
  course: "",
  className: "",
  wallet: "",
  cid: "",
  uploading: false,
  uploadStatus: "",
  error: "",
});

const Bulk: React.FC = () => {
  const [rows, setRows] = useState<BulkRow[]>([makeEmptyRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [rowsCountInput, setRowsCountInput] = useState("1");
  const [status, setStatus] = useState("");

  function updateRow(id: number, patch: Partial<BulkRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextId)]);
    setNextId((id) => id + 1);
  }

  function removeRow(id: number) {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((r) => r.id !== id);
    });
  }

  // Generate N rows; increasing keeps data, decreasing trims
  function handleGenerateRows() {
    setStatus("");
    const num = parseInt(rowsCountInput, 10);

    if (isNaN(num) || num <= 0) {
      setStatus("❗ Please enter a valid number of certificates (1 or more).");
      return;
    }
    if (num > 500) {
      setStatus(
        "❗ For safety, maximum 500 rows at once. Please enter 500 or less."
      );
      return;
    }

    if (num <= rows.length) {
      const trimmed = rows.slice(0, num);
      setRows(trimmed);
      return;
    }

    const newRows: BulkRow[] = [...rows];
    let currentNextId = nextId;
    for (let i = rows.length; i < num; i++) {
      newRows.push(makeEmptyRow(currentNextId));
      currentNextId++;
    }
    setRows(newRows);
    setNextId(currentNextId);
  }

  // Upload one file to Lighthouse and set CID in that row
  async function handleFileChange(id: number, file: File | null) {
    if (!file) return;

    updateRow(id, {
      uploading: true,
      uploadStatus: "Uploading to IPFS via Lighthouse...",
      error: "",
    });

    try {
      const cid = await uploadToIpfsFilebase(file);

      const existsInDb = cidExists(cid);
      const existsInRows = rows.some(
        (r) => r.id !== id && r.cid === cid
      );

      if (existsInDb || existsInRows) {
        updateRow(id, {
          uploading: false,
          uploadStatus: "",
          cid: "",
          error:
            "❗ This image/CID already exists in database or in another row. Duplicate certificate is not allowed.",
        });
        return;
      }

      updateRow(id, {
        cid,
        uploading: false,
        uploadStatus: `Uploaded ✅ CID: ${cid}`,
        error: "",
      });
    } catch (err: any) {
      console.error("Bulk row upload error:", err);
      updateRow(id, {
        uploading: false,
        uploadStatus: "",
        error:
          err?.message || "Failed to upload file to IPFS. Please try again.",
      });
    }
  }

  // Issue ALL valid rows in ONE transaction using addCertificates(...)
  async function handleIssueAll() {
    setStatus("");

    // Rows with required fields
    const filledRows = rows.filter(
      (r) => r.name.trim() && r.course.trim() && r.cid.trim()
    );

    if (filledRows.length === 0) {
      setStatus(
        "Please fill at least one row and upload the certificate image (CID)."
      );
      return;
    }

    // Build arrays for smart contract + track which rows are included
    const studentNames: string[] = [];
    const courses: string[] = [];
    const classNames: string[] = [];
    const cids: string[] = [];
    const issuedTos: string[] = [];
    const rowsForTx: BulkRow[] = [];

    for (const row of filledRows) {
      const trimmedCid = row.cid.trim();

      // prevent duplicates in local DB
      if (cidExists(trimmedCid)) {
        updateRow(row.id, {
          error:
            "❗ This CID is already recorded in local database. Skipping this row.",
        });
        continue;
      }

      let issuedTo = ethers.ZeroAddress;
      const trimmedWallet = row.wallet.trim();

      if (trimmedWallet) {
        if (!ethers.isAddress(trimmedWallet)) {
          updateRow(row.id, {
            error: "❗ Invalid wallet address. Skipping this row.",
          });
          continue;
        }
        issuedTo = trimmedWallet;
      }

      rowsForTx.push(row);
      studentNames.push(row.name.trim());
      courses.push(row.course.trim());
      classNames.push(row.className.trim() || "");
      cids.push(trimmedCid);
      issuedTos.push(issuedTo);
    }

    if (rowsForTx.length === 0) {
      setStatus(
        "No valid rows to issue (all had invalid wallets or duplicate CIDs)."
      );
      return;
    }

    try {
      setStatus("⏳ Connecting to MetaMask & resolving contract...");
      const cert = await resolveCertificate();

      // ONE transaction: addCertificates(...)
      setStatus(
        `⏳ Sending 1 transaction for ${rowsForTx.length} certificates...`
      );

      const tx = await cert.addCertificates(
        studentNames,
        courses,
        classNames,
        cids,
        issuedTos
      );

      setStatus("⏳ Waiting for confirmations...");
      const receipt = await tx.wait();
      const issuedAt = Math.floor(Date.now() / 1000);

      // After confirmation: update each row + push to local store
      for (const row of rowsForTx) {
        const trimmedCid = row.cid.trim();
        pushIssued({
          cid: trimmedCid,
          name: row.name.trim(),
          course: row.course.trim(),
          className: row.className.trim() || "",
          imageCid: trimmedCid,
          txHash: receipt.hash,
          issuedAt,
          revoked: false,
        });

        updateRow(row.id, {
          uploadStatus: `✅ Issued in bulk tx: ${receipt.hash.slice(0, 10)}...`,
          error: "",
        });
      }

      setStatus(
        `✅ Issued ${rowsForTx.length} certificates in ONE transaction. Check the 'Admin – Issued' tab.`
      );
    } catch (err: any) {
      console.error("Bulk issue error:", err);
      setStatus(
        err?.message ||
          "Failed to issue bulk certificates. Please check wallet, network, and contract addCertificates(...) function."
      );
    }
  }

  return (
    <section style={{ padding: "1.5rem 0" }}>
      <h2>Teacher – Bulk Certificates</h2>
      <p style={{ marginBottom: "1rem" }}>
        Fill multiple rows, upload certificate images, then issue them all in one go
        using a single blockchain transaction.
      </p>

      {/* Controls: how many rows */}
      <div
        style={{
          marginBottom: "1rem",
          padding: "0.75rem",
          borderRadius: "8px",
          border: "1px solid #ddd",
          maxWidth: 500,
        }}
      >
        <label>
          Number of certificates (rows):
          <input
            type="number"
            min={1}
            max={500}
            value={rowsCountInput}
            onChange={(e) => setRowsCountInput(e.target.value)}
            style={{ marginLeft: "0.5rem", width: "80px" }}
          />
        </label>
        <button
          type="button"
          onClick={handleGenerateRows}
          style={{ marginLeft: "0.75rem", padding: "0.35rem 0.75rem" }}
        >
          Generate Rows
        </button>
        <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
          Example: enter <b>20</b> or <b>300</b> to create that many rows.
          Increasing the number keeps existing data.
        </div>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "1rem",
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Student</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Course</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Class</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>
              Student Wallet (optional)
            </th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>
              Certificate Image
            </th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>CID</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const previewUrl = row.cid ? filebaseGatewayUrl(row.cid) : "";

            return (
              <tr key={row.id}>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      updateRow(row.id, { name: e.target.value })
                    }
                    placeholder="Student name"
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={row.course}
                    onChange={(e) =>
                      updateRow(row.id, { course: e.target.value })
                    }
                    placeholder="Course"
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={row.className}
                    onChange={(e) =>
                      updateRow(row.id, { className: e.target.value })
                    }
                    placeholder="Class (optional)"
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={row.wallet}
                    onChange={(e) =>
                      updateRow(row.id, { wallet: e.target.value })
                    }
                    placeholder="0x... (optional)"
                  />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleFileChange(row.id, e.target.files?.[0] || null)
                    }
                    disabled={row.uploading}
                  />
                  {previewUrl && (
                    <div style={{ marginTop: "0.25rem" }}>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                    </div>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input
                    type="text"
                    value={row.cid}
                    readOnly
                    placeholder="CID will appear after upload"
                    style={{ width: "100%" }}
                  />
                </td>
                <td style={{ padding: "0.5rem", fontSize: "0.85rem" }}>
                  {row.uploadStatus && (
                    <div style={{ marginBottom: "0.25rem" }}>
                      {row.uploadStatus}
                    </div>
                  )}
                  {row.error && (
                    <div style={{ color: "red" }}>{row.error}</div>
                  )}
                </td>
                <td style={{ padding: "0.5rem", textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    style={{ cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={addRow}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          + Add Row
        </button>

        <button
          type="button"
          onClick={handleIssueAll}
          style={{ padding: "0.75rem 1.5rem", cursor: "pointer" }}
        >
          Issue All Certificates (1 Tx)
        </button>
      </div>

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
};

export default Bulk;
