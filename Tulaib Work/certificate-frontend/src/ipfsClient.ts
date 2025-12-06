// src/ipfsClient.ts
import lighthouse from "@lighthouse-web3/sdk";

// 🔑 Your Lighthouse API key
// (If you want, move this into .env later; for now keep it simple.)
const LIGHTHOUSE_API_KEY = "e9db613b.c41d8208e5b54c6597b34d29ba24dcec";

/**
 * Upload a single file to Lighthouse IPFS and return its CID.
 */
export async function uploadToIpfsFilebase(file: File): Promise<string> {
  if (!file) {
    throw new Error("No file provided for upload");
  }

  // IMPORTANT: Lighthouse expects something iterable, so wrap File in an array
  const output = await lighthouse.upload(
    [file],              // 👈 array with one File
    LIGHTHOUSE_API_KEY   // 👈 your API key
  );

  if (!output || !output.data || !output.data.Hash) {
    console.error("Unexpected Lighthouse upload response:", output);
    throw new Error("Invalid response from Lighthouse upload");
  }

  // CID from Lighthouse
  return String(output.data.Hash).trim();
}

/**
 * Build an IPFS gateway URL for a CID (Lighthouse gateway).
 */
export function filebaseGatewayUrl(cid: string): string {
  if (!cid) return "";
  return `https://gateway.lighthouse.storage/ipfs/${cid}`;
}
