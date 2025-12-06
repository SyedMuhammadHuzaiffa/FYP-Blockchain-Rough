// SHA-256 of a File (for issuing)
export async function sha256HexFile(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  // Avoid spread/iterable requirements by using Array.from
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

// SHA-256 of a URL (for verify / JSON metadata)
export async function sha256HexFromUrl(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
