const { ethers } = require("ethers");

const SCHEMA_VERSION = 1;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function buildCertificateHashPayload(certificate) {
  return {
    schemaVersion: SCHEMA_VERSION,
    certificateId: normalizeString(certificate?.certificateId),
    studentName: normalizeString(certificate?.studentName),
    studentEmail: normalizeEmail(certificate?.studentEmail),
    courseName: normalizeString(certificate?.courseName),
    issueDate: normalizeString(certificate?.issueDate),
    organizationId: normalizeString(certificate?.organizationId),
    issuedBy: normalizeString(certificate?.issuedBy),
    issuedByEmail: normalizeEmail(certificate?.issuedByEmail),
  };
}

function computeCertificateHash(certificate) {
  const payload = buildCertificateHashPayload(certificate);
  const canonicalJson = JSON.stringify(payload);

  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
}

module.exports = {
  buildCertificateHashPayload,
  computeCertificateHash,
};
