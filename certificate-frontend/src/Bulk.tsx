import React, { useState } from "react";
import { ethers } from "ethers";
import { resolveCertificate } from "./ethers-client";
import { pushIssued } from "./libs/store";

type Row = {
  name: string;
  course: string;
  className: string;
  cid: string;
};

const makeEmptyRow = (): Row => ({
  name: "",
  course: "",
  className: "",
  cid: "",
});

export default function Bulk() {
  const [count, setCount] = useState(1);
  const [rows, setRows] = useState<Row[]>([makeEmptyRow()]);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"none" | "info" | "success" | "error">("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When teacher changes "number of certificates"
  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value || "", 10);
    const safe = Math.min(Math.max(value, 0), 5000); // between 1 and 50

    setCount(safe);

    setRows((prev) => {
      const copy = [...prev];
      if (safe > copy.length) {
        // add rows
        for (let i = copy.length; i < safe; i++) {
          copy.push(makeEmptyRow());
        }
      } else if (safe < copy.length) {
        // remove extra
        copy.length = safe;
      }
      return copy;
    });
  };

  const handleRowChange = (
    index: number,
    field: keyof Row,
    value: string
  ) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleIssue = async () => {
    setStatus("");
    setStatusType("none");

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name || !r.course || !r.cid) {
        setStatus(
          `Row ${i + 1} is missing required fields. Please fill Student, Course and CID.`
        );
        setStatusType("error");
        return;
      }
    }

    const names: string[] = [];
    const courses: string[] = [];
    const classes: string[] = [];
    const cids: string[] = [];
    const wallets: string[] = []; // all ZeroAddress (no wallet binding)

    for (const r of rows) {
      names.push(r.name);
      courses.push(r.course);
      classes.push(r.className || "");
      cids.push(r.cid);
      wallets.push(ethers.ZeroAddress);
    }

    try {
      setIsSubmitting(true);
      setStatusType("info");
      setStatus(`Connecting to MetaMask and issuing ${cids.length} certificates...`);

      const cert = await resolveCertificate();

      const tx = await cert.addCertificates(names, courses, classes, cids, wallets);

      setStatusType("info");
      setStatus("Waiting for blockchain confirmation...");

      const receipt = await tx.wait();

      const nowSec = Math.floor(Date.now() / 1000);

      // Save each issued cert into Admin – Issued (local)
      for (let i = 0; i < cids.length; i++) {
        pushIssued({
          cid: cids[i],
          name: names[i],
          course: courses[i],
          className: classes[i] || "",
          imageCid: cids[i],
          txHash: receipt.hash,
          issuedAt: nowSec,
          revoked: false,
        });
      }

      setStatusType("success");
      setStatus(
        `Successfully issued ${cids.length} certificates. Tx: ${receipt.hash}`
      );

      // Reset rows but keep the same count
      setRows(Array.from({ length: count }, () => makeEmptyRow()));
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatus("Error issuing bulk certificates. Please check console / MetaMask.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusColor =
    statusType === "success"
      ? "green"
      : statusType === "error"
      ? "red"
      : statusType === "info"
      ? "#444"
      : "inherit";

  return (
    <div>
      <h2>Teacher – Bulk Certificates</h2>
      <p>Fill the table below to issue multiple certificates in one transaction.</p>

      {/* Number of certificates */}
      <div style={{ marginTop: "10px", marginBottom: "10px" }}>
        <label>
          Number of certificates:&nbsp;
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={handleCountChange}
            style={{ width: "80px" }}
          />
        </label>
      </div>

      {/* Editable table */}
      <table
        style={{
          borderCollapse: "collapse",
          minWidth: "700px",
          fontSize: "14px",
        }}
      >
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #ccc", padding: "4px 8px" }}>#</th>
            <th style={{ borderBottom: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}>
              Student Name
            </th>
            <th style={{ borderBottom: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}>
              Course
            </th>
            <th style={{ borderBottom: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}>
              Class / Batch (optional)
            </th>
            <th style={{ borderBottom: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}>
              CID
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "4px 8px",
                  textAlign: "center",
                }}
              >
                {idx + 1}
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                <input
                  style={{ width: "100%" }}
                  value={r.name}
                  onChange={(e) => handleRowChange(idx, "name", e.target.value)}
                  placeholder="Ali Raza"
                />
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                <input
                  style={{ width: "100%" }}
                  value={r.course}
                  onChange={(e) => handleRowChange(idx, "course", e.target.value)}
                  placeholder="Blockchain Fundamentals"
                />
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                <input
                  style={{ width: "100%" }}
                  value={r.className}
                  onChange={(e) => handleRowChange(idx, "className", e.target.value)}
                  placeholder="BSCS-8A (optional)"
                />
              </td>
              <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px" }}>
                <input
                  style={{ width: "100%" }}
                  value={r.cid}
                  onChange={(e) => handleRowChange(idx, "cid", e.target.value)}
                  placeholder="Qm... or bafy..."
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        style={{
          marginTop: "16px",
          padding: "8px 20px",
          background: isSubmitting ? "#555" : "black",
          color: "white",
          borderRadius: "8px",
          cursor: isSubmitting ? "not-allowed" : "pointer",
        }}
        onClick={handleIssue}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Issuing..." : "Issue All"}
      </button>

      {status && (
        <div
          style={{
            marginTop: "16px",
            padding: "10px",
            background: "#f8f8f8",
            borderRadius: "8px",
            color: statusColor,
            whiteSpace: "pre-wrap",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
