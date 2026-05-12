const sgMail = require("@sendgrid/mail");

const FROM_EMAIL = "syed.huzaiffaxd@gmail.com";
const FROM_NAME = "Blockchain Certificate System";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function buildVerificationUrl(baseUrl, certificateId) {
  const normalizedBaseUrl = cleanBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return `/verify/${encodeURIComponent(certificateId)}`;
  }

  return `${normalizedBaseUrl}/verify/${encodeURIComponent(certificateId)}`;
}

async function sendCertificateEmail({ certificate, verificationBaseUrl }) {
  const certificateId = String(certificate?.certificateId || "").trim();
  const to = String(certificate?.studentEmail || "").trim().toLowerCase();

  if (!certificateId) {
    throw new Error("Certificate ID is required for certificate email");
  }

  if (!to) {
    throw new Error("Student email is required for certificate email");
  }

  const verificationUrl = buildVerificationUrl(
    verificationBaseUrl,
    certificateId,
  );
  const studentName = certificate?.studentName || "Student";
  const courseName = certificate?.courseName || "your course";
  const organizationName = certificate?.organizationName || "your organization";
  const blockchainStatus = certificate?.blockchainStatus || "pending";
  const issueDate = certificate?.issueDate || "-";

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME,
    },
    subject: `Certificate issued: ${courseName}`,
    html: `
      <div style="margin:0;padding:0;background:#f6f3fb;font-family:Arial,sans-serif;color:#1d1b20;">
        <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
          <div style="background:#ffffff;border:1px solid #e7e0ec;border-radius:14px;padding:26px;box-shadow:0 18px 44px rgba(29,27,32,0.10);">
            <p style="margin:0 0 8px;color:#6750a4;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
              Blockchain Certificate Verification
            </p>

            <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#1d1b20;">
              Your certificate is ready
            </h1>

            <p style="margin:0 0 18px;line-height:1.6;">
              Hello ${escapeHtml(studentName)}, your certificate for
              <strong>${escapeHtml(courseName)}</strong> has been issued by
              <strong>${escapeHtml(organizationName)}</strong>.
            </p>

            <div style="background:#f7f2fa;border:1px solid #e7e0ec;border-radius:10px;padding:16px;margin:18px 0;">
              <p style="margin:0 0 8px;"><strong>Student:</strong> ${escapeHtml(studentName)}</p>
              <p style="margin:0 0 8px;"><strong>Course:</strong> ${escapeHtml(courseName)}</p>
              <p style="margin:0 0 8px;"><strong>Organization:</strong> ${escapeHtml(organizationName)}</p>
              <p style="margin:0 0 8px;"><strong>Certificate ID:</strong> ${escapeHtml(certificateId)}</p>
              <p style="margin:0 0 8px;"><strong>Issue date:</strong> ${escapeHtml(issueDate)}</p>
              <p style="margin:0;"><strong>Blockchain status:</strong> ${escapeHtml(blockchainStatus)}</p>
            </div>

            <p style="margin:0 0 16px;line-height:1.6;">
              Use the public verification page to verify this certificate on blockchain.
              Open verification page to download certificate PDF.
            </p>

            <p style="margin:22px 0;">
              <a href="${escapeHtml(verificationUrl)}"
                style="display:inline-block;padding:12px 18px;background:#6750a4;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;">
                Open verification page
              </a>
            </p>

            <p style="margin:0 0 18px;color:#625b71;line-height:1.5;">
              If the button does not work, copy and paste this link into your browser:
            </p>

            <p style="word-break:break-all;margin:0;color:#6750a4;">
              ${escapeHtml(verificationUrl)}
            </p>
          </div>

          <p style="margin:16px 4px 0;color:#625b71;font-size:12px;line-height:1.5;">
            This email was sent because a certificate was issued to this email address.
          </p>
        </div>
      </div>
    `,
  });

  return {
    verificationUrl,
  };
}

module.exports = {
  buildVerificationUrl,
  sendCertificateEmail,
};
