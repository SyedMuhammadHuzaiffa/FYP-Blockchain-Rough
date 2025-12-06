
# README_LOCAL.md

**Network:** Ganache  
**RPC:** http://127.0.0.1:7545  
**Chain ID:** 1337 or 5777 (write actual)

**Contract Name:** Certificate  
**Deployed Address (local):** 0xeD1000Cb8Ae8044F421F6390a1CE3BE1C3815c6c

**Functions:**

- `addCertificate(string studentName, string course, string ipfsHash)`  
  - Reverts if `ipfsHash` is empty or already stored.
- `verifyCertificate(string ipfsHash) -> (string studentName, string course, string storedHash, uint256 issuedAt, bool exists)`

Paste the actual ABI in `./frontend/abi.json`.
