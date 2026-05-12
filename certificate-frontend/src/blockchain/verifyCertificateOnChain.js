import { ethers } from "ethers";

const RPC_URL = "https://polygon-amoy.drpc.org";
const CONTRACT_ADDRESS = "0xF0783186B4a5C64351932863A94B977B08df4683";

const CERTIFICATE_REGISTRY_ABI = [
  {
    inputs: [
      {
        internalType: "string",
        name: "certificateId",
        type: "string",
      },
    ],
    name: "verifyCertificate",
    outputs: [
      {
        internalType: "bytes32",
        name: "certificateHash",
        type: "bytes32",
      },
      {
        internalType: "string",
        name: "ipfsCid",
        type: "string",
      },
      {
        internalType: "address",
        name: "issuer",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "issuedAt",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "revoked",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "revokedAt",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "exists",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "batchId",
        type: "string",
      },
    ],
    name: "verifyBatch",
    outputs: [
      {
        internalType: "bytes32",
        name: "batchRoot",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "issuer",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "issuedAt",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "revoked",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "revokedAt",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "exists",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

function normalizeUint(value) {
  return value === undefined || value === null ? "" : value.toString();
}

export async function verifyCertificateOnChain(certificateId) {
  const normalizedCertificateId = String(certificateId || "").trim();

  if (!normalizedCertificateId) {
    throw new Error("certificateId is required");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CERTIFICATE_REGISTRY_ABI,
    provider,
  );
  const result = await contract.verifyCertificate(normalizedCertificateId);

  return {
    exists: Boolean(result.exists),
    certificateHash: result.certificateHash,
    ipfsCid: result.ipfsCid,
    issuer: result.issuer,
    issuedAt: normalizeUint(result.issuedAt),
    revoked: Boolean(result.revoked),
    revokedAt: normalizeUint(result.revokedAt),
  };
}

export async function verifyBatchOnChain(batchId) {
  const normalizedBatchId = String(batchId || "").trim();

  if (!normalizedBatchId) {
    throw new Error("batchId is required");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CERTIFICATE_REGISTRY_ABI,
    provider,
  );
  const result = await contract.verifyBatch(normalizedBatchId);

  return {
    exists: Boolean(result.exists),
    batchRoot: result.batchRoot,
    issuer: result.issuer,
    issuedAt: normalizeUint(result.issuedAt),
    revoked: Boolean(result.revoked),
    revokedAt: normalizeUint(result.revokedAt),
  };
}
