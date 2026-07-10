# Product QA Checklist

This checklist is for polishing the FYP into a personal portfolio product and demo-ready walkthrough. It is intentionally manual and project-specific. Do not use it to change application logic, rotate secrets, or redeploy contracts without a separate task.

## Demo Data Setup

Use a clean demo workspace where possible. If using seeded data, remember that `scripts/demoSeed.js` creates Firestore/Auth demo records with placeholder blockchain/IPFS values such as `DEMO_TX_HASH_NOT_ON_CHAIN`; use real issuance through the app when the demo must prove live Polygon Amoy verification.

- [ ] Confirm Firebase project is the intended demo project: `blockchain-certificates-7bea4`.
- [ ] Confirm frontend points to Firebase Functions region `us-central1`.
- [ ] Confirm public blockchain read helper targets Polygon Amoy (chain ID `80002`) and the active `CertificateRegistry` address. It accepts optional public `VITE_CERTIFICATE_REGISTRY_ADDRESS` and otherwise uses the validated Amoy fallback.
- [ ] Confirm the issuer wallet used by Firebase Functions is authorized on the deployed contract.
- [ ] Confirm the issuer wallet has enough Amoy POL/test MATIC for at least one single issue, one bulk issue, and one revocation.
- [ ] Create or verify a Super Admin Firestore profile with `role: "superadmin"`.
- [ ] Create one active organization for the demo.
- [ ] Create one active Org Admin assigned to the demo organization.
- [ ] Create one active Teacher assigned to the demo organization.
- [ ] Create one Student account whose email will receive at least one certificate.
- [ ] Prepare one single certificate data set with realistic name, email, course, date, grade/result, instructor, and remarks.
- [ ] Prepare one CSV for bulk issuance with 3-5 rows, including at least one row for the demo student.
- [ ] Keep a written list of demo account emails only; do not put passwords, wallet private keys, API keys, or JWTs in this checklist.

Expected result:
- Demo users can sign in by role.
- The organization, teacher, and student records are visible in the right dashboards.
- Live demo certificates are created through app flows, not only by seeded placeholder records.

## RBAC Smoke Testing

Run these checks in a fresh browser session or incognito window for each role. Use direct URLs as well as normal navigation because protected route behavior matters in a portfolio demo.

### Super Admin

- [ ] Sign in as Super Admin at `/login`.
  - Expected: user lands on or can open `/admin`; no permission error appears.
- [ ] Open `/admin/organizations`.
  - Expected: organization list loads.
- [ ] Open `/admin/create-organization`.
  - Expected: organization creation form is accessible.
- [ ] Open `/admin/org-admins`.
  - Expected: org admin list loads.
- [ ] Open `/admin/create-org-admin`.
  - Expected: org admin creation form is accessible.
- [ ] Try opening `/dashboard`, `/org-admin`, and `/student`.
  - Expected: protected route blocks or redirects because the role is not Teacher, Org Admin, or Student.

### Org Admin

- [ ] Sign in as Org Admin.
  - Expected: `/dashboard` redirects to `/org-admin` or Org Admin dashboard opens directly.
- [ ] Open `/org-admin`.
  - Expected: organization summary loads for the assigned organization.
- [ ] Open `/org-admin/teachers`.
  - Expected: teacher list is scoped to the Org Admin organization.
- [ ] Open `/org-admin/create-teacher`.
  - Expected: teacher creation form is accessible.
- [ ] Try opening `/admin`.
  - Expected: protected route blocks Super Admin pages.
- [ ] Try opening `/dashboard/issue`.
  - Expected: protected route blocks Teacher-only issue page.

### Teacher

- [ ] Sign in as Teacher.
  - Expected: `/dashboard` opens the Teacher dashboard.
- [ ] Open `/dashboard/issue`.
  - Expected: single certificate issue form is accessible.
- [ ] Open `/dashboard/bulk-issue`.
  - Expected: bulk issue form is accessible.
- [ ] Open `/dashboard/certificates`.
  - Expected: certificates issued by this teacher load.
- [ ] Try opening `/admin` and `/org-admin`.
  - Expected: protected route blocks admin-only pages.

### Student

- [ ] Sign in as Student.
  - Expected: `/student` opens the student dashboard.
- [ ] Confirm certificates are filtered by the student email.
  - Expected: student sees only certificates issued to their email address.
- [ ] Try opening `/admin`, `/org-admin`, and `/dashboard`.
  - Expected: protected route blocks admin and teacher pages.

### Public Verifier

- [ ] Sign out completely.
- [ ] Open `/verify/<validCertificateId>` directly.
  - Expected: public verification page loads without login.
- [ ] Open `/verify/<missingCertificateId>` directly.
  - Expected: page shows an unable-to-verify or not-found state without crashing.
