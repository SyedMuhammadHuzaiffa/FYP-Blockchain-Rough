// src/libs/emailService.js
export const EMAILJS_CONFIG = {
  SERVICE_ID:  "service_ks4tobq",
  TEMPLATE_ID: "template_6wr17ai",
  PUBLIC_KEY:  "fN_qtKPhhwjcTEFgn",
};

// Builds verify URL — for Merkle certs encodes proof in ?mp= so any device can verify
export function buildVerifyUrl(cid, merkleData) {
  const base = window.location.origin + "?tab=verify&cid=" + encodeURIComponent(cid);
  if (!merkleData) return base;
  const payload = JSON.stringify({
    batchId:     merkleData.batchId,
    name:        merkleData.name,
    competition: merkleData.competition,
    proof:       merkleData.proof,
    root:        merkleData.root,
    txHash:      merkleData.txHash,
    issuedAt:    merkleData.issuedAt,
    batchDesc:   merkleData.batchDesc || "",
  });
  return base + "&mp=" + encodeURIComponent(payload);
}

export async function sendCertificateEmail({ toEmail, toName, competition, cid, txHash, merkleData }) {
  const emailjs = (await import("@emailjs/browser")).default;

  const verifyUrl   = buildVerifyUrl(cid, merkleData);
  const explorerUrl = txHash ? "https://amoy.polygonscan.com/tx/" + txHash : "";
  const imageUrl    = "https://gateway.pinata.cloud/ipfs/" + cid;

  return await emailjs.send(
    EMAILJS_CONFIG.SERVICE_ID,
    EMAILJS_CONFIG.TEMPLATE_ID,
    {
      to_email:     toEmail,
      to_name:      toName,
      competition:  competition,
      verify_url:   verifyUrl,
      explorer_url: explorerUrl,
      image_url:    imageUrl,
      cid_short:    cid.slice(0, 20) + "...",
      cid_full:     cid,
      tx_hash:      txHash ? txHash.slice(0, 20) + "..." : "N/A",
      issued_date:  new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" }),
    },
    EMAILJS_CONFIG.PUBLIC_KEY
  );
}

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
        toEmail:    rec.email,
        toName:     rec.name,
        competition: rec.competition || rec.course,
        cid:        rec.cid,
        txHash:     rec.txHash,
        merkleData: rec.merkleData || null,
      });
      results.push({ ...rec, emailStatus: "sent" });
      if (onProgress) onProgress(i + 1, recipients.length, "sent", rec.name);
      if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      const msg = err?.text || err?.message || String(err);
      results.push({ ...rec, emailStatus: "failed", reason: msg });
      if (onProgress) onProgress(i + 1, recipients.length, "failed", rec.name);
    }
  }
  return results;
}