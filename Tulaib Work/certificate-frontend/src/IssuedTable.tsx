// src/IssuedTable.tsx
import React, { useEffect, useState } from "react";
import {
  getIssued,
  IssuedRecord,
  setRevoked,
  removeIssuedByCid,
  clearIssued,
} from "./libs/store";
import { filebaseGatewayUrl } from "./ipfsClient";

const IssuedTable: React.FC = () => {
  const [list, setList] = useState<IssuedRecord[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setList(getIssued());
  }, []);

  function refresh() {
    setList(getIssued());
  }

  function handleRevokeToggle(rec: IssuedRecord) {
    setRevoked(rec.cid, !rec.revoked);
    refresh();
  }

  function handleRemove(rec: IssuedRecord) {
    if (!window.confirm("Remove this record from local database?")) return;
    removeIssuedByCid(rec.cid);
    refresh();
  }

  function handleClearAll() {
    if (
      !window.confirm(
        "This will clear all locally stored issued certificates. Continue?"
      )
    )
      return;
    clearIssued();
    refresh();
  }

  const filtered = list.filter((rec) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      rec.name.toLowerCase().includes(q) ||
      rec.course.toLowerCase().includes(q) ||
      (rec.className || "").toLowerCase().includes(q) ||
      rec.cid.toLowerCase().includes(q)
    );
  });

  return (
    <section style={{ padding: "1.5rem 0" }}>
      <h2>Admin – Issued Certificates (Local)</h2>

      <div style={{ margin: "0.75rem 0" }}>
        <input
          type="text"
          placeholder="Search (name, course, CID...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "260px", marginRight: "0.5rem" }}
        />
        <button type="button" onClick={handleClearAll}>
          Clear All (Local)
        </button>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.9rem",
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Preview</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Student</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Course</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Class</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>CID</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Issued At</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Status</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Tx</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((rec) => {
            const ts = new Date(rec.issuedAt * 1000);
            const dateStr = ts.toLocaleString();

            // Use imageCid if present, otherwise fallback to cid
            const cidToShow = rec.imageCid || rec.cid;
            const imgUrl = cidToShow ? filebaseGatewayUrl(cidToShow) : "";

            const explorerUrl = rec.txHash
              ? `https://www.oklink.com/amoy/tx/${rec.txHash}`
              : "";

            return (
              <tr key={rec.cid}>
                <td style={{ padding: "0.5rem" }}>
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt="cert"
                      style={{
                        width: "80px",
                        height: "80px",
                        objectFit: "cover",
                        borderRadius: "4px",
                        border: "1px solid #ddd",
                      }}
                      onError={(e) => {
                        // if image fails, hide it but keep the cell
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : null}
                </td>
                <td style={{ padding: "0.5rem" }}>{rec.name}</td>
                <td style={{ padding: "0.5rem" }}>{rec.course}</td>
                <td style={{ padding: "0.5rem" }}>{rec.className || "-"}</td>
                <td style={{ padding: "0.5rem" }}>{rec.cid}</td>
                <td style={{ padding: "0.5rem" }}>{dateStr}</td>
                <td style={{ padding: "0.5rem" }}>
                  {rec.revoked ? (
                    <span style={{ color: "red" }}>Revoked</span>
                  ) : (
                    <span style={{ color: "green" }}>Active</span>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "blue" }}
                    >
                      View Tx
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => handleRevokeToggle(rec)}
                    style={{ marginRight: "0.5rem" }}
                  >
                    {rec.revoked ? "Restore" : "Revoke"}
                  </button>
                  <button type="button" onClick={() => handleRemove(rec)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: "0.75rem" }}>
                No certificates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
};

export default IssuedTable;
