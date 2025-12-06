// src/ipfs.js
// Utilities to upload files/JSON to IPFS automatically.
// Tries LOCAL IPFS Desktop (http://127.0.0.1:5001) first.
// Optional: plug a pinning service in fallbackUpload() if you want.

const LOCAL_API = "http://127.0.0.1:5001/api/v0/add?pin=true&wrap-with-directory=false";

async function uploadToLocalIPFS(file, filename = "file.bin") {
  const form = new FormData();
  // Kubo expects 'file' field; include filename (helps UX in Desktop)
  form.append("file", file, filename);

  const res = await fetch(LOCAL_API, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Local IPFS add failed (${res.status})`);

  // Kubo returns newline delimited JSON if streaming; in Desktop it’s one JSON object.
  const text = await res.text();
  const lastLine = text.trim().split("\n").pop();
  const obj = JSON.parse(lastLine); // { Name, Hash, Size }
  return obj.Hash; // CID
}

// TODO: optional pinning fallback—return null if not configured
async function fallbackUpload(_file, _name) {
  // Example: Pinata/Web3Storage upload here.
  // If you don’t have a key yet, just return null and we’ll show a helpful UI error.
  return null;
}

export async function ipfsAddFile(fileOrBlob, name = "file.bin") {
  // prefer local IPFS
  try {
    return await uploadToLocalIPFS(fileOrBlob, name);
  } catch (e) {
    // try pinning fallback if configured
    const cid = await fallbackUpload(fileOrBlob, name);
    if (cid) return cid;
    // bubble up original error so UI can instruct the user to run IPFS Desktop or add a key
    throw e;
  }
}

export async function ipfsAddJson(obj, name = "metadata.json") {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  return ipfsAddFile(blob, name);
}
