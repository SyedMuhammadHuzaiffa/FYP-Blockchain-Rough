const { ethers } = require("ethers");
const certificateRegistryAbi = [
  ...require("./CertificateRegistry.abi.json"),
  {
    inputs: [
      {
        internalType: "string",
        name: "certificateId",
        type: "string",
      },
    ],
    name: "revokeCertificate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
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

  const { contract, provider, wallet, config: blockchainConfig } =
    getCertificateRegistry(config);

  const tx = await contract.issueCertificate(
    String(certificateId).trim(),
    certificateHash,
    String(ipfsCid || "").trim(),
  );
  const receipt = await tx.wait(1);
  const network = await provider.getNetwork();

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: blockchainConfig.contractAddress,
    chainId: Number(network.chainId),
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

async function revokeCertificateOnChain(certificateId, config = {}) {
  if (!certificateId || !String(certificateId).trim()) {
    throw new Error("certificateId is required");
  }

  const { contract, provider, wallet, config: blockchainConfig } =
    getCertificateRegistry(config);
  const tx = await contract.revokeCertificate(String(certificateId).trim());
  const receipt = await tx.wait(1);
  const network = await provider.getNetwork();

  return {
    revokeTxHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: blockchainConfig.contractAddress,
    chainId: Number(network.chainId),
    revokedByAddress: wallet.address,
  };
}

module.exports = {
  anchorCertificateOnChain,
  revokeCertificateOnChain,
  verifyCertificateOnChain,
};
