// src/libs/store.ts

export type IssuedRecord = {
  cid: string;        // certificate CID or ID
  name: string;
  course: string;
  className?: string;
  imageCid?: string;  // certificate image CID (optional)
  txHash?: string;    // blockchain tx hash (optional)
  issuedAt: number;   // unix seconds
  revoked: boolean;   // admin can revoke
};

const KEY = "issued_v1";

function parse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveIssued(list: IssuedRecord[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

// 🔹 Get all issued records (our local DB)
export function getIssued(): IssuedRecord[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  return parse<IssuedRecord[]>(raw, []);
}

// 🔹 Check if a CID already exists in local DB
export function cidExists(cid: string): boolean {
  const list = getIssued();
  return list.some((r) => r.cid === cid);
}

// 🔹 Add or update a record (CID is UNIQUE in local DB)
export function pushIssued(rec: IssuedRecord) {
  const list = getIssued();
  const existingIndex = list.findIndex((r) => r.cid === rec.cid);

  let next: IssuedRecord[];

  if (existingIndex >= 0) {
    // Update existing record with new data
    next = [...list];
    next[existingIndex] = { ...list[existingIndex], ...rec };
  } else {
    // Add new record at the top (newest first)
    next = [rec, ...list];
  }

  // Keep only the latest 500 records
  saveIssued(next.slice(0, 500));
}

// 🔹 Clear everything (used by "Clear All (Local)")
export function clearIssued() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

// 🔹 Remove a single record by CID
export function removeIssuedByCid(cid: string) {
  const next = getIssued().filter((r) => r.cid !== cid);
  saveIssued(next);
}

// 🔹 Mark certificate as revoked / restored
export function setRevoked(cid: string, value: boolean) {
  const list = getIssued();
  const next = list.map((r) =>
    r.cid === cid ? { ...r, revoked: value } : r
  );
  saveIssued(next);
}
