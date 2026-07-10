# Legacy Code Review

This review traces the active React route graph from `certificate-frontend/src/App.jsx`. The active application lazy-loads route pages, including `pages/VerifyCertificate.jsx`; it does not import the files listed below. No files were moved or deleted in this pass, so production behavior is unchanged.

| File | Classification | Stale address or link format | Import evidence | Recommended action | Deletion risk | Timing |
| --- | --- | --- | --- | --- | --- | --- |
| `certificate-frontend/src/ethers-client.js` | Unused legacy code | `0x43ccccc0850B169D67915BE5951a7be0C4D5a975`; legacy direct-wallet helpers | Imported only by legacy `Single.jsx`, `Bulk.tsx`, and `AIBulkIssuer.jsx`; none is imported by `App.jsx` or active route pages. | Archive or remove with its legacy callers in a dedicated cleanup. | Medium: those legacy screens depend on it if revived. | After production QA. |
| `certificate-frontend/src/IssuedTable.jsx` | Unused legacy code | `0xd274A64A924491032ADf7A12E58Bd4662Fd36E69`; `?tab=verify&cid=` | No active import found. | Archive with `QRCode.jsx` and old email/store helpers after confirming no manual entry point remains. | Medium: it has internal legacy dependencies. | After production QA. |
| `certificate-frontend/src/registry.json` | Unused legacy configuration | `0xd274A64A924491032ADf7A12E58Bd4662Fd36E69` for chain `80002` | No active import found. | Remove only together with consumers of the old contract flow. | Low alone, medium as part of an old feature bundle. | After production QA. |
| `certificate-frontend/src/AIBulkIssuer.jsx` | Unused legacy code | `0xa9e704750FdF85D168965db823728199840EC840`; `?tab=verify&cid=` | No active import found; it imports legacy `ethers-client.js`. | Archive with the older AI/Merkle flow after a focused regression check. | Medium: self-contained legacy workflow. | After production QA. |
| `certificate-frontend/src/MerkleBulkIssuer.jsx` | Unused legacy code | `0xa9e704750FdF85D168965db823728199840EC840` | No active import found. | Archive with related legacy Merkle utilities after a focused cleanup. | Medium: standalone legacy flow. | After production QA. |
| `certificate-frontend/src/Verify.jsx` | Unused legacy code | `0xd274A64A924491032ADf7A12E58Bd4662Fd36E69`, `0xa9e704750FdF85D168965db823728199840EC840`, and `?tab=verify&cid=` | No active import found; active route is `pages/VerifyCertificate.jsx` at `/verify/:certificateId`. | Archive or remove after production QA proves the route-based verifier is the only supported public flow. | Medium: old verification fallback behavior would disappear. | After production QA. |

## Active Public Verification

- Active route: `/verify/:certificateId` in `App.jsx`.
- Active component: `certificate-frontend/src/pages/VerifyCertificate.jsx`.
- Active public chain helper: `certificate-frontend/src/blockchain/verifyCertificateOnChain.js`.
- Active dashboard, PDF, QR, and share links build `/verify/<certificateId>` from `window.location.origin`.
- No active route-page import generates `?tab=verify&cid=` links. Those links are confined to the legacy files and their unreferenced helpers.

## Configuration Boundary

The active verifier now accepts optional public Vite variable `VITE_CERTIFICATE_REGISTRY_ADDRESS`. It validates a supplied address and otherwise retains the existing Polygon Amoy development fallback. The backend `CERTIFICATE_REGISTRY_ADDRESS` remains a separate Firebase secret, so the deployment owner must still compare the two securely before live issuance.

## Linting Impact

The full `npm run lint` command currently reports 12 errors and 1 warning. None is in the active route graph rooted at `main.jsx` and `App.jsx`; the targeted active-graph ESLint command passes.

| File | ESLint findings | Classification | Evidence |
| --- | --- | --- | --- |
| `AIBulkIssuer.jsx` | 3 errors | Unused legacy code | No active import; imports legacy `ethers-client.js` and `EmailSender.jsx`. |
| `EmailSender.jsx` | 1 error | Unused legacy code | Imported only by `AIBulkIssuer.jsx` and `IssuedTable.jsx`, both unused. |
| `IssuedTable.jsx` | 1 error | Unused legacy code | No active import. |
| `MerkleBulkIssuer.jsx` | 3 errors | Unused legacy code | No active import. |
| `Single.jsx` | 1 error | Unused legacy code | No active import; imports legacy `ethers-client.js`. |
| `Verify.jsx` | 1 error and 1 warning | Unused legacy code | No active import; active public route uses `pages/VerifyCertificate.jsx`. |
| `utils/ipfs.js` | 2 errors | Unused legacy code | No active import found. |

Do not suppress these findings globally or change ESLint ignores to make the command pass. After production QA, perform one dedicated legacy-cleanup pass that archives/removes the whole detached dependency groups, then re-run project-wide lint. Until then, `npm run lint` remains red because it scans those historical files, while active production source is lint-clean.
