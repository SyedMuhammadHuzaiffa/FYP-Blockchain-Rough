// src/libs/ipfs.ts
// Simple IPFS helper for image preview URLs

/**
 * Build a gateway URL for a given CID.
 * Uses Lighthouse public gateway so files uploaded via Lighthouse are visible.
 */
export function gatewayUrl(cid: string): string {
  if (!cid) return "";
  // You can also use https://ipfs.io/ipfs/ if you prefer
  return `https://gateway.lighthouse.storage/ipfs/${cid}`;
}
