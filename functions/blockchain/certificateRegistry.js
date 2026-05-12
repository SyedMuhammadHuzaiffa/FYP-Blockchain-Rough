const { ethers } = require("ethers");
const certificateRegistryAbi = require("./CertificateRegistry.abi.json");

const MAX_WRITE_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const TRANSIENT_ERROR_CODES = new Set([
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "TIMEOUT",
]);
const NON_RETRYABLE_MESSAGE_PATTERNS = [
  /execution reverted/i,
  /\brevert\b/i,
  /call exception/i,
  /not authorized/i,
  /unauthorized/i,
  /already (issued|revoked|anchored|authorized)/i,
  /not found/i,
  /\bempty (certificate|batch)/i,
  /invalid issuer/i,
  /invalid opcode/i,
  /insufficient funds/i,
  /nonce too low/i,
  /replacement transaction underpriced/i,
  /transaction underpriced/i,
  /already known/i,
  /known transaction/i,
];
const TRANSIENT_MESSAGE_PATTERNS = [
  /network_error/i,
  /server_error/i,
  /timeout/i,
  /econnreset/i,
  /etimedout/i,
  /socket hang up/i,
  /could not detect network/i,
  /rate limit/i,
  /too many requests/i,
  /\b429\b/,
  /bad gateway/i,
  /gateway timeout/i,
  /service unavailable/i,
  /temporarily unavailable/i,
];

function normalizePrivateKey(privateKey) {
  const trimmedPrivateKey = String(privateKey || "").trim();

  if (!trimmedPrivateKey) {
    return "";
  }

  return trimmedPrivateKey.startsWith("0x")
    ? trimmedPrivateKey
    : `0x${trimmedPrivateKey}`;
}

function getBlockchainConfig(config = {}) {
  const rpcUrl = config.rpcUrl || process.env.BLOCKCHAIN_RPC_URL;
  const privateKey = normalizePrivateKey(
    config.privateKey || process.env.BLOCKCHAIN_PRIVATE_KEY,
  );
  const contractAddress =
    config.contractAddress || process.env.CERTIFICATE_REGISTRY_ADDRESS;
  const chainId = Number(config.chainId || process.env.BLOCKCHAIN_CHAIN_ID);

  if (!rpcUrl) {
    throw new Error("Missing BLOCKCHAIN_RPC_URL");
  }

  if (!privateKey) {
    throw new Error("Missing BLOCKCHAIN_PRIVATE_KEY");
  }

  if (!contractAddress) {
    throw new Error("Missing CERTIFICATE_REGISTRY_ADDRESS");
  }

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Missing or invalid BLOCKCHAIN_CHAIN_ID");
  }

  return {
    rpcUrl,
    privateKey,
    contractAddress,
    chainId,
  };
}

function getErrorCode(error) {
  return String(error?.code || error?.error?.code || "").toUpperCase();
}

function getErrorText(error) {
  return [
    error?.code,
    error?.shortMessage,
    error?.reason,
    error?.message,
    error?.error?.code,
    error?.error?.message,
    error?.info?.error?.code,
    error?.info?.error?.message,
  ]
    .filter(Boolean)
    .join(" ");
}

function getErrorStatus(error) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.error?.status ||
      error?.info?.status,
  );
}

