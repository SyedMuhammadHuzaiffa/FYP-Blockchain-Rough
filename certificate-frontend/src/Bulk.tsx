// src/Bulk.tsx
import React, { useState } from "react";
import { uploadToIpfsFilebase } from "./ipfsClient";
import { getContract, GAS_SETTINGS } from "./ethers-client";
import { cidExists, pushIssued } from "./libs/store";

type BulkRow = {
  id: number; name: string; course: string;
  className: string; cid: string;
  uploading: boolean; uploadStatus: string; error: string;
};

const makeEmptyRow = (id: number): BulkRow => ({
  id, name: "", course: "", className: "",
  cid: "", uploading: false, uploadStatus: "", error: "",
});

export default function Bulk() {
  const [rows, setRows] = useState<BulkRow[]>([makeEmptyRow(1)]);
  const [nextId, setNextId] = useState(2);
  const [rowsCountInput, setRowsCountInput] = useState("1");
  const [status, setStatus] = useState("");

  function updateRow(id: number, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(nextId)]);
    setNextId((id) => id + 1);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((r) => r.id !== id));
  }

  function handleGenerateRows() {
    setStatus("");
    const num = parseInt(rowsCountInput, 10);
    if (isNaN(num) || num <= 0) { setStatus("Please enter a valid number."); return; }
    if (num > 500) { setStatus("Maximum 500 rows."); return; }
    if (num <= rows.length) { setRows(rows.slice(0, num)); return; }
    const newRows: BulkRow[] = [...rows];
    let id = nextId;
    for (let i = rows.length; i < num; i++) { newRows.push(makeEmptyRow(id++)); }
    setRows(newRows);
    setNextId(id);
  }

  async function handleFileChange(id: number, file: File | null) {
    if (!file) return;
    updateRow(id, { uploading: true, uploadStatus: "Uploading to IPFS...", error: "" });
    try {
      const cid = await uploadToIpfsFilebase(file);
      if (cidExists(cid) || rows.some((r) => r.id !== id && r.cid === cid)) {
        updateRow(id, { uploading: false, uploadStatus: "", cid: "", error: "Duplicate CID not allowed." });
        return;
      }
      updateRow(id, { cid, uploading: false, uploadStatus: "Uploaded: " + cid.slice(0, 20) + "...", error: "" });
    } catch (err: any) {
      updateRow(id, { uploading: false, uploadStatus: "", error: err?.message || "Upload failed." });
    }
  }

  async function handleIssueAll() {
    setStatus("");
    const filledRows = rows.filter((r) => r.name.trim() && r.course.trim() && r.cid.trim());
    if (!filledRows.length) {
      setStatus("Please fill at least one row with name, course and upload image.");
      return;
    }

    const cids: string[] = [];
    const names: string[] = [];
    const courses: string[] = [];
    const rowsForTx: BulkRow[] = [];

    for (const row of filledRows) {
      const cid = row.cid.trim();
      if (cidExists(cid)) {
        updateRow(row.id, { error: "Duplicate CID — skipping." });
        continue;
      }
      rowsForTx.push(row);
      cids.push(cid);
      names.push(row.name.trim());
      courses.push(row.course.trim());
    }

    if (!rowsForTx.length) {
      setStatus("No valid rows to issue.");
      return;
    }

    try {
      setStatus("Connecting to MetaMask...");
      const cert = await getContract();
      setStatus("Sending 1 transaction for " + String(rowsForTx.length) + " certificates...");



      
      const tx = await cert.issueBulk(cids, names, courses, GAS_SETTINGS);

      setStatus("Waiting for blockchain confirmation...");
      const receipt = await tx.wait();
      const issuedAt = Math.floor(Date.now() / 1000);

      for (const row of rowsForTx) {
        pushIssued({
          cid: row.cid.trim(),
          name: row.name.trim(),
          course: row.course.trim(),
          className: row.className.trim() || "",
          imageCid: row.cid.trim(),
          txHash: receipt.hash,
          issuedAt,
          revoked: false,
        });
        updateRow(row.id, {
          uploadStatus: "Issued! TX: " + receipt.hash.slice(0, 10) + "...",
          error: "",
        });
      }
      setStatus("Issued " + String(rowsForTx.length) + " certificates in ONE transaction! Check Admin-Issued tab.");
    } catch (err: any) {
      setStatus("Failed: " + (err?.message || "Unknown error"));
    }
  }

  return (
    <section style={{ padding: "1.5rem 0" }}>
      <h2>Teacher - Bulk Certificates</h2>
      <p style={{ marginBottom: "1rem" }}>Fill rows, upload images, issue all in one transaction.</p>

      <div style={{ marginBottom: "1rem", padding: "0.75rem", borderRadius: "8px", border: "1px solid #ddd", maxWidth: 500 }}>
        <label>
          Number of rows:
          <input
            type="number" min={1} max={500} value={rowsCountInput}
            onChange={(e) => setRowsCountInput(e.target.value)}
            style={{ marginLeft: "0.5rem", width: "80px" }}
          />
        </label>
        <button type="button" onClick={handleGenerateRows}
          style={{ marginLeft: "0.75rem", padding: "0.35rem 0.75rem" }}>
          Generate Rows
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr>
              {["Student", "Course", "Class", "Certificate Image", "CID", "Status", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #e2e8f0", fontSize: 13 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: "0.5rem" }}>
                  <input type="text" value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="Name" />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input type="text" value={row.course}
                    onChange={(e) => updateRow(row.id, { course: e.target.value })}
                    placeholder="Course / Competition" />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input type="text" value={row.className}
                    onChange={(e) => updateRow(row.id, { className: e.target.value })}
                    placeholder="Optional" style={{ width: 80 }} />
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <input type="file" accept="image/*"
                    onChange={(e) => handleFileChange(row.id, e.target.files?.[0] || null)}
                    disabled={row.uploading} />
                </td>
                <td style={{ padding: "0.5rem", fontSize: 11, fontFamily: "monospace" }}>
                  {row.cid ? row.cid.slice(0, 16) + "..." : "-"}
                </td>
                <td style={{ padding: "0.5rem", fontSize: 12 }}>
                  {row.uploadStatus && <div style={{ color: "#15803d" }}>{row.uploadStatus}</div>}
                  {row.error && <div style={{ color: "red" }}>{row.error}</div>}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <button type="button" onClick={() => removeRow(row.id)}>X</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button type="button" onClick={addRow}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
          + Add Row
        </button>
        <button type="button" onClick={handleIssueAll}
          style={{ padding: "0.75rem 1.5rem", cursor: "pointer", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700 }}>
          Issue All (1 TX)
        </button>
      </div>

      {status && (
        <pre style={{
          marginTop: "1rem", whiteSpace: "pre-wrap", padding: "0.75rem",
          background: status.startsWith("Issued") ? "#f0fdf4" : status.startsWith("Failed") ? "#fef2f2" : "#f8fafc",
          borderRadius: "8px", fontSize: 14,
        }}>
          {status}
        </pre>
      )}
    </section>
  );
}