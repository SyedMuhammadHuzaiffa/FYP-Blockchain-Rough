(function(){
  const out = document.getElementById('out');
  let pass = 0, fail = 0;

  function log(ok, msg){
    const div = document.createElement('div');
    div.className = `alert alert-${ok ? 'success' : 'danger'} py-2 my-2`;
    div.textContent = (ok ? '✓ ' : '✗ ') + msg;
    out.appendChild(div);
    ok ? pass++ : fail++;
  }

  function summary(){
    const s = document.createElement('div');
    s.className = `alert ${fail ? 'alert-warning' : 'alert-success'} mt-3`;
    s.innerHTML = `<strong>Summary:</strong> ${pass} passed, ${fail} failed.`;
    out.appendChild(s);
  }

  Promise.resolve().then(async () => {
    try {
      // 1) Unknown should return unknown
      const r1 = await API.verifyCertificate({ code: 'NOPE' });
      log(r1 && r1.status === 'unknown', 'Unknown certificate returns status "unknown"');

      // 2) Valid should return cert
      const r2 = await API.verifyCertificate({ code: 'CERT-001' });
      log(r2 && r2.status === 'valid' && r2.cert && r2.cert.id === 'CERT-001', 'Valid certificate found');

      // 3) Student listing filters by id
      const list = await API.listCertificates('stu-ali');
      log(Array.isArray(list) && list.length >= 1, 'List certificates for stu-ali returns array');

      // 4) UI helper renders success variant
      const html = UI.statusCard('Valid', 'success', { id:'X', holder:'Y', program:'Z', issuedAt:'2024-01-01', hash:'0x' });
      log(/alert-success/.test(html), 'Status card renders success variant');

      // 5) Revoke works (mock)
      const res = await API.revokeCertificate('CERT-003', 'Testing');
      log(res && res.ok, 'Revoke returns ok');
    } catch (e) {
      log(false, 'Unexpected error: ' + (e && e.message ? e.message : e));
    } finally {
      summary();
    }
  });
})();