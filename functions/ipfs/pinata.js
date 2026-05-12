const PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_GATEWAY_BASE_URL = "https://gateway.pinata.cloud/ipfs";

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeOptional(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

function buildVerificationUrl(baseUrl, certificateId) {
  const normalizedBaseUrl = cleanString(baseUrl).replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    return `/verify/${encodeURIComponent(certificateId)}`;
  }

  return `${normalizedBaseUrl}/verify/${encodeURIComponent(certificateId)}`;
}

function buildCertificateMetadata(certificateData, options = {}) {
  const certificateId = cleanString(certificateData?.certificateId);

  if (!certificateId) {
    throw new Error("Certificate ID is required for IPFS metadata");
  }

  const metadata = {
    schemaVersion: 1,
    certificateId,
    studentName: cleanString(certificateData?.studentName),
    studentEmail: cleanString(certificateData?.studentEmail).toLowerCase(),
    courseName: cleanString(certificateData?.courseName),
    issueDate: cleanString(certificateData?.issueDate),
    organizationId: cleanString(certificateData?.organizationId),
    organizationName: cleanString(certificateData?.organizationName),
    issuedBy: cleanString(certificateData?.issuedBy),
    issuedByEmail: cleanString(certificateData?.issuedByEmail).toLowerCase(),
    certificateHash: cleanString(certificateData?.certificateHash),
    blockchainStatus: cleanString(certificateData?.blockchainStatus),
    blockchainTxHash: normalizeOptional(certificateData?.blockchainTxHash),
    contractAddress: normalizeOptional(certificateData?.contractAddress),
    chainId: normalizeOptional(certificateData?.blockchainChainId),
    verificationUrl: buildVerificationUrl(options.verificationBaseUrl, certificateId),
    issuanceMode: cleanString(certificateData?.issuanceMode || "single"),
    createdAt: options.createdAtIso || new Date().toISOString(),
  };

  if (certificateData?.batchId) {
    metadata.batchId = certificateData.batchId;
    metadata.batchRoot = certificateData.batchRoot || null;
    metadata.batchProof = Array.isArray(certificateData.batchProof)
      ? certificateData.batchProof
      : [];
    metadata.batchIndex = normalizeOptional(certificateData.batchIndex);
    metadata.batchSize = normalizeOptional(certificateData.batchSize);
  }

  return metadata;
}

async function uploadCertificateMetadataToIpfs(certificateData, options = {}) {
  const jwt = cleanString(options.pinataJwt);

  if (!jwt) {
    throw new Error("PINATA_JWT is not configured");
  }

  const metadata = buildCertificateMetadata(certificateData, options);
  const response = await fetch(PINATA_PIN_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: {
        name: `certificate-${metadata.certificateId}.json`,
        keyvalues: {
          certificateId: metadata.certificateId,
          organizationId: metadata.organizationId,
          issuanceMode: metadata.issuanceMode,
        },
      },
      pinataContent: metadata,
    }),
  });

  const responseText = await response.text();
  let payload = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      throw new Error(
        `Pinata returned unreadable response (${response.status}): ${responseText.slice(0, 300)}`,
      );
    }
  }

  if (!response.ok) {
    const message = payload?.error?.details || payload?.error || responseText;

    throw new Error(
      `Pinata upload failed (${response.status}): ${cleanString(message) || "Unknown error"}`,
    );
  }

  const ipfsCid = payload?.IpfsHash;

  if (!ipfsCid) {
    throw new Error("Pinata upload succeeded but returned no CID");
  }

  return {
    ipfsCid,
    ipfsGatewayUrl: `${PINATA_GATEWAY_BASE_URL}/${ipfsCid}`,
    ipfsProvider: "pinata",
  };
}

module.exports = {
  buildCertificateMetadata,
  uploadCertificateMetadataToIpfs,
};