function isTransientBlockchainError(error) {
  const code = getErrorCode(error);
  const message = getErrorText(error);
  const status = getErrorStatus(error);

  if (code === "CALL_EXCEPTION") {
    return false;
  }

  if (NON_RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return false;
  }

  if (TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  if (status === 429 || status >= 500) {
    return true;
  }

  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function getRetryDelayMs(attempt) {
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function logWriteRetry(operationName, attempt, maxAttempts, delayMs, error) {
  console.warn(
    `${operationName} transient blockchain error on attempt ` +
      `${attempt}/${maxAttempts}; retrying in ${delayMs}ms`,
    {
      code: getErrorCode(error) || undefined,
      message: error?.shortMessage || error?.message || String(error),
    },
  );
}

async function withBlockchainWriteRetry(operationName, operation) {
  const maxAttempts = MAX_WRITE_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts && isTransientBlockchainError(error);

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      logWriteRetry(operationName, attempt, maxAttempts, delayMs, error);
      await sleep(delayMs);
    }
  }

  throw new Error(`${operationName} failed after retries`);
}

async function sendWriteTransaction(operationName, sendTransaction) {
  return withBlockchainWriteRetry(`${operationName}:send`, sendTransaction);
}

async function waitForWriteConfirmation(operationName, tx) {
  return withBlockchainWriteRetry(`${operationName}:confirm`, () => tx.wait(1));
}

function getCertificateRegistry(config = {}) {
  const blockchainConfig = getBlockchainConfig(config);
  const provider = new ethers.JsonRpcProvider(
    blockchainConfig.rpcUrl,
    blockchainConfig.chainId,
  );
  const wallet = new ethers.Wallet(blockchainConfig.privateKey, provider);
  const contract = new ethers.Contract(
    blockchainConfig.contractAddress,
    certificateRegistryAbi,
    wallet,
  );

  return {
    contract,
    provider,
    wallet,
    config: blockchainConfig,
  };
}

async function anchorCertificateOnChain({
  certificateId,
  certificateHash,
  ipfsCid = "",
  config = {},
}) {
  if (!certificateId || !String(certificateId).trim()) {
    throw new Error("certificateId is required");
  }

  if (!ethers.isHexString(certificateHash, 32)) {
    throw new Error("certificateHash must be a bytes32 hex string");
  }

  const { contract, wallet, config: blockchainConfig } =
    getCertificateRegistry(config);

  const tx = await sendWriteTransaction(
    "issueCertificateOnChain",
    () =>
      contract.issueCertificate(
        String(certificateId).trim(),
        certificateHash,
        String(ipfsCid || "").trim(),
      ),
  );
  const receipt = await waitForWriteConfirmation("issueCertificateOnChain", tx);

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: blockchainConfig.contractAddress,
    chainId: blockchainConfig.chainId,
    issuerAddress: wallet.address,
  };
}

async function verifyCertificateOnChain(certificateId, config = {}) {
  if (!certificateId || !String(certificateId).trim()) {
    throw new Error("certificateId is required");
  }

  const { contract, provider, config: blockchainConfig } =
    getCertificateRegistry(config);
  const result = await contract.verifyCertificate(String(certificateId).trim());
  const network = await provider.getNetwork();

  return {
    certificateHash: result.certificateHash,
    ipfsCid: result.ipfsCid,
    issuerAddress: result.issuer,
    issuedAt: result.issuedAt,
    revoked: result.revoked,
    revokedAt: result.revokedAt,
    exists: result.exists,
    contractAddress: blockchainConfig.contractAddress,
    chainId: Number(network.chainId),
  };
}

async function anchorBatchOnChain({ batchId, batchRoot, config = {} }) {
  if (!batchId || !String(batchId).trim()) {
    throw new Error("batchId is required");
  }

  if (!ethers.isHexString(batchRoot, 32)) {
    throw new Error("batchRoot must be a bytes32 hex string");
  }

  const { contract, wallet, config: blockchainConfig } =
    getCertificateRegistry(config);
  const tx = await sendWriteTransaction("anchorBatchOnChain", () =>
    contract.anchorBatch(String(batchId).trim(), batchRoot),
  );
  const receipt = await waitForWriteConfirmation("anchorBatchOnChain", tx);

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: blockchainConfig.contractAddress,
    chainId: blockchainConfig.chainId,
    issuerAddress: wallet.address,
  };
}

async function verifyBatchOnChain(batchId, config = {}) {
  if (!batchId || !String(batchId).trim()) {
    throw new Error("batchId is required");
  }

  const { contract, provider, config: blockchainConfig } =
    getCertificateRegistry(config);
  const result = await contract.verifyBatch(String(batchId).trim());
  const network = await provider.getNetwork();

  return {
    batchRoot: result.batchRoot,
    issuerAddress: result.issuer,
    issuedAt: result.issuedAt,
    revoked: result.revoked,
    revokedAt: result.revokedAt,
    exists: result.exists,
    contractAddress: blockchainConfig.contractAddress,
    chainId: Number(network.chainId),
  };
}

async function revokeCertificateOnChain(certificateId, config = {}) {
  if (!certificateId || !String(certificateId).trim()) {
    throw new Error("certificateId is required");
  }

  const { contract, wallet, config: blockchainConfig } =
    getCertificateRegistry(config);
  const tx = await sendWriteTransaction("revokeCertificateOnChain", () =>
    contract.revokeCertificate(String(certificateId).trim()),
  );
  const receipt = await waitForWriteConfirmation(
    "revokeCertificateOnChain",
    tx,
  );

  return {
    revokeTxHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: blockchainConfig.contractAddress,
    chainId: blockchainConfig.chainId,
    revokedByAddress: wallet.address,
  };
}

module.exports = {
  anchorBatchOnChain,
  anchorCertificateOnChain,
  revokeCertificateOnChain,
  verifyBatchOnChain,
  verifyCertificateOnChain,
};
