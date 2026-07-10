# Demo Runbook

This runbook is a live-testing companion to [PRODUCT_QA_CHECKLIST.md](PRODUCT_QA_CHECKLIST.md). It uses the current frontend forms and Firebase callable-function contracts. It does not create accounts, change secrets, deploy code, or submit blockchain transactions by itself.

## A. Preconditions

- [ ] Confirm the deployed frontend is configured for Firebase project `blockchain-certificates-7bea4`.
- [ ] Confirm the frontend calls Firebase Functions in `us-central1`.
- [ ] Confirm the blockchain target is Polygon Amoy (chain ID `80002`). The public verification helper reads optional `VITE_CERTIFICATE_REGISTRY_ADDRESS` from the frontend root environment/deployment when set; otherwise it uses validated fallback `0xF0783186B4a5C64351932863A94B977B08df4683` through `https://polygon-amoy.drpc.org`.
- [ ] Confirm the deployed Functions secrets `CERTIFICATE_REGISTRY_ADDRESS` and `BLOCKCHAIN_CHAIN_ID` point to the same active Polygon Amoy deployment used by public verification. Do not print their values during the demo.
- [ ] Read `authorizedIssuers(<Functions issuer wallet address>)` on that contract and confirm it returns `true`. The contract rejects issuance and revocation from an unauthorized issuer.
- [ ] Check that the Functions issuer wallet has sufficient Amoy POL for one single issuance, one five-row batch anchor, and one revocation. Record only the pass/fail result, never the private key.
- [ ] Set and verify the production frontend URL: `<https://your-production-frontend.example>`.
- [ ] Confirm `FRONTEND_BASE_URL`, when used by Functions, is the production URL so emails and QR links do not point to localhost.
- [ ] Do not use `scripts/demoSeed.js` records as proof of an on-chain demo. Seeded records can contain placeholder values such as `DEMO_TX_HASH_NOT_ON_CHAIN` and placeholder IPFS data.

## B. Demo Accounts

Use these identities only after confirming that they do not already exist in Firebase Authentication. Passwords are intentionally omitted from this file; create temporary credentials through the UI and reset them privately as needed.

| Role | Name | Email | How the profile is created |
| --- | --- | --- | --- |
| Super Admin | Nadia Rahman | `<EXISTING_SUPERADMIN_EMAIL>` | Must already have a Firestore `users/{uid}` profile with `role: "superadmin"`; the application has no Super Admin self-registration flow. |
| Organization Admin | Omar Siddiqui | `<YOUR_EMAIL+orgadmin@provider.com>` | Super Admin creates the account for the selected organization and sends a password-reset invite. Replace with a real inbox controlled by the tester. |
| Teacher | Dr. Sana Malik | `<YOUR_EMAIL+teacher@provider.com>` | Organization Admin creates the account and sends a password-reset invite. Replace with a real inbox controlled by the tester. |
| Student | Mariam Ahmed | `<YOUR_EMAIL+student@provider.com>` | Student self-registers at `/register`; use the same real lowercase inbox value on the certificate so it appears in the student wallet and can receive the certificate email. |

### Email strategy

- The angle-bracket values above are documentation placeholders, not values to paste into the UI. Replace each with a real inbox controlled by the tester.
- Plus-addressing works only when the tester's email provider supports it. If it does not, use separate controlled inboxes instead.
- Organization Admin and Teacher flows generate Firebase password-reset links and send them using SendGrid, so `.example` addresses cannot complete those flows.
- The Student account and the certificate used for student wallet, PDF/QR, and SendGrid testing must use the same real controlled student inbox.
- Keep fictional `.example` addresses only for passive certificate recipients. Do not use them to prove inbox delivery, password reset, sign-in, or student-wallet behavior.

### Actual account form requirements

| Flow | Required input fields | Rules enforced by the current app/backend |
| --- | --- | --- |
| Create organization | `name` | Super Admin only; non-empty after trimming. The backend generates `orgId`, writes `status: "active"`, `createdBy`, and an empty `orgAdminIds` array. |
| Create Org Admin | `email`, `password`, `orgId`; `name` is optional | Super Admin only; selected organization must exist and not be inactive; email must not already exist; password is at least 6 characters. The backend creates Auth and `users/{uid}` with `role: "orgAdmin"`, `status: "active"`, and `organizationId`. |
| Create Teacher | `name`, `email`, `password` | Active Org Admin only; all fields non-empty; email must not already exist; password is at least 6 characters. The backend assigns the caller's `organizationId` and creates `role: "teacher"`, `status: "active"`. |
| Student registration | `name`, `email`, `password` | Firebase Auth requires a valid email and a password of at least 6 characters. The follow-up callable receives only `name`; it derives email/UID from the signed-in Auth user and writes `role: "student"`, `status: "active"`. A blank name is technically accepted by the backend, but use the full name for the demo. |

## C. Demo Organization

Create this through the Super Admin form using only the supported input field:

