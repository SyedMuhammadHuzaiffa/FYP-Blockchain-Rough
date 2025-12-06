// src/libs/links.ts
import cfg from "../contract.json";

// 🔗 Build IPFS gateway URL from CID
export function gatewayUrl(cid: string): string {
  // Free public gateway (may be a bit slow but zero cost)
  return `https://ipfs.io/ipfs/${cid}`;
  // You can change to e.g. https://gateway.pinata.cloud/ipfs/${cid} if you like
}

// 🔗 Build transaction URL from tx hash
export function txUrl(txHash: string): string {
  // We assume contract.json has "explorer": "https://www.oklink.com/amoy"
  // Most explorers use /tx/<hash> pattern
  return `${cfg.explorer}/tx/${txHash}`;
}
