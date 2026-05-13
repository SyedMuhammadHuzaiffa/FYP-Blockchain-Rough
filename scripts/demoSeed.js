#!/usr/bin/env node

const path = require("path");

let admin;

try {
  admin = require("firebase-admin");
} catch (error) {
  admin = require(path.join(
    __dirname,
    "../functions/node_modules/firebase-admin",
  ));
}

const {
  computeCertificateHash,
} = require("../functions/blockchain/certificateHash");
const { buildMerkleBatch } = require("../functions/blockchain/merkleBatch");

const DEMO_PREFIX = "DEMO";
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || "DemoPass123!";
const DEMO_ORG_ID = "DEMO_ORG_FINAL_YEAR_UNIVERSITY";
const DEMO_BATCH_ID = "DEMO_BATCH_BLOCKCHAIN_WORKSHOP";
const now = admin.firestore.FieldValue.serverTimestamp;

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

async function getOrCreateUser({ email, password, displayName }) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") {
      throw error;
    }

    return admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
  }
}

async function seedProfile({ uid, email, name, role, status = "active" }) {
  await db.collection("users").doc(uid).set(
    {
      uid,
      email,
      name,
      role,
      status,
      organizationId:
        role === "superadmin" || role === "student" ? null : DEMO_ORG_ID,
      demoSeed: true,
      demoSeedKey: `${DEMO_PREFIX}_${role}`,
      updatedAt: now(),
      createdAt: now(),
    },
    { merge: true },
  );
}

function buildCertificate({
  certificateId,
  studentName,
  studentEmail,
  courseName,
  issueDate,
  teacher,
  organizationName,
  displayMetadata = {},
}) {
  const certificateData = {
    certificateId,
    studentName,
    studentEmail,
    courseName,
    issueDate,
    organizationId: DEMO_ORG_ID,
    organizationName,
    issuedBy: teacher.uid,
    issuedByEmail: teacher.email,
  };

  return {
    ...certificateData,
    ...displayMetadata,
    certificateHash: computeCertificateHash(certificateData),
    status: "issued",
    blockchainStatus: "confirmed",
    blockchainTxHash: "DEMO_TX_HASH_NOT_ON_CHAIN",
    blockchainChainId: "80002",
    contractAddress: "DEMO_CONTRACT_ADDRESS",
    ipfsStatus: "uploaded",
    ipfsCid: "DEMO_IPFS_CID",
    emailStatus: "sent",
    demoSeed: true,
    updatedAt: now(),
    createdAt: now(),
  };
}

