// src/ethers-client.js
import { ethers } from "ethers";
import { CHAIN_ID } from "./config";
import registryMap from "./registry.json"; // { "80002": "0x..." }

// ✅ Multiple public RPC fallbacks for Polygon Amoy
const AMOY_RPCS = [
  "https://rpc-amoy.polygon.technology",
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://polygon-amoy.drpc.org",
  "https://rpc.ankr.com/polygon_amoy",
  "https://polygon-amoy.gateway.tenderly.co"
];

const REGISTRY_ABI = [
  "function getAddressByString(string keyStr) view returns (address)"
];

const CERT_ABI = [
  "function addCertificate(string studentName,string course,string className,string ipfsHash,address issuedTo) external",
  "function addCertificates(string[] studentNames,string[] courses,string[] classNames,string[] ipfsHashes,address[] issuedTos) external",
  "function verifyByCid(string ipfsHash) view returns (string studentName,string course,string className,address issuedTo,uint256 issuedAt,bool exists)",
  "function verifyCertificate(string ipfsHash) view returns (string studentName,string course,string storedHash,uint256 issuedAt,bool exists)"
];

// 🔧 Try each RPC until one works
async function createFallbackRpcProvider() {
  const errors = [];
  for (const url of AMOY_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url, CHAIN_ID);
      // Simple health check
      await provider.getBlockNumber();
      console.log("Using RPC:", url);
      return provider;
    } catch (err) {
      console.warn("RPC failed:", url, err);
      errors.push(`${url}: ${err}`);
    }
  }
  throw new Error(
    "Could not reach any Polygon Amoy RPC. Network may be blocking RPC traffic."
  );
}

// 🔧 Get MetaMask BrowserProvider if possible
async function getMetaMaskBase() {
  if (typeof window === "undefined") return null;
  const anyWin = window;
  if (!anyWin.ethereum) return null;

  const provider = new ethers.BrowserProvider(anyWin.ethereum);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);

  return {
    provider,
    chainId
  };
}

// 🔧 Main base provider
export async function getBaseProvider() {
  // Prefer MetaMask on Amoy for write actions
  const mm = await getMetaMaskBase();
  if (mm && mm.chainId === CHAIN_ID) {
    return { provider: mm.provider, type: "metamask" };
  }

  // Fallback to public RPC (read only)
  const rpcProvider = await createFallbackRpcProvider();
  return { provider: rpcProvider, type: "rpc" };
}

// 🔧 Registry contract from registry.json
async function getRegistry(provider) {
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const registryAddress = registryMap[String(chainId)];
  if (!registryAddress) {
    throw new Error(`No registry configured for chainId ${chainId}`);
  }
  return new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
}

// ✅ Main helper used by Single / Bulk / Verify
export async function resolveCertificate() {
  const { provider, type } = await getBaseProvider();

  // Read registry to find Certificate address
  const registry = await getRegistry(provider);
  const certAddress = await registry.getAddressByString("Certificate");

  if (!certAddress || certAddress === ethers.ZeroAddress) {
    throw new Error("Registry does not contain 'Certificate' address.");
  }

  // If MetaMask on Amoy: use signer → can issue
  if (type === "metamask") {
    const signer = await provider.getSigner();
    return new ethers.Contract(certAddress, CERT_ABI, signer);
  }

  // Otherwise read-only (verify still works)
  return new ethers.Contract(certAddress, CERT_ABI, provider);
}
