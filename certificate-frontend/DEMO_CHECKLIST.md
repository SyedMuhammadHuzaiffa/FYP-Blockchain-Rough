# Production Deployment And Demo Checklist

## Frontend Deployment Readiness

- Frontend app: `certificate-frontend/`
- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Hosting target: Vercel is the recommended frontend host for this project.
- Firebase Hosting: not configured in the root `firebase.json`; it currently contains Functions configuration only.
- Backend deploy required for frontend release: no.
- SPA refresh support: `vercel.json` rewrites all routes to `/index.html`.

## Vercel Deployment Steps

1. Push the current repository to GitHub.
2. In Vercel, create a new project from the repository.
3. Set the project root directory to `certificate-frontend`.
4. Keep the framework preset as `Vite`.
5. Confirm the build command is `npm run build`.
6. Confirm the output directory is `dist`.
7. Do not add private keys, service account JSON, wallet keys, or Firebase admin secrets to Vercel.
8. Add only required public Vite variables if future frontend code uses them, and keep the `VITE_` prefix.
9. Deploy the frontend only. Do not redeploy Firebase Functions or blockchain contracts for this step.
10. After deploy, open each public URL directly in a new tab to confirm refresh behavior.

## Route Refresh Checklist

- [ ] `/login`
- [ ] `/register`
- [ ] `/admin`
- [ ] `/dashboard`
- [ ] `/student`
- [ ] `/verify/<certificateId>`

## Demo Flow Checklist

- [ ] SuperAdmin login.
- [ ] Create organization.
- [ ] Create org admin.
- [ ] Org admin login.
- [ ] Create teacher.
- [ ] Teacher login.
- [ ] Issue certificate.
- [ ] Confirm blockchain transaction success.
- [ ] Verify via QR/public certificate page.
- [ ] Student wallet login.
- [ ] Confirm issued certificate appears in student wallet.
- [ ] Revoke certificate.
- [ ] Verify revoked state on public certificate page.

## Demo Notes

- Use a real deployed certificate ID for `/verify/<certificateId>`.
- Keep the Polygon Amoy wallet funded before the demo.
- Keep Firebase Auth test accounts ready for SuperAdmin, OrgAdmin, Teacher, and Student.
- Public verification should not require login.
- If blockchain RPC is temporarily unavailable, the public page should still show Firestore certificate data and a blockchain check failure state.
