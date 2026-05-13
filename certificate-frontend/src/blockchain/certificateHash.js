import { ethers } from "ethers";

const SCHEMA_VERSION = 1;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

export function buildCanonicalCertificatePayload(certificate) {
  return {
    schemaVersion: SCHEMA_VERSION,
    certificateId: normalizeString(certificate?.certificateId || certificate?.id),
    studentName: normalizeString(certificate?.studentName),
    studentEmail: normalizeEmail(certificate?.studentEmail),
    courseName: normalizeString(certificate?.courseName),
    issueDate: normalizeString(certificate?.issueDate),
    organizationId: normalizeString(certificate?.organizationId),
    issuedBy: normalizeString(certificate?.issuedBy),
    issuedByEmail: normalizeEmail(certificate?.issuedByEmail),
  };
}

export function buildCertificateHashPayload(certificate) {
  return buildCanonicalCertificatePayload(certificate);
}

export function computeCertificateHash(certificate) {
  const payload = buildCanonicalCertificatePayload(certificate);
  const canonicalJson = JSON.stringify(payload);

  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
}