| Form field | Demo value |
| --- | --- |
| `name` | `Northstar Institute of Technology` |

After creation, copy the backend-generated organization ID into the evidence table. Do not attempt to supply an ID, status, or admin list in the form. The persisted organization record is created by the backend with `name`, `status`, `createdBy`, `orgAdminIds`, timestamps, and a generated document ID.

## D. Single Certificate Dataset

The required issuance fields are `studentName`, `studentEmail`, `courseName`, and `issueDate`. The current form also accepts `certificateTitle`, `certificateSubtitle`, `description`, `gradeOrResult`, `duration`, `venue`, `instructorName`, `remarks`, `certificateDesign`, an optional PNG/JPEG `certificateTemplateDataUrl`, `aiDesignPrompt`, and `aiDesignSuggestion`. Leave template and AI fields at their defaults for this run.

| Purpose | studentName | studentEmail | courseName | issueDate | certificateTitle | description | gradeOrResult | duration | venue | instructorName | remarks | certificateDesign |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Valid public verification | Ayesha Khan | `ayesha.khan@demo.northstar.example` | Blockchain Fundamentals Workshop | `2026-06-15` | Certificate of Achievement | Successfully completed the blockchain fundamentals workshop. | Distinction | 24 hours | Northstar Innovation Lab | Dr. Sana Malik | Portfolio demo valid certificate. | classicAcademic |
| Student wallet, PDF/QR, and SendGrid delivery | Mariam Ahmed | `<YOUR_EMAIL+student@provider.com>` | Smart Contract Development Lab | `2026-06-16` | Certificate of Achievement | Successfully completed practical smart contract exercises. | A | 30 hours | Northstar Innovation Lab | Dr. Sana Malik | Replace with the real student inbox before issuing. | modernMinimal |
| Planned revocation | Bilal Hussain | `bilal.hussain@demo.northstar.example` | Certificate Security Review | `2026-06-17` | Certificate of Achievement | Completed the certificate security review module. | Pass | 12 hours | Northstar Innovation Lab | Dr. Sana Malik | Safe record reserved for irreversible revocation testing. | cleanBlue |

The Ayesha and Bilal records are passive public-verification records only. A SendGrid request might be accepted or recorded as failed, but neither `.example` address can establish actual inbox delivery. Use Mariam's real controlled inbox for the `emailStatus` and received-email evidence.

All three certificate IDs, certificate hashes, transaction hashes, IPFS values, and timestamps are generated by the backend. Copy them from the result toast, certificate table, public verifier, or Firestore only after issuance.

## E. Bulk/Merkle Dataset

Use [demo-data/demo-bulk-certificates.csv](demo-data/demo-bulk-certificates.csv). It has five data rows and reserves its first row for the demo student.

### Before Uploading the CSV

Replace the `studentEmail` value in the first data row, currently `replace-with-real-student@example.invalid`, with the real controlled student inbox used at registration, for example `<YOUR_EMAIL+student@provider.com>` after replacing that token with an actual provider-supported address. Do not upload the committed fixture unchanged when testing SendGrid delivery or the student wallet: the committed value is parser-valid but intentionally non-deliverable.

### CSV contract verified from the current parser

The exact advertised extended header is:

```text
studentName,studentEmail,courseName,issueDate,certificateTitle,description,gradeOrResult,duration,venue,instructorName,remarks
```

- Required data fields: `studentName`, `studentEmail`, `courseName`, `issueDate`.
- The first four header cells must appear in that order. Header matching for those four is case-insensitive and ignores spaces, underscores, and hyphens.
- The listed optional headers are supported after the first four. `certificateSubtitle` is also parser-supported if supplied as a header, but it is not included in the current UI's advertised extended format or sample-download header.
- Basic four-column CSV is also accepted. Headerless rows are accepted if each row has at least four comma-separated fields.
- Student email is lowercased; validation only checks that it contains `@`.
- Dates are required non-empty strings; the form normally emits `YYYY-MM-DD`, so use that format for a clean demo.
- Maximum: 200 non-empty data rows per batch. Uploaded file must be `.csv`, a CSV-compatible MIME type, and 1 MB or smaller.
- The parser supports quoted commas and doubled quotes inside a cell, but not multiline CSV fields. This fixture intentionally uses plain comma-free values.

Expected issuance result: one generated `batchId`, one Merkle root, and one blockchain anchor transaction shared by all five certificates. Each certificate receives generated `certificateId`, `batchIndex`, `batchProof`, `batchSize`, and `issuanceMode: "bulk"` fields.

## F. Invalid Verification Case

Use this non-empty, deliberately unissued route value:

```text
DEMO-NOT-ISSUED-0000
```

Open `<production-url>/verify/DEMO-NOT-ISSUED-0000` while signed out. Expected result: the public not-found/unable-to-verify state, with no stack trace or authenticated dashboard required.

## G. Exact Demo Execution Order

