// src/libs/emailService.js
// Uses EmailJS — free, no backend needed
// npm install @emailjs/browser

// ─── YOUR EMAILJS CREDENTIALS ────────────────────────────────────────────────
// Get these from https://www.emailjs.com → Account → API Keys
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
  imageDataUrl,   // base64 image of certificate
  verifyUrl,
}) {
  const emailjs = (await import("@emailjs/browser")).default;

  // Build explorer URL
  const explorerUrl = txHash
    ? `https://amoy.polygonscan.com/tx/${txHash}`
    : "";

  // Template parameters — match these with your EmailJS template variables
  const templateParams = {
    to_email:       toEmail,
    to_name:        toName,
    competition:    competition,
    cid:            cid,
    verify_url:     verifyUrl,
    explorer_url:   explorerUrl,
    tx_hash:        txHash || "N/A",
    image_url:      `https://gateway.pinata.cloud/ipfs/${cid}`,
    issued_date:    new Date().toLocaleDateString("en-GB", {
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

// ─── Send bulk emails with delay to avoid rate limiting ──────────────────────
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
        toEmail:      rec.email,
        toName:       rec.name,
        competition:  rec.competition || rec.course,
        cid:          rec.cid,
        txHash:       rec.txHash,
        verifyUrl:    `${window.location.origin}?tab=verify&cid=${rec.cid}`,
      });

      results.push({ ...rec, emailStatus: "sent" });
      if (onProgress) onProgress(i + 1, recipients.length, "sent", rec.name);

      // Wait 1 second between emails to avoid rate limiting (EmailJS free = 200/month)
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