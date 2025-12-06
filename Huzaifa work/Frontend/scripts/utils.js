// UI utilities shared across pages
(function () {
  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    try {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString();
    } catch {
      return iso || "—";
    }
  }

  function statusCard(title, variant, cert, reason) {
    const color =
      variant === "success" ? "success" :
      variant === "danger"  ? "danger"  :
      variant === "warning" ? "warning" : "light";

    const details = cert
      ? `
      <ul class="list-unstyled mb-0 small">
        <li><strong>ID:</strong> ${esc(cert.id)}</li>
        <li><strong>Holder:</strong> ${esc(cert.holder || "—")}</li>
        <li><strong>Program:</strong> ${esc(cert.program || "—")}</li>
        <li><strong>Issued:</strong> ${esc(fmtDate(cert.issuedAt))}</li>
        <li><strong>Hash:</strong> <code>${esc(cert.hash || "—")}</code></li>
      </ul>`
      : '<p class="mb-0">No matching certificate found.</p>';

    const openBtn = cert
      ? `<a class="btn btn-sm btn-outline-dark"
            href="./cert.html?id=${encodeURIComponent(cert.id)}">Open</a>`
      : "";

    return `
      <div class="alert alert-${color}">
        <div class="d-flex justify-content-between align-items-start">
          <h5 class="mb-2">${esc(title)}</h5>
          ${openBtn}
        </div>
        ${reason ? `<p class="mb-2"><strong>Reason:</strong> ${esc(reason)}</p>` : ""}
        ${details}
      </div>`;
  }

  function parseCertIdFromPayload(payload) {
    try {
      const url = new URL(payload);
      return new URLSearchParams(url.search).get("id");
    } catch {
      return String(payload || "").trim();
    }
  }

  window.UI = {
    esc,
    fmtDate,
    statusCard,
    parseCertIdFromPayload
  };
})();