1. Sign in as Super Admin.
2. Create `Northstar Institute of Technology`, or verify the existing organization and copy its ID.
3. Create or verify Omar Siddiqui as the Organization Admin for that organization.
4. Sign in as Omar Siddiqui.
5. Create or verify Dr. Sana Malik as the Teacher.
6. Register or verify Mariam Ahmed as the Student using the real controlled student inbox, then sign out.
7. Sign in as Dr. Sana Malik and issue the three single certificates in the order shown above.
8. Sign in as Mariam Ahmed and confirm the Smart Contract Development Lab certificate appears in the student wallet.
9. Sign out and publicly verify Ayesha Khan's valid single certificate.
10. From Mariam's student wallet or the teacher certificate table, download the Smart Contract Development Lab PDF.
11. Scan that PDF's QR code on a mobile device and confirm it opens the production public-verification URL.
12. As the Teacher, upload `demo-data/demo-bulk-certificates.csv`, preview all five rows, and issue the batch.
13. Open one bulk certificate's public verification page and confirm its Merkle proof and on-chain batch are verified.
14. As the Teacher, revoke Bilal Hussain's planned-revocation certificate. Confirm the irreversible action carefully.
15. Refresh its public verification URL and confirm the revoked state is prominent.
16. While signed out, open the invalid ID in section F and capture the not-found state.

Use the full role and state coverage in [PRODUCT_QA_CHECKLIST.md](PRODUCT_QA_CHECKLIST.md) for any failure, RBAC, or mobile-layout follow-up; this runbook is the happy-path demonstration sequence.

## H. Evidence Capture Table

Fill one row for each meaningful proof point. Leave secrets out of this table.

| Scenario | Production URL | Account email | Organization ID | Certificate ID | Batch ID | Transaction hash | Revoke transaction hash | IPFS CID | Public verification URL | Screenshot filename | Result (pass/fail) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Organization setup |  |  |  |  |  |  |  |  |  |  |  |  |
| Valid single certificate |  |  |  |  |  |  |  |  |  |  |  |  |
| PDF and QR certificate |  |  |  |  |  |  |  |  |  |  |  |  |
| Bulk Merkle batch |  |  |  |  |  |  |  |  |  |  |  |  |
| Revoked certificate |  |  |  |  |  |  |  |  |  |  |  |  |
| Invalid verification ID |  |  |  | `DEMO-NOT-ISSUED-0000` |  |  |  |  |  |  |  |  |

## I. Screenshot Run Order

1. Capture Super Admin organization list after Northstar appears. Use it for the README/admin-management portfolio view.
2. Capture the Create Org Admin panel with the organization selected before submitting. Do not show a password value.
3. Capture Org Admin teacher list after Dr. Sana Malik appears.
4. Capture the Teacher single-issue form populated with the Ayesha Khan dataset before confirmation.
5. Capture the Teacher certificate table after the three single certificates show confirmed status and safe transaction/IPFS links.
6. Capture Mariam Ahmed's student wallet with the PDF/QR certificate visible.
7. Capture Ayesha Khan's signed-out public verification page showing the valid state.
8. Capture the downloaded PDF's clean certificate view and QR code.
9. Capture the mobile browser after scanning the QR code and loading the same verification URL.
10. Capture the bulk CSV preview showing five ready rows before batch issuance.
11. Capture one bulk certificate public page showing its Merkle/batch verification state.
12. Capture the Polygon Amoy explorer page for the single or batch transaction, without wallet or private account data.
13. Capture Bilal Hussain's public page after revocation, with the revoked state visible above the fold.
14. Capture the invalid-ID public state only if it reads clearly and does not contain internal error details.

The primary portfolio screenshot inventory is in [PRODUCT_QA_CHECKLIST.md](PRODUCT_QA_CHECKLIST.md); this order maps each image to the demo moment that produces it.

## J. Cleanup Notes

Keep these records for a stable portfolio story:

- The Northstar organization and role accounts, provided every interactive role uses a controlled inbox and clearly demo-safe identity.
- Ayesha Khan's confirmed valid single certificate.
- Mariam Ahmed's confirmed PDF/QR certificate and student account.
- One confirmed five-row Merkle batch with a safe public verification page.
- Bilal Hussain's revoked certificate, because it demonstrates the lifecycle honestly. Revocation is irreversible, so preserve it as the dedicated revoked example rather than trying to reuse a portfolio-valid record.

Candidates to remove later, only if they are not needed as evidence:

- Duplicate accounts created during failed onboarding attempts.
- Certificates whose blockchain/IPFS status failed before confirmation.
- Accidental duplicate batches, test rows outside the five-row fixture, and incomplete records made before the final screenshots.

Do not delete a confirmed or revoked record merely to make the dashboard look cleaner until screenshots, transaction links, and public URLs have been captured. Remove Auth/Firestore test data only through an authorized administrative maintenance task; do not attempt to erase on-chain history.
