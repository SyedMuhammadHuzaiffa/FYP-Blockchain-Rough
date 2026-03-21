// src/EmailSender.jsx
// Send certificates to participants via email after issuance
// npm install @emailjs/browser

import React, { useState } from "react";
import { sendBulkEmails, EMAILJS_CONFIG } from "./emailService";
import { getIssued } from "./libs/store";

// ─── Single email row in the send list ───────────────────────────────────────
function RecipientRow({ rec, status }) {
  const statusMap = {
    pending: { icon: "⏳", color: "#64748b", bg: "#f8fafc", label: "Pending" },
    sending: { icon: "📤", color: "#1d4ed8", bg: "#eff6ff", label: "Sending..." },
    sent:    { icon: "✅", color: "#15803d", bg: "#f0fdf4", label: "Sent!" },
    failed:  { icon: "❌", color: "#b91c1c", bg: "#fef2f2", label: "Failed" },
    skipped: { icon: "⏭",  color: "#92400e", bg: "#fefce8", label: "No Email" },
  };
  const s = statusMap[status?.emailStatus || "pending"];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 8,
      background: s.bg, border: "1px solid #e2e8f0",
      marginBottom: 6,
    }}>
      <span style={{ fontSize: 18 }}>{s.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{rec.name}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{rec.course || rec.competition}</div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>{rec.email || "No email"}</div>
        {status?.reason && (
          <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 2 }}>{status.reason}</div>
        )}
      </div>
      <span style={{
        fontSize: 11, padding: "2px 8px", borderRadius: 100,
        fontWeight: 700, color: s.color,
        border: `1px solid ${s.color}33`, background: "#fff",
      }}>
        {s.label}
      </span>
    </div>
  );
}

