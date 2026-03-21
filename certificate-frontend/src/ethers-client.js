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

// ─── Gas settings for Polygon Amoy ──────────────────────────────────────────
// Amoy testnet requires minimum 25 Gwei tip cap.
// We set 30 Gwei to have a safe margin above the minimum.
const GAS_TIP_CAP  = ethers.parseUnits("30", "gwei");   // maxPriorityFeePerGas
const GAS_FEE_CAP  = ethers.parseUnits("60", "gwei");   // maxFeePerGas (tip + base buffer)

// Helper: attach gas overrides to any contract call
export function gasOverrides() {
  return {
    maxPriorityFeePerGas: GAS_TIP_CAP,
    maxFeePerGas: GAS_FEE_CAP,
  };
}

// ─── RPC helpers ─────────────────────────────────────────────────────────────

// Try each RPC until one works
async function createFallbackRpcProvider() {
  const errors = [];
  for (const url of AMOY_RPCS) {
    try {
      const provider = new ethers.JsonRpcProvider(url, CHAIN_ID);
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

// Get MetaMask BrowserProvider if available
async function getMetaMaskBase() {
  if (typeof window === "undefined") return null;
  const anyWin = window;
  if (!anyWin.ethereum) return null;

  const provider = new ethers.BrowserProvider(anyWin.ethereum);
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);

  return { provider, chainId };
}

// ─── Main base provider ───────────────────────────────────────────────────────
export async function getBaseProvider() {
  const mm = await getMetaMaskBase();
  if (mm && mm.chainId === CHAIN_ID) {
    return { provider: mm.provider, type: "metamask" };
  }

  const rpcProvider = await createFallbackRpcProvider();
  return { provider: rpcProvider, type: "rpc" };
}

// ─── Registry contract ────────────────────────────────────────────────────────
async function getRegistry(provider) {
  const net = await provider.getNetwork();
  const chainId = Number(net.chainId);
  const registryAddress = registryMap[String(chainId)];
  if (!registryAddress) {
    throw new Error(`No registry configured for chainId ${chainId}`);
  }
  return new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
}

// ─── Main helper used by Single / Bulk / Verify ───────────────────────────────
export async function resolveCertificate() {
  const { provider, type } = await getBaseProvider();

  const registry = await getRegistry(provider);
  const certAddress = await registry.getAddressByString("Certificate");

  if (!certAddress || certAddress === ethers.ZeroAddress) {
    throw new Error("Registry does not contain 'Certificate' address.");
  }

  if (type === "metamask") {
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(certAddress, CERT_ABI, signer);

    // ✅ Wrap the contract so every write call automatically includes gas overrides
    return new Proxy(contract, {
      get(target, prop) {
        const original = target[prop];
        if (typeof original !== "function") return original;

        // Only wrap known write functions
        const writeFns = ["addCertificate", "addCertificates"];
        if (!writeFns.includes(prop)) return original.bind(target);

        return async function (...args) {
          // If last arg is already an overrides object (has gasLimit etc), merge
          const lastArg = args[args.length - 1];
          const hasOverrides =
            lastArg !== null &&
            typeof lastArg === "object" &&
            !Array.isArray(lastArg) &&
            ("gasLimit" in lastArg ||
              "value" in lastArg ||
              "maxFeePerGas" in lastArg);

          if (hasOverrides) {
            // Merge our gas settings but don't override explicit user values
            args[args.length - 1] = {
              maxPriorityFeePerGas: GAS_TIP_CAP,
              maxFeePerGas: GAS_FEE_CAP,
              ...lastArg,
            };
          } else {
            // Append gas overrides as the last argument
            args.push({
              maxPriorityFeePerGas: GAS_TIP_CAP,
              maxFeePerGas: GAS_FEE_CAP,
            });
          }

          console.log(
            `Calling ${prop} with gas: tip=${ethers.formatUnits(GAS_TIP_CAP, "gwei")} gwei, ` +
            `fee=${ethers.formatUnits(GAS_FEE_CAP, "gwei")} gwei`
          );

          return original.apply(target, args);
        };
      },
    });
  }

  // Read-only (verify)
  return new ethers.Contract(certAddress, CERT_ABI, provider);
}