async function main() {
  const organizationName = "DEMO Final Year University";
  const orgAdmin = await getOrCreateUser({
    email: "demo.orgadmin@example.edu",
    password: DEMO_PASSWORD,
    displayName: "DEMO Org Admin",
  });
  const teacher = await getOrCreateUser({
    email: "demo.teacher@example.edu",
    password: DEMO_PASSWORD,
    displayName: "DEMO Teacher",
  });
  const student = await getOrCreateUser({
    email: "demo.student@example.edu",
    password: DEMO_PASSWORD,
    displayName: "DEMO Student",
  });

  await seedProfile({
    uid: orgAdmin.uid,
    email: orgAdmin.email,
    name: "DEMO Org Admin",
    role: "orgAdmin",
  });
  await seedProfile({
    uid: teacher.uid,
    email: teacher.email,
    name: "DEMO Teacher",
    role: "teacher",
  });
  await seedProfile({
    uid: student.uid,
    email: student.email,
    name: "DEMO Student",
    role: "student",
  });

  await db.collection("organizations").doc(DEMO_ORG_ID).set(
    {
      name: organizationName,
      status: "active",
      orgAdminIds: [orgAdmin.uid],
      demoSeed: true,
      updatedAt: now(),
      createdAt: now(),
    },
    { merge: true },
  );

  const sharedDisplayMetadata = {
    certificateTitle: "Certificate of Achievement",
    certificateSubtitle: "This is proudly presented to",
    description:
      "For successfully completing the Blockchain Certificate Verification final-year project demo.",
    gradeOrResult: "Distinction",
    duration: "Spring 2026",
    venue: "Computer Science Department",
    instructorName: "DEMO Teacher",
    remarks: "Issued for demonstration and testing only.",
    certificateDesign: "premiumGold",
    aiDesignPrompt: "formal university gold certificate with elegant border",
    aiDesignSuggestion: {
      themeName: "Premium Gold",
      palette: "ivory, charcoal, warm gold",
      borderStyle: "double line",
      typographyStyle: "classic serif",
      layoutStyle: "formal academic",
      design: "premiumGold",
      accent: "gold",
      tone: "academic",
    },
  };

  const certificates = [
    buildCertificate({
      certificateId: "DEMO-CERT-SINGLE-001",
      studentName: "DEMO Student",
      studentEmail: "demo.student@example.edu",
      courseName: "Blockchain Certificate Verification",
      issueDate: "2026-05-13",
      teacher,
      organizationName,
      displayMetadata: sharedDisplayMetadata,
    }),
    buildCertificate({
      certificateId: "DEMO-CERT-BULK-001",
      studentName: "DEMO Ayesha Khan",
      studentEmail: "demo.ayesha@example.edu",
      courseName: "Merkle Proof Workshop",
      issueDate: "2026-05-13",
      teacher,
      organizationName,
      displayMetadata: {
        ...sharedDisplayMetadata,
        certificateDesign: "cleanBlue",
        gradeOrResult: "Completed",
      },
    }),
    buildCertificate({
      certificateId: "DEMO-CERT-BULK-002",
      studentName: "DEMO Ali Raza",
      studentEmail: "demo.ali@example.edu",
      courseName: "Merkle Proof Workshop",
      issueDate: "2026-05-13",
      teacher,
      organizationName,
      displayMetadata: {
        ...sharedDisplayMetadata,
        certificateDesign: "modernMinimal",
        gradeOrResult: "Completed",
      },
    }),
  ];
  const bulkCertificates = certificates.slice(1);
  const merkleBatch = buildMerkleBatch(
    bulkCertificates.map((certificate) => certificate.certificateHash),
  );

  await db.collection("certificates").doc(certificates[0].certificateId).set(
    {
      ...certificates[0],
      issuanceMode: "single",
    },
    { merge: true },
  );

  await Promise.all(
    bulkCertificates.map((certificate, index) =>
      db.collection("certificates").doc(certificate.certificateId).set(
        {
          ...certificate,
          batchId: DEMO_BATCH_ID,
          batchRoot: merkleBatch.root,
          batchIndex: index,
          batchProof: merkleBatch.proofs[index],
          batchSize: merkleBatch.size,
          issuanceMode: "bulk",
        },
        { merge: true },
      ),
    ),
  );

  await db.collection("certificateBatches").doc(DEMO_BATCH_ID).set(
    {
      batchId: DEMO_BATCH_ID,
      organizationId: DEMO_ORG_ID,
      organizationName,
      issuedBy: teacher.uid,
      issuedByEmail: teacher.email,
      batchRoot: merkleBatch.root,
      certificateIds: bulkCertificates.map(
        (certificate) => certificate.certificateId,
      ),
      count: bulkCertificates.length,
      status: "created",
      blockchainStatus: "confirmed",
      blockchainTxHash: "DEMO_BATCH_TX_HASH_NOT_ON_CHAIN",
      demoSeed: true,
      updatedAt: now(),
      createdAt: now(),
    },
    { merge: true },
  );

  console.log("Demo seed completed.");
  console.log(`Organization: ${DEMO_ORG_ID}`);
  console.log("Users:");
  console.log(`- ${orgAdmin.email}`);
  console.log(`- ${teacher.email}`);
  console.log(`- ${student.email}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error("Demo seed failed:", error);
  process.exitCode = 1;
});