- [ ] Refresh `/verify/<validCertificateId>`.
  - Expected: route still loads through SPA fallback.

## Single Certificate Issuance Testing

Use the Teacher account and a real Student email.

- [ ] Open `/dashboard/issue`.
- [ ] Fill required certificate fields: student name, student email, course/certificate name, issue date, and display metadata.
- [ ] Submit the certificate.
  - Expected: confirmation dialog warns that blockchain proof will be created.
- [ ] Confirm submission.
  - Expected: loading state mentions blockchain transaction submission.
- [ ] Wait for result toast.
  - Expected: success toast includes certificate creation confirmation; failures are readable and do not leave the UI stuck.
- [ ] Open `/dashboard/certificates`.
  - Expected: new certificate appears with `status: issued`.
- [ ] Confirm blockchain state.
  - Expected: `blockchainStatus` is `confirmed` for a live successful transaction, with a transaction hash link.
- [ ] Confirm IPFS state.
  - Expected: `ipfsStatus` is `uploaded` when Pinata succeeds, with an IPFS link; if Pinata fails, the app shows `failed` clearly without breaking certificate creation.
- [ ] Confirm email state.
  - Expected: `emailStatus` is `sent` when SendGrid succeeds, or `failed` with a clear status if email is unavailable.
- [ ] Copy or open the public verify link.
  - Expected: `/verify/<certificateId>` loads the issued certificate.
- [ ] Download certificate PDF.
  - Expected: PDF downloads with student, course, organization, issue date, QR/verification URL, and status details.
- [ ] Sign in as the Student.
  - Expected: the certificate appears in `/student`.

## Bulk/Merkle Issuance Testing

Use a small CSV first, then a larger CSV if needed. Keep the demo below 10 rows so it remains understandable during a presentation.

- [ ] Open `/dashboard/bulk-issue`.
- [ ] Download or prepare a CSV with headers matching the UI expectations.
- [ ] If using `demo-data/demo-bulk-certificates.csv`, replace the first data row's `studentEmail` with the controlled Student inbox before upload.
- [ ] Include 3-5 rows with realistic student names, student emails, course names, and dates.
- [ ] Upload/paste the CSV.
  - Expected: rows parse cleanly; invalid rows are called out before submission.
- [ ] Review the preview count.
  - Expected: count matches the CSV row count.
- [ ] Submit bulk issuance.
  - Expected: confirmation dialog explains that one Merkle root will be anchored on-chain.
- [ ] Confirm submission.
  - Expected: loading state mentions anchoring the Merkle root.
- [ ] Wait for result toast.
  - Expected: success toast includes batch ID, count, and blockchain status.
- [ ] Open `/dashboard/certificates`.
  - Expected: all bulk certificates appear with `issuanceMode: bulk`.
- [ ] Inspect one bulk certificate.
  - Expected: it has `batchId`, `batchRoot`, `batchIndex`, `batchProof`, and `batchSize`.
- [ ] Open a bulk certificate public verify page.
  - Expected: page verifies the Merkle proof and shows the batch as anchored when blockchain read succeeds.
- [ ] Confirm only one blockchain transaction was needed for the batch.
  - Expected: all certificates in the batch share the same batch transaction hash/root.
- [ ] Sign in as a Student whose email was in the CSV.
  - Expected: their bulk-issued certificate appears on `/student`.

## Public Verification Testing

Test public verification with signed-out browser state.

- [ ] Open a live single certificate URL: `/verify/<singleCertificateId>`.
  - Expected: certificate details load, Firestore status is visible, blockchain result is verified/confirmed, hash match is positive, and revocation shows not revoked.
- [ ] Open a live bulk certificate URL: `/verify/<bulkCertificateId>`.
  - Expected: certificate details load, Merkle proof is valid, batch root matches on-chain batch, and revocation shows not revoked.
- [ ] Open a seeded placeholder certificate URL, if demo seed was used.
  - Expected: Firestore data may load, but live blockchain verification may fail or show unavailable because seeded demo hashes are placeholders.
- [ ] Open a fake certificate ID.
  - Expected: unable-to-verify state appears without exposing stack traces.
- [ ] Temporarily test with a poor network connection or blocked RPC if practical.
  - Expected: Firestore certificate data remains readable and blockchain failure state is understandable.
- [ ] Click transaction hash link.
  - Expected: opens the correct Polygon Amoy explorer URL.
- [ ] Click IPFS gateway link when present.
  - Expected: metadata opens or gateway failure is external, not an app crash.
- [ ] Copy proof values or share link if the UI exposes copy actions.
  - Expected: copied values match the visible certificate ID/hash/link.

## Revocation Testing

