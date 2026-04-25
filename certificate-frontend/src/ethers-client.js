// src/ethers-client.js
import { ethers } from "ethers";
import ABI from "./abi.json";

// ─── NEW Contract address — update after deployment ───────────────────────────
const CONTRACT_ADDRESSES = {
  "80002": "0x43ccccc0850B169D67915BE5951a7be0C4D5a975",
}
// ─── Get signer (MetaMask) ────────────────────────────────────────────────────
export async function getSigner() {
  if (!window.ethereum) throw new Error("MetaMask not found.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer  = await provider.getSigner();
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== 80002) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13882" }],
      });
    } catch {
      throw new Error("Switch MetaMask to Polygon Amoy (Chain ID: 80002)");
    }
  }
  return signer;
}

// ─── Write contract (needs MetaMask) ─────────────────────────────────────────
export async function getContract() {
  const signer  = await getSigner();
  const address = CONTRACT_ADDRESSES["80002"];
  if (!address || address.includes("PASTE")) {
    throw new Error("Set contract address in ethers-client.js first!");
  }
  return new ethers.Contract(address, ABI, signer);
}

// ─── Read contract (public RPC — no MetaMask needed) ─────────────────────────
export async function getReadContract() {
  const RPCS = [
    "https://rpc-amoy.polygon.technology",
    "https://polygon-amoy-bor-rpc.publicnode.com",
    "https://polygon-amoy.drpc.org",
  ];
  let provider = null;
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 80002);
      await p.getBlockNumber();
      provider = p;
      break;
    } catch { continue; }
  }
  if (!provider) throw new Error("All RPCs failed.");
  const address = CONTRACT_ADDRESSES["80002"];
  if (!address || address.includes("PASTE")) {
    throw new Error("Set contract address in ethers-client.js first!");
  }
  return new ethers.Contract(address, ABI, provider);
}

// ─── Gas settings for Polygon Amoy ───────────────────────────────────────────
export const GAS_SETTINGS = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas:         ethers.parseUnits("60", "gwei"),
};

// ─── Issue single certificate ─────────────────────────────────────────────────
export async function issueSingle(cid, name, competition) {
  const contract = await getContract();
  const tx       = await contract.issueCertificate(cid, name, competition, GAS_SETTINGS);
  return await tx.wait();
}

// ─── Issue bulk ───────────────────────────────────────────────────────────────
export async function issueBulk(cids, names, competitions) {
  const contract = await getContract();
  const tx       = await contract.issueBulk(cids, names, competitions, GAS_SETTINGS);
  return await tx.wait();
}

// ─── Verify (no MetaMask) ─────────────────────────────────────────────────────
export async function verifyCertificate(cid) {
  const contract = await getReadContract();
  const result   = await contract.verify(decodeURIComponent(cid.trim()));
  return {
    name:        result.name,
    competition: result.competition,
    issuedAt:    Number(result.issuedAt),
    exists:      result.exists,
  };
}

// ─── Keep old name for compatibility ─────────────────────────────────────────
export const resolveCertificate = getContract;
export const getBaseProvider    = async () => {
  const RPCS = ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"];
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 80002);
      await p.getBlockNumber();
      return { provider: p };
    } catch { continue; }
  }
  throw new Error("All RPCs failed.");
};