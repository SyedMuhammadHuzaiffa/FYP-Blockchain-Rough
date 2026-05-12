function getCertificateIdentifier(certificate) {
  return certificate?.certificateId || certificate?.id || "";
}

function getDisplayValue(value, fallback = "-") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

export function getCertificateVerifyUrl(certificateId) {
  return `${window.location.origin}/verify/${certificateId}`;
}

export function buildCertificateSharePayload(certificate) {
  const certificateId = getCertificateIdentifier(certificate);

  if (!certificateId) {
    throw new Error("Certificate ID is missing.");
  }

  const verifyUrl = getCertificateVerifyUrl(certificateId);
  const studentName = getDisplayValue(certificate?.studentName, "the student");
  const courseName = getDisplayValue(certificate?.courseName, "the course");
  const blockchainStatus = getDisplayValue(
    certificate?.blockchainShareStatus ||
      certificate?.blockchainVerificationResult ||
      certificate?.blockchainStatus,
    "available on the verification page",
  );
  const title = `Certificate verification for ${studentName}`;
  const text = [
    `${studentName} has a certificate for ${courseName}.`,
    `Certificate ID: ${certificateId}`,
    `Verify it here: ${verifyUrl}`,
    `Blockchain verification: ${blockchainStatus}.`,
  ].join("\n");

  return {
    title,
    text,
    url: verifyUrl,
  };
}

export async function shareCertificate(certificate) {
  const payload = buildCertificateSharePayload(certificate);

  if (typeof navigator.share === "function") {
    await navigator.share(payload);
    return "shared";
  }

  await navigator.clipboard.writeText(payload.text);
  return "copied";
}