Use a live blockchain-confirmed certificate that is safe to invalidate. Revocation is irreversible.

- [ ] In Teacher dashboard, choose a certificate with `blockchainStatus: confirmed`.
- [ ] Trigger revoke.
  - Expected: UI asks for confirmation or clearly communicates the seriousness of revocation.
- [ ] Confirm revoke.
  - Expected: app submits on-chain revocation and shows a loading state.
- [ ] Wait for completion.
  - Expected: success toast includes revoke transaction hash when available.
- [ ] Reopen `/dashboard/certificates`.
  - Expected: certificate shows `status: revoked` and `blockchainRevocationStatus: confirmed`.
- [ ] Open the public verify page.
  - Expected: hero/status clearly shows revoked and does not present the certificate as valid.
- [ ] Sign in as the Student.
  - Expected: student dashboard shows revoked status for the certificate.
- [ ] Try revoking the same certificate again.
  - Expected: app prevents duplicate revocation or backend returns a clear already-revoked error.
- [ ] Try revoking a pending/failed blockchain certificate.
  - Expected: UI blocks it with "Only blockchain-confirmed certificates can be revoked."

## Production Deployment Smoke Testing

Run this after deploying the frontend to Vercel and Firebase Functions to the intended Firebase project.

- [ ] Open production `/login`.
  - Expected: login page loads with no console errors related to missing Firebase config.
- [ ] Refresh these production routes directly:
  - [ ] `/login`
  - [ ] `/register`
  - [ ] `/admin`
  - [ ] `/org-admin`
  - [ ] `/dashboard`
  - [ ] `/student`
  - [ ] `/verify/<validCertificateId>`
  - Expected: Vercel SPA fallback serves the app instead of a 404.
- [ ] Sign in as each role on production.
  - Expected: each role lands in the correct dashboard.
- [ ] Issue one single certificate on production.
  - Expected: Firebase Function call succeeds and Firestore updates.
- [ ] Issue one small bulk batch on production.
  - Expected: one batch root transaction succeeds.
- [ ] Open public verification from production URL while signed out.
  - Expected: verification works without auth.
- [ ] Check browser console.
  - Expected: no red errors during the happy path.
- [ ] Check Firebase Functions logs.
  - Expected: no unhandled errors for issue, bulk issue, email, IPFS, or revocation calls.
- [ ] Confirm production URL is used in certificate emails and QR links.
  - Expected: links point to the deployed frontend, not localhost.

## Mobile QR Verification Testing

Use a real phone camera and the production or local network URL that the phone can reach.

- [ ] Generate/download a certificate PDF with QR code.
- [ ] Scan QR using iPhone Camera app.
  - Expected: opens `/verify/<certificateId>` in the mobile browser.
- [ ] Scan QR using Android Camera or Google Lens.
  - Expected: opens the same public verification URL.
- [ ] Test QR from printed PDF or another screen.
  - Expected: QR is readable without zooming excessively.
- [ ] Open the public verification page on mobile.
  - Expected: hero, status cards, certificate details, and action buttons fit without horizontal scrolling.
- [ ] Test a revoked certificate on mobile.
  - Expected: revoked state is obvious above the fold.
- [ ] Test a bulk/Merkle certificate on mobile.
  - Expected: Merkle/batch status remains understandable and does not overflow.
- [ ] Test poor mobile network.
  - Expected: loading and failure states are readable; app does not show a blank page.

## Environment Variable Cleanup Checklist

Do not paste real values into this file, screenshots, README updates, LinkedIn posts, or ChatGPT prompts.

- [ ] Confirm `blockchain/.env` exists only locally and is ignored by git.
- [ ] Confirm no wallet private key is committed.
- [ ] Confirm no Firebase service account JSON is committed.
- [ ] Confirm no Pinata JWT is committed.
- [ ] Confirm no SendGrid API key is committed.
- [ ] Confirm Firebase Functions secrets are set for:
  - [ ] `BLOCKCHAIN_RPC_URL`
  - [ ] `BLOCKCHAIN_PRIVATE_KEY`
  - [ ] `CERTIFICATE_REGISTRY_ADDRESS`
  - [ ] `BLOCKCHAIN_CHAIN_ID`
  - [ ] `PINATA_JWT`
- [ ] Confirm SendGrid handling before demo.
  - Expected: if the app expects `SENDGRID_API_KEY`, it is configured in the Functions runtime environment used by the deployed function.
- [ ] Confirm frontend public Firebase config is acceptable to expose.
  - Expected: only Firebase web app config is present, not admin credentials.