// ─── Setup check component ────────────────────────────────────────────────────
function SetupCheck() {
  const isConfigured =
    EMAILJS_CONFIG.SERVICE_ID  !== "YOUR_SERVICE_ID" &&
    EMAILJS_CONFIG.TEMPLATE_ID !== "YOUR_TEMPLATE_ID" &&
    EMAILJS_CONFIG.PUBLIC_KEY  !== "YOUR_PUBLIC_KEY";

  if (isConfigured) return null;

  return (
    <div style={{
      padding: "16px 20px", background: "#fefce8",
      border: "2px solid #fcd34d", borderRadius: 12, marginBottom: 20,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#92400e", marginBottom: 10 }}>
        ⚠️ EmailJS Not Configured Yet
      </div>
      <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8 }}>
        Follow these steps to set up email sending:
        <br /><br />
        <strong>Step 1 —</strong> Go to{" "}
        <a href="https://www.emailjs.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
          emailjs.com
        </a>{" "}
        → Sign up for free
        <br />
        <strong>Step 2 —</strong> Add Email Service (Gmail recommended) → copy <code style={code}>Service ID</code>
        <br />
        <strong>Step 3 —</strong> Create Email Template (see template below) → copy <code style={code}>Template ID</code>
        <br />
        <strong>Step 4 —</strong> Go to Account → API Keys → copy <code style={code}>Public Key</code>
        <br />
        <strong>Step 5 —</strong> Paste all 3 in <code style={code}>src/libs/emailService.js</code>
      </div>

      {/* Email template guide */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
          📧 EmailJS Template (copy this exactly):
        </div>
        <div style={{
          background: "#fff", border: "1px solid #fde68a",
          borderRadius: 8, padding: "12px 16px",
          fontFamily: "monospace", fontSize: 12,
          color: "#334155", lineHeight: 1.8,
          whiteSpace: "pre-wrap",
        }}>
{`Subject: Your Certificate for {{competition}}

Dear {{to_name}},

Congratulations! Your certificate has been issued on the blockchain.

🏆 Competition: {{competition}}
📅 Issued On: {{issued_date}}

🔍 Verify your certificate:
{{verify_url}}

🔗 View on blockchain:
{{explorer_url}}

📋 Certificate ID:
{{cid}}

Your certificate image is available at:
{{image_url}}

Regards,
Blockchain Certificate System`}
        </div>
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 8 }}>
          ⚠️ In EmailJS template editor, set <strong>To Email</strong> field to: <code style={code}>{"{{to_email}}"}</code>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EMAIL SENDER COMPONENT ──────────────────────────────────────────────
export default function EmailSender({ certificates, onClose }) {
  // certificates = array of {name, email, course/competition, cid, txHash}
  const [sending, setSending]   = useState(false);
  const [statuses, setStatuses] = useState({});
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [done, setDone]         = useState(false);
  const [summary, setSummary]   = useState(null);

  // Filter to only those with email
  const withEmail    = certificates.filter(c => c.email && c.email.includes("@"));
  const withoutEmail = certificates.filter(c => !c.email || !c.email.includes("@"));

  async function handleSendAll() {
    setSending(true);
    setDone(false);
    setStatuses({});
    setProgress({ current: 0, total: withEmail.length });

    const results = await sendBulkEmails(
      certificates,
      (current, total, status, name) => {
        setProgress({ current, total });
        setStatuses(prev => ({
          ...prev,
          [name]: { emailStatus: status }
        }));
      }
    );

    const sent    = results.filter(r => r.emailStatus === "sent").length;
    const failed  = results.filter(r => r.emailStatus === "failed").length;
    const skipped = results.filter(r => r.emailStatus === "skipped").length;

    setSummary({ sent, failed, skipped });
    setDone(true);
    setSending(false);
  }

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex",
      alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(3px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "min(600px, 95vw)",
        maxHeight: "90vh",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 24px", borderBottom: "1px solid #f1f5f9",
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>
              📧 Send Certificates via Email
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {withEmail.length} recipients with email · {withoutEmail.length} without
            </div>
          </div>
          {!sending && (
            <button onClick={onClose} style={{
              background: "#f1f5f9", border: "none", borderRadius: 7,
              color: "#64748b", cursor: "pointer", width: 30, height: 30,
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          <SetupCheck />

          {/* Progress bar */}
          {(sending || done) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 13, fontWeight: 600, marginBottom: 6,
                color: done ? "#15803d" : "#1d4ed8",
              }}>
                <span>{done ? "✅ Complete!" : `📤 Sending ${progress.current}/${progress.total}...`}</span>
                {summary && (
                  <span>
                    ✅ {summary.sent} sent · ❌ {summary.failed} failed · ⏭ {summary.skipped} skipped
                  </span>
                )}
              </div>
              <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${progress.total > 0 ? (progress.current / progress.total * 100) : 0}%`,
                  background: done ? "#22c55e" : "#3b82f6",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* Recipients */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
              Recipients ({certificates.length}):
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {certificates.map((rec, i) => (
                <RecipientRow
                  key={rec.cid || i}
                  rec={rec}
                  status={statuses[rec.name]}
                />
              ))}
            </div>
          </div>

          {/* Warning about no email */}
          {withoutEmail.length > 0 && (
            <div style={{
              padding: "10px 14px", background: "#fefce8",
              border: "1px solid #fde68a", borderRadius: 8,
              fontSize: 12, color: "#92400e", marginBottom: 12,
            }}>
              ⚠️ {withoutEmail.length} participant{withoutEmail.length !== 1 ? "s" : ""} have no email address and will be skipped.
            </div>
          )}

          {/* Success message */}
          {done && summary?.sent > 0 && (
            <div style={{
              padding: "14px 16px", background: "#f0fdf4",
              border: "1px solid #bbf7d0", borderRadius: 10,
              fontSize: 14, color: "#15803d", fontWeight: 600,
            }}>
              🎉 {summary.sent} certificate{summary.sent !== 1 ? "s" : ""} emailed successfully!
              Each participant received their certificate link and QR code.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px", borderTop: "1px solid #f1f5f9",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          {!sending && !done && (
            <>
              <button onClick={onClose} style={{
                padding: "9px 18px", background: "#f1f5f9",
                border: "1px solid #e2e8f0", borderRadius: 8,
                color: "#475569", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>
                Cancel
              </button>
              <button
                onClick={handleSendAll}
                disabled={withEmail.length === 0}
                style={{
                  padding: "9px 22px",
                  background: withEmail.length === 0 ? "#e2e8f0" : "linear-gradient(135deg,#1e3a5f,#2563eb)",
                  border: "none", borderRadius: 8, color: "#fff",
                  fontWeight: 700, fontSize: 14,
                  cursor: withEmail.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                📧 Send to {withEmail.length} Recipients
              </button>
            </>
          )}
          {done && (
            <button onClick={onClose} style={{
              padding: "9px 22px", background: "#15803d",
              border: "none", borderRadius: 8, color: "#fff",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              Done ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const code = {
  background: "#f1f5f9", padding: "1px 5px",
  borderRadius: 4, fontFamily: "monospace", fontSize: 11,
};