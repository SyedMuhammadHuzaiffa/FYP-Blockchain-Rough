// API layer that uses real endpoints when CONFIG.API_BASE is set,
// otherwise falls back to local mocks in data.js
(function () {
  const BASE = (window.CONFIG && window.CONFIG.API_BASE)
    ? String(window.CONFIG.API_BASE).replace(/\/+$/, "")
    : "";
  const useReal = !!BASE;

  async function getJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // some endpoints might return empty body
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  window.API = {
    /**
     * Verify certificate by code or hash
     * Expected server: GET /verify?code={ID_OR_HASH} -> { status, cert?, reason? }
     */
    async verifyCertificate({ code, hash }) {
      if (useReal) {
        const q = encodeURIComponent(code || hash || "");
        return await getJson(`${BASE}/verify?code=${q}`);
      }
      // --- mock fallback ---
      const match = (window.CERTS || []).find(c => c.id === code || c.hash === hash);
      if (!match) return { status: "unknown" };
      if (match.status === "revoked") {
        return { status: "revoked", cert: match, reason: match.revokeReason || "Revoked" };
      }
      return { status: "valid", cert: match };
    },

    /**
     * Get a certificate by id
     * Expected server: GET /cert/:id -> Certificate
     */
    async getCertificate(id) {
      if (useReal) {
        return await getJson(`${BASE}/cert/${encodeURIComponent(id)}`);
      }
      // --- mock fallback ---
      return (window.CERTS || []).find(c => c.id === id);
    },

    /**
     * List certificates for a student
     * Expected server: GET /students/:id/certs -> Certificate[]
     */
    async listCertificates(studentId) {
      if (useReal) {
        return await getJson(`${BASE}/students/${encodeURIComponent(studentId)}/certs`);
      }
      // --- mock fallback ---
      return (window.CERTS || []).filter(c => c.studentId === studentId);
    },

    /**
     * Revoke a certificate
     * Expected server: POST /cert/:id/revoke { reason } -> { ok: true }
     */
    async revokeCertificate(id, reason) {
      if (useReal) {
        return await getJson(`${BASE}/cert/${encodeURIComponent(id)}/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason })
        });
      }
      // --- mock fallback ---
      const c = (window.CERTS || []).find(x => x.id === id);
      if (!c) return { ok: false, message: "Certificate not found" };
      c.status = "revoked";
      c.revokeReason = reason || "Revoked";
      return { ok: true };
    }
  };
})();