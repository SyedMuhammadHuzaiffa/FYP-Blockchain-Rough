// src/libs/emailService.js
// Uses EmailJS — free, no backend needed
// npm install @emailjs/browser

// ─── YOUR EMAILJS CREDENTIALS ────────────────────────────────────────────────
export const EMAILJS_CONFIG = {
  SERVICE_ID:  "service_ks4tobq",   // e.g. "service_abc123"
  TEMPLATE_ID: "template_6wr17ai",  // e.g. "template_xyz789"
  PUBLIC_KEY:  "fN_qtKPhhwjcTEFgn",   // e.g. "user_AbCdEfGhIj"
};

// ─── Send one certificate email ───────────────────────────────────────────────
export async function sendCertificateEmail({
  toEmail,
  toName,
  competition,
  cid,
  txHash,
}) {
  const emailjs = (await import("@emailjs/browser")).default;

  const origin = window.location.origin;

  // ✅ Full clickable verify URL with encoded CID — never gets truncated
  const verifyUrl   = `${origin}?tab=verify&cid=${encodeURIComponent(cid)}`;
  const explorerUrl = txHash ? `https://amoy.polygonscan.com/tx/${txHash}` : "";
  const imageUrl    = `https://gateway.pinata.cloud/ipfs/${cid}`;

  const templateParams = {
    to_email:      toEmail,
    to_name:       toName,
    competition:   competition,
    // ✅ Send full clickable URL — student just clicks, no copying needed
    verify_url:    verifyUrl,
    explorer_url:  explorerUrl,
    image_url:     imageUrl,
    // ✅ Also send short CID for display — but student should CLICK not copy
    cid_short:     cid.slice(0, 20) + "...",
    cid_full:      cid,
    tx_hash:       txHash ? txHash.slice(0, 20) + "..." : "N/A",
    issued_date:   new Date().toLocaleDateString("en-GB", {
      day: "2-digit", month: "long", year: "numeric"
    }),
  };

  const response = await emailjs.send(
    EMAILJS_CONFIG.SERVICE_ID,
    EMAILJS_CONFIG.TEMPLATE_ID,
    templateParams,
    EMAILJS_CONFIG.PUBLIC_KEY
  );

  return response;
}

// ─── Send bulk emails ─────────────────────────────────────────────────────────
export async function sendBulkEmails(recipients, onProgress) {
  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const rec = recipients[i];

    if (!rec.email || !rec.email.includes("@")) {
      results.push({ ...rec, emailStatus: "skipped", reason: "No valid email" });
      if (onProgress) onProgress(i + 1, recipients.length, "skipped", rec.name);
      continue;
    }

    try {
      if (onProgress) onProgress(i + 1, recipients.length, "sending", rec.name);

      await sendCertificateEmail({
        toEmail:     rec.email,
        toName:      rec.name,
        competition: rec.competition || rec.course,
        cid:         rec.cid,
        txHash:      rec.txHash,
      });

      results.push({ ...rec, emailStatus: "sent" });
      if (onProgress) onProgress(i + 1, recipients.length, "sent", rec.name);

      // 1.2 second delay between emails — EmailJS free = 200/month limit
      if (i < recipients.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }

    } catch (err) {
      const msg = err?.text || err?.message || String(err);
      results.push({ ...rec, emailStatus: "failed", reason: msg });
      if (onProgress) onProgress(i + 1, recipients.length, "failed", rec.name);
    }
  }

  return results;
}