- [ ] Search the repo before publishing:
  - [ ] `PRIVATE_KEY`
  - [ ] `PINATA`
  - [ ] `SENDGRID`
  - [ ] `JWT`
  - [ ] `serviceAccount`
  - [ ] `AIza`
  - Expected: any real secret-like result is reviewed before posting or committing.
- [ ] Confirm screenshots do not expose private emails, API responses containing secrets, wallet private keys, or Firebase console secret pages.

## Portfolio Screenshot Checklist

Capture clean, high-resolution screenshots with demo-safe data. Prefer production URL for public-facing screenshots and avoid browser extensions/toolbars.

- [ ] Login page.
  - Expected: polished first impression, no debug text.
- [ ] Super Admin overview.
  - Expected: organization/user management value is clear.
- [ ] Organization list/create organization view.
  - Expected: shows admin-level control without exposing sensitive data.
- [ ] Org Admin overview.
  - Expected: organization-scoped management is clear.
- [ ] Teacher management view.
  - Expected: active/revoked teacher states are visible if useful.
- [ ] Teacher dashboard overview.
  - Expected: certificate counts and trust statuses are visible.
- [ ] Single certificate issue form.
  - Expected: form looks complete and professional.
- [ ] Bulk/Merkle issue form with parsed CSV preview.
  - Expected: Merkle/gas-saving story is visually understandable.
- [ ] Certificate table with confirmed blockchain and IPFS badges.
  - Expected: status chips and transaction/IPFS links are visible.
- [ ] Student dashboard.
  - Expected: certificate wallet view is clear.
- [ ] Public verification page for a valid single certificate.
  - Expected: "verified" status is obvious.
- [ ] Public verification page for a bulk/Merkle certificate.
  - Expected: batch/Merkle proof status is visible.
- [ ] Public verification page for a revoked certificate.
  - Expected: revoked state is visually clear.
- [ ] Certificate PDF preview/download.
  - Expected: QR code, student name, certificate title, and verification URL are readable.
- [ ] Polygon Amoy explorer transaction page.
  - Expected: transaction hash and contract interaction are visible without wallet/private data.
- [ ] IPFS metadata page.
  - Expected: certificate metadata is visible and demo-safe.

## LinkedIn Carousel Asset Checklist

Carousel assets live in `linkedin-carousel/` plus `linkedin-carousel-slide-1.html`. Treat these as portfolio assets and keep them in version control with their referenced screenshots.

- [ ] Open `linkedin-carousel/index.html`.
  - Expected: preview page shows all eight slide iframes.
- [ ] Open each slide directly:
  - [ ] `linkedin-carousel/slide-1.html`
  - [ ] `linkedin-carousel/slide-2.html`
  - [ ] `linkedin-carousel/slide-3.html`
  - [ ] `linkedin-carousel/slide-4.html`
  - [ ] `linkedin-carousel/slide-5.html`
  - [ ] `linkedin-carousel/slide-6.html`
  - [ ] `linkedin-carousel/slide-7.html`
  - [ ] `linkedin-carousel/slide-8.html`
  - Expected: each slide renders at 1080x1080 without clipped text.
- [ ] Add real screenshot image files referenced by slide 7:
  - [ ] `linkedin-carousel/Dashboard.png`
  - [ ] `linkedin-carousel/Issue.png`
  - [ ] `linkedin-carousel/PublicVerify.png`
  - [ ] `linkedin-carousel/Certificate.png`
  - Expected: slide 7 shows actual product screenshots instead of broken images.
- [ ] Review team names and university text.
  - Expected: spelling and titles are final.
- [ ] Review slide copy for accuracy.
  - Expected: claims match the implemented app: Firebase, Firestore, Functions, Polygon Amoy, IPFS/Pinata, QR verification, Merkle batch issuance.
- [ ] Export each slide as a 1080x1080 PNG.
  - Expected: PNGs are crisp and readable on LinkedIn mobile.
- [ ] Check the carousel in LinkedIn upload preview.
  - Expected: slide order is correct and first slide works as a strong cover.
- [ ] Keep secrets out of screenshots.
  - Expected: no console logs, API keys beyond public Firebase config, wallet details, or private emails unless intentionally demo-safe.

## Final Demo Run Order

- [ ] Super Admin: show organization and org admin management.
- [ ] Org Admin: show teacher management.
- [ ] Teacher: issue one single certificate.
- [ ] Teacher: issue one small bulk/Merkle batch.
- [ ] Student: show received certificate wallet.
- [ ] Public Verifier: scan QR and verify single certificate.
- [ ] Public Verifier: verify bulk certificate and explain one transaction per batch.
- [ ] Teacher: revoke one certificate.
- [ ] Public Verifier: refresh verification page and show revoked state.
- [ ] Portfolio close: show README, architecture diagram, Polygon Amoy transaction, and carousel screenshots.
