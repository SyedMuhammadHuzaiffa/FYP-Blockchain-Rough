# Production Preflight

This is a read-only preflight for the deployed certificate platform. It does not deploy Functions, modify Firebase, access secret values, create users, or send blockchain transactions. Record PASS, FAIL, or BLOCKED for each row before live issuance.

## Repository Findings

| Check | Current repository evidence | Preflight status |
| --- | --- | --- |
| Firebase project | Frontend Firebase configuration uses `blockchain-certificates-7bea4`. | Confirm against the deployed project. |
| Functions region | Frontend uses `us-central1`; callable Functions declare `us-central1`. | Confirm deployed Functions are in this region. |
| Public network | Active verifier uses Polygon Amoy RPC. The expected Amoy chain ID is `80002`. | Confirm RPC chain ID resolves to `80002`. |
| Active public verifier contract | `certificate-frontend/src/blockchain/verifyCertificateOnChain.js` accepts optional `VITE_CERTIFICATE_REGISTRY_ADDRESS`, validates it, and otherwise uses development fallback `0xF0783186B4a5C64351932863A94B977B08df4683`. | Compare the deployed public value/fallback securely with the Functions contract secret. |
| Email URL source | Functions use request `Origin` first, then `FRONTEND_BASE_URL`, then a relative `/verify/...` fallback. | Set `FRONTEND_BASE_URL` for non-browser or fallback calls. |
| QR/share/PDF URL source | Active Student dashboard, teacher dashboard, share utility, and PDF utility use `window.location.origin` with `/verify/:certificateId`. | Test from the production domain, never localhost. |
| Vercel routing | `certificate-frontend/vercel.json` rewrites all paths to `/index.html`. | Refresh protected and public routes on Vercel. |
| Secret-file hygiene | `certificate-frontend/src/.env` was empty, unused by Vite, removed from Git tracking, and preserved locally. Root and subproject ignore files now cover `.env` and `.env.*` while allowing `.env.example`. | Review the tracked-file history separately before declaring repository secret hygiene complete. |
| Contract drift | Backend Functions use secret `CERTIFICATE_REGISTRY_ADDRESS`; active frontend verification reads optional public `VITE_CERTIFICATE_REGISTRY_ADDRESS` and otherwise uses its validated Amoy fallback. They can still drift independently. | Preflight check: BLOCKED until an authorized owner compares deployment configuration. |
| Legacy tracked sources | `ethers-client.js` contains `0x43ccccc0850B169D67915BE5951a7be0C4D5a975`; `IssuedTable.jsx` and `registry.json` contain `0xd274A64A924491032ADf7A12E58Bd4662Fd36E69`; `AIBulkIssuer.jsx`, `MerkleBulkIssuer.jsx`, and `Verify.jsx` contain `0xa9e704750FdF85D168965db823728199840EC840` and legacy `?tab=verify&cid=` links. The active `App.jsx` imports the route-based dashboards and `VerifyCertificate` page instead. | Keep out of the production path; decide separately whether to retire them. |

## Safe Read-Only Commands

Run these only while authenticated to the intended Google/Firebase account. They list configuration or public state and do not deploy or reveal secret values.

```bash
# Confirm local Firebase CLI identity/project context.
firebase login:list
firebase use
firebase projects:list

# Confirm Functions visible to the expected project.
firebase functions:list --project blockchain-certificates-7bea4

# Optional: list Secret Manager names only; does not print secret payloads.
gcloud secrets list --project blockchain-certificates-7bea4 --format='table(name.basename())'

# Confirm the public Amoy RPC chain ID. Expected: 80002.
cast chain-id --rpc-url https://polygon-amoy.drpc.org

# Read issuer authorization. Substitute a public issuer wallet address only.
cast call 0xF0783186B4a5C64351932863A94B977B08df4683 \
  'authorizedIssuers(address)(bool)' <PUBLIC_ISSUER_WALLET_ADDRESS> \
  --rpc-url https://polygon-amoy.drpc.org

# Read the issuer wallet's Amoy POL balance; no private key is required.
cast balance <PUBLIC_ISSUER_WALLET_ADDRESS> --rpc-url https://polygon-amoy.drpc.org
```

If `gcloud` or `cast` is unavailable, use the Google Cloud Secret Manager console to view secret names only, PolygonScan Amoy to inspect the public wallet balance, and the contract's public `authorizedIssuers` read method. Do not use Firebase secret-access commands in a terminal because they print secret values.

## Contract Consistency Check

1. Treat `0xF0783186B4a5C64351932863A94B977B08df4683` as the frontend public-verification target.
2. Securely confirm that the deployed Functions `CERTIFICATE_REGISTRY_ADDRESS` identifies the same contract, without copying the secret into a shell, document, log, or chat.
3. Confirm the Functions `BLOCKCHAIN_CHAIN_ID` is `80002` and the configured RPC reaches Polygon Amoy.
4. Record PASS only after the issuer authorization read returns `true` for the public Functions issuer wallet address.

The repository alone cannot verify steps 2 and 3 because the backend values are secrets. That is intentionally a BLOCKED check, not a request to expose them.

## Production URL And Routing Checks

1. Set the production frontend URL in the evidence table, for example `https://your-app.vercel.app`.
2. Open and refresh each route directly:

```text
/login
/register
/admin
/org-admin
/dashboard
/student
/verify/<known-live-certificate-id>
```

3. Confirm each refresh loads the SPA rather than a Vercel 404.
4. From the deployed site, generate a share link and PDF QR code. Both should begin with the production browser origin and use `/verify/<certificateId>`.
5. Issue only to the controlled student inbox and verify the email's verification link begins with the production URL.

## SendGrid And IPFS Prerequisites

### SendGrid

- Confirm the deployed Functions have the `SENDGRID_API_KEY` secret name available; do not retrieve its value.
- Confirm the configured sender identity is verified in SendGrid and permitted to send to the controlled demo inbox.
- Create Org Admin and Teacher only with real controlled inboxes because their flows generate Firebase password-reset links and send invitations.
- Issue the Student wallet/PDF/QR certificate only to the real controlled student inbox, then confirm the certificate record reports `emailStatus: sent` and the received link uses the production URL.

### Pinata/IPFS

- Confirm the deployed Functions have the `PINATA_JWT` secret name available; do not retrieve its value.
- The current upload path pins metadata to Pinata and stores a `gateway.pinata.cloud/ipfs/<CID>` link when successful.
- After one real issuance, confirm `ipfsStatus: uploaded`, capture the CID, and open the public gateway URL in a signed-out browser.

## Evidence Table

| Check | PASS / FAIL / BLOCKED | Evidence or command result | Owner | Notes |
| --- | --- | --- | --- | --- |
| Firebase project and CLI account | PASS | Firebase CLI authenticated account can list `blockchain-certificates-7bea4`; it is the active project. | Repository |  |
| Functions deployed in `us-central1` | PASS | Nine v2 callable Functions are deployed in `us-central1`: organization, role, single/bulk issuance, and revocation flows. | Firebase CLI |  |
| Secret names present only | PASS | Secret Manager names confirmed: `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, `CERTIFICATE_REGISTRY_ADDRESS`, `BLOCKCHAIN_CHAIN_ID`, `PINATA_JWT`, `SENDGRID_API_KEY`, and `FRONTEND_BASE_URL`. No payloads were opened. | Deployment owner |  |
| Amoy RPC returns chain ID `80002` | PASS | Read-only ethers RPC call to `polygon-amoy.drpc.org` returned chain ID `80002`. | Public RPC |  |
| Public verifier contract bytecode and owner | PASS | Bytecode is present at frontend fallback contract; public `owner()` read succeeded. | Public RPC | Owner is public chain metadata; it is not assumed to be the Functions issuer. |
| Frontend and backend contract match | BLOCKED | Frontend fallback/public variable is known, but backend `CERTIFICATE_REGISTRY_ADDRESS` was not retrieved. | Deployment owner | Compare through authorized deployment configuration only. |
| Backend chain configuration matches Amoy | BLOCKED | Frontend/public RPC is Amoy, but backend `BLOCKCHAIN_CHAIN_ID` was not retrieved. | Deployment owner | Confirm value is `80002` without disclosing it. |
| Issuer authorized | BLOCKED | Provided issuer string is not a valid EVM `0x...` address; safe contract read was not attempted with it. | Deployment owner | Supply the public Functions issuer address, then run read-only `authorizedIssuers(address)`. |
| Issuer wallet has Amoy POL | BLOCKED | Requires a valid public Functions issuer address. | Deployment owner | Check public balance after issuer address is supplied. |
| `FRONTEND_BASE_URL` fallback is production URL | BLOCKED | Production domain is known, but backend environment value was not retrieved. | Deployment owner | Verify fallback configuration securely. |
| Vercel route refreshes pass | PASS | `https://fyp-blockchain-rough.vercel.app` returned HTTP 200 and the SPA shell for `/`, `/login`, `/register`, `/admin`, `/org-admin`, `/dashboard`, `/student`, and invalid verification. | Public HTTP/browser | Invalid route rendered `CERTIFICATE NOT FOUND`; no localhost text or browser console errors were observed. |
| Frontend verifier deployment configuration | PASS | Vercel environment does not define `VITE_CERTIFICATE_REGISTRY_ADDRESS`; deployed frontend therefore uses the validated Amoy fallback. | Deployment owner | Exact backend/frontend equality remains blocked. |
| SendGrid invite reaches controlled inbox | BLOCKED | Relevant callable Functions are deployed and `SENDGRID_API_KEY` name exists, but delivery needs a live controlled-inbox test. | Deployment owner | Do not test with `.example` recipients. |
| Certificate email reaches controlled student inbox | BLOCKED | Delivery requires a live issuance to the controlled Student inbox. | Deployment owner | Perform after the contract and issuer checks pass. |
| Pinata upload and public gateway pass | BLOCKED | Issuance Functions are deployed and `PINATA_JWT` name exists, but upload requires a live issuance. | Deployment owner | Verify after issuer checks pass. |
| Historical `certificate-frontend/src/.env` review recorded | PASS | Empty and removed from tracking; local file preserved and ignored. | Repository |  |
| Legacy contract/link sources assessed | PASS | Legacy files are documented and remain untouched pending production QA. | Repository | See `LEGACY_CODE_REVIEW.md`. |

## Current Blocks Before Production Testing

- Verify the deployed backend contract secret and chain ID against the public verifier without exposing values.
- Verify the public Functions issuer wallet is authorized and funded on Polygon Amoy.
- Supply the valid public Functions issuer wallet address in EVM `0x` format; do not provide a private key.
- Keep `certificate-frontend/src/.env` untracked; it is unused by Vite. Use `certificate-frontend/.env` only for optional public Vite variables when needed.
- Use controlled real inboxes for Organization Admin, Teacher, and Student flows; replace the first-row CSV `studentEmail` before uploading.

For secret-name verification without values, use Google Cloud Console: select project `blockchain-certificates-7bea4` -> Security -> Secret Manager. Confirm only the presence of `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, `CERTIFICATE_REGISTRY_ADDRESS`, `BLOCKCHAIN_CHAIN_ID`, `PINATA_JWT`, `SENDGRID_API_KEY`, and `FRONTEND_BASE_URL`.
