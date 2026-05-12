const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const {
  computeCertificateHash,
} = require("./blockchain/certificateHash");
const { buildMerkleBatch } = require("./blockchain/merkleBatch");
const {
  anchorBatchOnChain,
  anchorCertificateOnChain,
  revokeCertificateOnChain,
} = require("./blockchain/certificateRegistry");
const {
  sendCertificateEmail,
} = require("./email/certificateEmail");
const {
  uploadCertificateMetadataToIpfs,
} = require("./ipfs/pinata");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const REGION = "us-central1";
const FROM_EMAIL = "syed.huzaiffaxd@gmail.com";
const FROM_NAME = "Blockchain Certificate System";
const BLOCKCHAIN_RPC_URL = defineSecret("BLOCKCHAIN_RPC_URL");
const BLOCKCHAIN_PRIVATE_KEY = defineSecret("BLOCKCHAIN_PRIVATE_KEY");
const CERTIFICATE_REGISTRY_ADDRESS = defineSecret(
  "CERTIFICATE_REGISTRY_ADDRESS",
);
const BLOCKCHAIN_CHAIN_ID = defineSecret("BLOCKCHAIN_CHAIN_ID");
const PINATA_JWT = defineSecret("PINATA_JWT");
const MAX_BULK_CERTIFICATES = 200;

// =============================
// HELPERS
// =============================
async function requireSuperAdmin(request) {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const callerUid = auth.uid;
  const callerDoc = await db.collection("users").doc(callerUid).get();

  if (!callerDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile missing in Firestore",
    );
  }

  const callerData = callerDoc.data();

  if (callerData?.role !== "superadmin") {
    throw new HttpsError(
      "permission-denied",
      "Only superadmin can perform this action",
    );
  }

  return {
    uid: callerUid,
    email: callerData.email || null,
  };
}

async function requireOrgAdmin(request) {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const callerUid = auth.uid;
  const callerDoc = await db.collection("users").doc(callerUid).get();

  if (!callerDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile missing in Firestore",
    );
  }

  const callerData = callerDoc.data();

  if (callerData?.role !== "orgAdmin" || callerData?.status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "Only active organization admins can perform this action",
    );
  }

  if (!callerData?.organizationId) {
    throw new HttpsError(
      "failed-precondition",
      "Organization admin is not assigned to an organization",
    );
  }

  const orgRef = db.collection("organizations").doc(callerData.organizationId);
  const orgDoc = await orgRef.get();

  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found");
  }

  const orgData = orgDoc.data();

  if (orgData?.status === "inactive") {
    throw new HttpsError(
      "failed-precondition",
      "Cannot manage teachers for an inactive organization",
    );
  }

  return {
    uid: callerUid,
    email: callerData.email || auth.token?.email || null,
    organizationId: callerData.organizationId,
    organizationName: orgData?.name || "",
  };
}

async function requireActiveTeacher(request) {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const callerUid = auth.uid;
  const callerDoc = await db.collection("users").doc(callerUid).get();

  if (!callerDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile missing in Firestore",
    );
  }

  const callerData = callerDoc.data();

  if (callerData?.role !== "teacher" || callerData?.status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "Only active teachers can issue or revoke certificates",
    );
  }

  if (!callerData?.organizationId) {
    throw new HttpsError(
      "failed-precondition",
      "Teacher is not assigned to an organization",
    );
  }

  return {
    uid: callerUid,
    email: callerData.email || auth.token?.email || null,
    organizationId: callerData.organizationId,
  };
}

async function getActiveOrganization(organizationId) {
  const orgRef = db.collection("organizations").doc(organizationId);
  const orgDoc = await orgRef.get();

  if (!orgDoc.exists) {
    throw new HttpsError("not-found", "Organization not found");
  }

  const orgData = orgDoc.data();

  if (orgData?.status === "inactive") {
    throw new HttpsError(
      "failed-precondition",
      "Cannot issue certificates for an inactive organization",
    );
  }

  return {
    id: organizationId,
    name: orgData?.name || "",
  };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function cleanName(name) {
  return typeof name === "string" ? name.trim() : "";
}

function timestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function addAdminLog(batch, payload) {
  const logRef = db.collection("adminLogs").doc();

  batch.set(logRef, {
    ...payload,
    createdAt: timestamp(),
  });
}

function getBlockchainConfig() {
  return {
    rpcUrl: BLOCKCHAIN_RPC_URL.value(),
    privateKey: BLOCKCHAIN_PRIVATE_KEY.value(),
    contractAddress: CERTIFICATE_REGISTRY_ADDRESS.value(),
    chainId: BLOCKCHAIN_CHAIN_ID.value(),
  };
}

function getErrorMessage(error) {
  const message =
    error?.shortMessage || error?.reason || error?.message || String(error);

  return message.length > 1000 ? `${message.slice(0, 1000)}...` : message;
}

function getVerificationBaseUrl(request) {
  return (
    request.rawRequest?.headers?.origin ||
    process.env.FRONTEND_BASE_URL ||
    ""
  );
}

async function sendAndRecordCertificateEmail({
  certificateRef,
  certificate,
  verificationBaseUrl,
}) {
  try {
    await sendCertificateEmail({
      certificate,
      verificationBaseUrl,
    });

    try {
      await certificateRef.update({
        emailStatus: "sent",
        emailSentAt: timestamp(),
        emailError: null,
        updatedAt: timestamp(),
      });
    } catch (recordError) {
      console.error("Failed to record sent certificate email:", recordError);
    }

    return {
      status: "sent",
      error: null,
    };
  } catch (error) {
    const emailError = getErrorMessage(error);

    console.error("sendCertificateEmail error:", error);

    try {
      await certificateRef.update({
        emailStatus: "failed",
        emailSentAt: null,
        emailError,
        updatedAt: timestamp(),
      });
    } catch (recordError) {
      console.error("Failed to record failed certificate email:", recordError);
    }

    return {
      status: "failed",
      error: emailError,
    };
  }
}

async function uploadAndRecordCertificateMetadata({
  certificateRef,
  certificate,
  verificationBaseUrl,
  createdAtIso,
}) {
  try {
    const ipfsResult = await uploadCertificateMetadataToIpfs(certificate, {
      pinataJwt: PINATA_JWT.value(),
      verificationBaseUrl,
      createdAtIso,
    });

    try {
      await certificateRef.update({
        ipfsStatus: "uploaded",
        ipfsCid: ipfsResult.ipfsCid,
        ipfsGatewayUrl: ipfsResult.ipfsGatewayUrl,
        ipfsProvider: ipfsResult.ipfsProvider,
        ipfsUploadedAt: timestamp(),
        ipfsError: null,
        updatedAt: timestamp(),
      });
    } catch (recordError) {
      console.error("Failed to record uploaded IPFS metadata:", recordError);
    }

    return {
      status: "uploaded",
      ...ipfsResult,
      error: null,
    };
  } catch (error) {
    const ipfsError = getErrorMessage(error);

    console.error("uploadCertificateMetadataToIpfs error:", error);

    try {
      await certificateRef.update({
        ipfsStatus: "failed",
        ipfsError,
        ipfsUploadedAt: null,
        updatedAt: timestamp(),
      });
    } catch (recordError) {
      console.error("Failed to record failed IPFS metadata upload:", recordError);
    }

    return {
      status: "failed",
      ipfsCid: null,
      ipfsGatewayUrl: null,
      ipfsProvider: null,
      error: ipfsError,
    };
  }
}

// =============================
// CREATE STUDENT PROFILE
// =============================
exports.createStudentProfile = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "User must be logged in to create a student profile",
        );
      }

      const uid = request.auth.uid;
      const { name } = request.data ?? {};
      const normalizedName = cleanName(name);
      const authUser = await admin.auth().getUser(uid);
      const normalizedEmail = normalizeEmail(
        authUser.email || request.auth.token?.email,
      );

      if (!normalizedEmail) {
        throw new HttpsError(
          "failed-precondition",
          "Authenticated user email is missing",
        );
      }

      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const existingData = userDoc.data();

        if (existingData?.role && existingData.role !== "student") {
          throw new HttpsError(
            "failed-precondition",
            "A non-student profile already exists for this account",
          );
        }
      }

      const profile = {
        uid,
        email: normalizedEmail,
        role: "student",
        status: "active",
        updatedAt: timestamp(),
      };

      if (normalizedName) {
        profile.name = normalizedName;
      }

      if (!userDoc.exists) {
        profile.createdAt = timestamp();
      }

      const batch = db.batch();

      batch.set(userRef, profile, { merge: true });

      if (!userDoc.exists) {
        addAdminLog(batch, {
          action: "CREATE_STUDENT_PROFILE",
          performedBy: uid,
          performedByEmail: normalizedEmail,
          targetUser: uid,
          targetEmail: normalizedEmail,
          metadata: {
            source: "public_registration",
          },
        });
      }

      await batch.commit();

      return {
        success: true,
        uid,
        email: normalizedEmail,
        role: "student",
        status: "active",
      };
    } catch (error) {
      console.error("createStudentProfile error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "internal",
        "Server error while creating student profile",
      );
    }
  },
);

async function sendOrgAdminInviteEmail({
  to,
  name,
  passwordResetLink,
  organizationName,
}) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME,
    },
    subject: "Set your password - Blockchain Certificate System",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to Blockchain Certificate System</h2>

        <p>Hello ${name || "Admin"},</p>

        <p>Your organization admin account has been created${
          organizationName ? ` for <strong>${organizationName}</strong>` : ""
        }.</p>

        <p><strong>Email:</strong> ${to}</p>

        <p>Please click the button below to set your password:</p>

        <p>
          <a href="${passwordResetLink}"
            style="
              display: inline-block;
              padding: 10px 16px;
              background: #0f172a;
              color: white;
              text-decoration: none;
              border-radius: 6px;
            ">
            Set Password
          </a>
        </p>

        <p>If the button does not work, copy and paste this link into your browser:</p>

        <p style="word-break: break-all;">${passwordResetLink}</p>

        <hr />

        <p style="font-size: 12px; color: #666;">
          This email was sent for account setup. If you did not expect this email, you can ignore it.
        </p>
      </div>
    `,
  });
}

async function sendTeacherInviteEmail({
  to,
  name,
  passwordResetLink,
  organizationName,
}) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  await sgMail.send({
    to,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME,
    },
    subject: "Teacher account invite - Blockchain Certificate System",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to Blockchain Certificate System</h2>

        <p>Hello ${name || "Teacher"},</p>

        <p>Your teacher account has been created${
          organizationName ? ` for <strong>${organizationName}</strong>` : ""
        }.</p>

        <p><strong>Email:</strong> ${to}</p>

        <p>Please click the button below to set your password:</p>

        <p>
          <a href="${passwordResetLink}"
            style="
              display: inline-block;
              padding: 10px 16px;
              background: #0f172a;
              color: white;
              text-decoration: none;
              border-radius: 6px;
            ">
            Set Password
          </a>
        </p>

        <p>If the button does not work, copy and paste this link into your browser:</p>

        <p style="word-break: break-all;">${passwordResetLink}</p>

        <hr />

        <p style="font-size: 12px; color: #666;">
          This email was sent for account setup. If you did not expect this email, you can ignore it.
        </p>
      </div>
    `,
  });
}

// =============================
// CREATE ORGANIZATION
// =============================
exports.createOrganization = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request) => {
    try {
      const caller = await requireSuperAdmin(request);
      const { name } = request.data ?? {};

      if (typeof name !== "string" || !name.trim()) {
        throw new HttpsError(
          "invalid-argument",
          "Organization name is required",
        );
      }

      const organizationName = name.trim();
      const orgRef = db.collection("organizations").doc();
      const batch = db.batch();

      batch.set(orgRef, {
        name: organizationName,
        status: "active",
        createdBy: caller.uid,
        orgAdminIds: [],
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      addAdminLog(batch, {
        action: "CREATE_ORGANIZATION",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        orgId: orgRef.id,
        metadata: {
          organizationName,
        },
      });

      await batch.commit();

      return {
        success: true,
        orgId: orgRef.id,
        name: organizationName,
        message: "Organization created successfully",
      };
    } catch (error) {
      console.error("createOrganization error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "internal",
        "Server error while creating organization",
      );
    }
  },
);

// =============================
// CREATE ORG ADMIN
// =============================
exports.createOrgAdmin = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    secrets: ["SENDGRID_API_KEY"],
  },
  async (request) => {
    let createdUid;

    try {
      const caller = await requireSuperAdmin(request);

      const { name, email, password, orgId } = request.data ?? {};

      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof orgId !== "string" ||
        !email.trim() ||
        !password.trim?.() ||
        !orgId.trim()
      ) {
        throw new HttpsError(
          "invalid-argument",
          "email, password, and orgId are required",
        );
      }

      const normalizedEmail = normalizeEmail(email);
      const normalizedOrgId = orgId.trim();
      const normalizedName = cleanName(name);

      if (password.length < 6) {
        throw new HttpsError(
          "invalid-argument",
          "Password must be at least 6 characters",
        );
      }

      const orgRef = db.collection("organizations").doc(normalizedOrgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        throw new HttpsError("not-found", "Organization not found");
      }

      const orgData = orgDoc.data();
      const organizationName = orgData?.name || "";

      if (orgData?.status === "inactive") {
        throw new HttpsError(
          "failed-precondition",
          "Cannot add admin to inactive organization",
        );
      }

      try {
        await admin.auth().getUserByEmail(normalizedEmail);

        throw new HttpsError(
          "already-exists",
          "User already exists with this email",
        );
      } catch (e) {
        if (e instanceof HttpsError) throw e;

        if (e.code !== "auth/user-not-found") {
          console.error("Error checking existing user:", e);
          throw new HttpsError(
            "internal",
            "Could not check whether the user already exists",
          );
        }
      }

      const userRecord = await admin.auth().createUser({
        email: normalizedEmail,
        password,
        displayName: normalizedName || undefined,
        emailVerified: false,
        disabled: false,
      });

      createdUid = userRecord.uid;

      const passwordResetLink = await admin
        .auth()
        .generatePasswordResetLink(normalizedEmail);

      await sendOrgAdminInviteEmail({
        to: normalizedEmail,
        name: normalizedName,
        passwordResetLink,
        organizationName,
      });

      const batch = db.batch();
      const userRef = db.collection("users").doc(createdUid);

      batch.set(userRef, {
        uid: createdUid,
        name: normalizedName,
        email: normalizedEmail,
        role: "orgAdmin",
        status: "active",
        organizationId: normalizedOrgId,
        createdBy: caller.uid,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        passwordResetRequired: true,
        inviteEmailSent: true,
        inviteEmailSentAt: timestamp(),
      });

      batch.set(
        orgRef,
        {
          orgAdminIds: admin.firestore.FieldValue.arrayUnion(createdUid),
          updatedAt: timestamp(),
        },
        { merge: true },
      );

      addAdminLog(batch, {
        action: "CREATE_ORG_ADMIN",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetUser: createdUid,
        targetEmail: normalizedEmail,
        orgId: normalizedOrgId,
        metadata: {
          name: normalizedName,
          organizationName,
          inviteEmailSent: true,
        },
      });

      await batch.commit();

      return {
        success: true,
        uid: createdUid,
        email: normalizedEmail,
        orgId: normalizedOrgId,
        inviteEmailSent: true,
        message:
          "Organization admin created successfully and invite email sent",
      };
    } catch (error) {
      console.error("createOrgAdmin error:", error);

      if (createdUid && !(error instanceof HttpsError)) {
        await admin
          .auth()
          .deleteUser(createdUid)
          .catch((cleanupError) => {
            console.error("Failed to clean up Auth user:", cleanupError);
          });
      }

      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Server error while creating org admin");
    }
  },
);

// =============================
// REVOKE ORG ADMIN
// =============================
exports.revokeOrgAdmin = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request) => {
    try {
      const caller = await requireSuperAdmin(request);

      const { uid, orgId } = request.data ?? {};

      if (
        typeof uid !== "string" ||
        typeof orgId !== "string" ||
        !uid.trim() ||
        !orgId.trim()
      ) {
        throw new HttpsError("invalid-argument", "uid and orgId are required");
      }

      const targetUid = uid.trim();
      const normalizedOrgId = orgId.trim();

      if (targetUid === caller.uid) {
        throw new HttpsError(
          "failed-precondition",
          "You cannot revoke your own account",
        );
      }

      const userRef = db.collection("users").doc(targetUid);
      const orgRef = db.collection("organizations").doc(normalizedOrgId);

      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "User not found");
      }

      const userData = userDoc.data();

      if (userData?.role !== "orgAdmin") {
        throw new HttpsError(
          "failed-precondition",
          "Only org admins can be revoked using this action",
        );
      }

      const batch = db.batch();

      batch.set(
        userRef,
        {
          role: "revoked",
          status: "inactive",
          organizationId: null,
          revokedAt: timestamp(),
          revokedBy: caller.uid,
          updatedAt: timestamp(),
        },
        { merge: true },
      );

      batch.set(
        orgRef,
        {
          orgAdminIds: admin.firestore.FieldValue.arrayRemove(targetUid),
          updatedAt: timestamp(),
        },
        { merge: true },
      );

      addAdminLog(batch, {
        action: "REVOKE_ORG_ADMIN",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetUser: targetUid,
        targetEmail: userData?.email || null,
        orgId: normalizedOrgId,
      });

      await batch.commit();

      await admin.auth().updateUser(targetUid, {
        disabled: true,
      });

      return {
        success: true,
        uid: targetUid,
        orgId: normalizedOrgId,
        message: "Org admin revoked successfully",
      };
    } catch (error) {
      console.error("revokeOrgAdmin error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Server error while revoking org admin");
    }
  },
);

// =============================
// CREATE TEACHER
// =============================
exports.createTeacher = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    secrets: ["SENDGRID_API_KEY"],
  },
  async (request) => {
    let createdUid;

    try {
      const caller = await requireOrgAdmin(request);
      const { name, email, password } = request.data ?? {};

      if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !name.trim() ||
        !email.trim() ||
        !password.trim?.()
      ) {
        throw new HttpsError(
          "invalid-argument",
          "name, email, and password are required",
        );
      }

      const normalizedName = cleanName(name);
      const normalizedEmail = normalizeEmail(email);

      if (password.length < 6) {
        throw new HttpsError(
          "invalid-argument",
          "Password must be at least 6 characters",
        );
      }

      try {
        await admin.auth().getUserByEmail(normalizedEmail);

        throw new HttpsError(
          "already-exists",
          "User already exists with this email",
        );
      } catch (e) {
        if (e instanceof HttpsError) throw e;

        if (e.code !== "auth/user-not-found") {
          console.error("Error checking existing teacher:", e);
          throw new HttpsError(
            "internal",
            "Could not check whether the user already exists",
          );
        }
      }

      const userRecord = await admin.auth().createUser({
        email: normalizedEmail,
        password,
        displayName: normalizedName,
        emailVerified: false,
        disabled: false,
      });

      createdUid = userRecord.uid;

      const passwordResetLink = await admin
        .auth()
        .generatePasswordResetLink(normalizedEmail);

      await sendTeacherInviteEmail({
        to: normalizedEmail,
        name: normalizedName,
        passwordResetLink,
        organizationName: caller.organizationName,
      });

      const batch = db.batch();
      const userRef = db.collection("users").doc(createdUid);

      batch.set(userRef, {
        uid: createdUid,
        name: normalizedName,
        email: normalizedEmail,
        role: "teacher",
        status: "active",
        organizationId: caller.organizationId,
        createdBy: caller.uid,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        passwordResetRequired: true,
        inviteEmailSent: true,
        inviteEmailSentAt: timestamp(),
      });

      addAdminLog(batch, {
        action: "CREATE_TEACHER",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetUser: createdUid,
        targetEmail: normalizedEmail,
        orgId: caller.organizationId,
        metadata: {
          name: normalizedName,
          organizationName: caller.organizationName,
          inviteEmailSent: true,
        },
      });

      await batch.commit();

      return {
        success: true,
        uid: createdUid,
        email: normalizedEmail,
        orgId: caller.organizationId,
        inviteEmailSent: true,
        message: "Teacher created successfully and invite email sent",
      };
    } catch (error) {
      console.error("createTeacher error:", error);

      if (createdUid && !(error instanceof HttpsError)) {
        await admin
          .auth()
          .deleteUser(createdUid)
          .catch((cleanupError) => {
            console.error("Failed to clean up teacher Auth user:", cleanupError);
          });
      }

      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Server error while creating teacher");
    }
  },
);

// =============================
// REVOKE TEACHER
// =============================
exports.revokeTeacher = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (request) => {
    try {
      const caller = await requireOrgAdmin(request);
      const { uid } = request.data ?? {};

      if (typeof uid !== "string" || !uid.trim()) {
        throw new HttpsError("invalid-argument", "uid is required");
      }

      const targetUid = uid.trim();

      if (targetUid === caller.uid) {
        throw new HttpsError(
          "failed-precondition",
          "You cannot revoke your own account",
        );
      }

      const userRef = db.collection("users").doc(targetUid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError("not-found", "Teacher not found");
      }

      const userData = userDoc.data();

      if (userData?.role !== "teacher") {
        throw new HttpsError(
          "failed-precondition",
          "Only teachers can be revoked using this action",
        );
      }

      if (userData?.organizationId !== caller.organizationId) {
        throw new HttpsError(
          "permission-denied",
          "You can only revoke teachers in your own organization",
        );
      }

      const batch = db.batch();

      batch.set(
        userRef,
        {
          role: "revoked",
          status: "inactive",
          organizationId: null,
          revokedAt: timestamp(),
          revokedBy: caller.uid,
          updatedAt: timestamp(),
        },
        { merge: true },
      );

      addAdminLog(batch, {
        action: "REVOKE_TEACHER",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetUser: targetUid,
        targetEmail: userData?.email || null,
        orgId: caller.organizationId,
      });

      await batch.commit();

      await admin.auth().updateUser(targetUid, {
        disabled: true,
      });

      return {
        success: true,
        uid: targetUid,
        orgId: caller.organizationId,
        message: "Teacher revoked successfully",
      };
    } catch (error) {
      console.error("revokeTeacher error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Server error while revoking teacher");
    }
  },
);

// =============================
// ISSUE CERTIFICATE
// =============================
exports.issueCertificate = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    secrets: [
      BLOCKCHAIN_RPC_URL,
      BLOCKCHAIN_PRIVATE_KEY,
      CERTIFICATE_REGISTRY_ADDRESS,
      BLOCKCHAIN_CHAIN_ID,
      "SENDGRID_API_KEY",
      PINATA_JWT,
    ],
  },
  async (request) => {
    try {
      const caller = await requireActiveTeacher(request);
      const { studentName, studentEmail, courseName, issueDate } =
        request.data ?? {};

      if (
        typeof studentName !== "string" ||
        typeof studentEmail !== "string" ||
        typeof courseName !== "string" ||
        typeof issueDate !== "string" ||
        !studentName.trim() ||
        !studentEmail.trim() ||
        !courseName.trim() ||
        !issueDate.trim()
      ) {
        throw new HttpsError(
          "invalid-argument",
          "studentName, studentEmail, courseName, and issueDate are required",
        );
      }

      const normalizedStudentName = studentName.trim();
      const normalizedStudentEmail = normalizeEmail(studentEmail);
      const normalizedCourseName = courseName.trim();
      const normalizedIssueDate = issueDate.trim();

      if (!normalizedStudentEmail.includes("@")) {
        throw new HttpsError(
          "invalid-argument",
          "A valid student email is required",
        );
      }

      const organizationSnap = await db
        .collection("organizations")
        .doc(caller.organizationId)
        .get();
      const organizationName = organizationSnap.exists
        ? organizationSnap.data()?.name || ""
        : "";
      const certificateRef = db.collection("certificates").doc();
      const certificateId = certificateRef.id;
      const createdAtIso = new Date().toISOString();
      const certificateData = {
        certificateId,
        studentName: normalizedStudentName,
        studentEmail: normalizedStudentEmail,
        courseName: normalizedCourseName,
        issueDate: normalizedIssueDate,
        organizationId: caller.organizationId,
        issuedBy: caller.uid,
        issuedByEmail: caller.email,
      };
      const certificateHash = computeCertificateHash(certificateData);
      const batch = db.batch();

      batch.set(certificateRef, {
        ...certificateData,
        organizationName,
        status: "issued",
        blockchainStatus: "pending",
        ipfsStatus: "pending",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      addAdminLog(batch, {
        action: "ISSUE_CERTIFICATE",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetEmail: normalizedStudentEmail,
        orgId: caller.organizationId,
        certificateId,
        metadata: {
          organizationName,
        },
      });

      await batch.commit();

      let blockchainStatus = "pending";
      let blockchainError = null;
      let blockchainTxHash = null;
      let blockchainChainId = null;
      let contractAddress = null;
      let blockNumber = null;
      let blockchainIssuerAddress = null;

      try {
        const anchorResult = await anchorCertificateOnChain({
          certificateId,
          certificateHash,
          ipfsCid: "",
          config: getBlockchainConfig(),
        });
        const successBatch = db.batch();

        successBatch.update(certificateRef, {
          certificateHash,
          blockchainStatus: "confirmed",
          blockchainTxHash: anchorResult.txHash,
          blockchainChainId: anchorResult.chainId,
          contractAddress: anchorResult.contractAddress,
          blockNumber: anchorResult.blockNumber,
          blockchainIssuedAt: timestamp(),
          blockchainIssuerAddress: anchorResult.issuerAddress,
          blockchainError: null,
          updatedAt: timestamp(),
        });

        addAdminLog(successBatch, {
          action: "ANCHOR_CERTIFICATE_SUCCESS",
          performedBy: caller.uid,
          performedByEmail: caller.email,
          targetEmail: normalizedStudentEmail,
          orgId: caller.organizationId,
          certificateId,
          txHash: anchorResult.txHash,
          contractAddress: anchorResult.contractAddress,
          chainId: anchorResult.chainId,
          blockNumber: anchorResult.blockNumber,
        });

        await successBatch.commit();
        blockchainStatus = "confirmed";
        blockchainTxHash = anchorResult.txHash;
        blockchainChainId = anchorResult.chainId;
        contractAddress = anchorResult.contractAddress;
        blockNumber = anchorResult.blockNumber;
        blockchainIssuerAddress = anchorResult.issuerAddress;
      } catch (anchorError) {
        blockchainStatus = "failed";
        blockchainError = getErrorMessage(anchorError);
        console.error("anchorCertificateOnChain error:", anchorError);

        const failureBatch = db.batch();

        failureBatch.update(certificateRef, {
          certificateHash,
          blockchainStatus,
          blockchainError,
          updatedAt: timestamp(),
        });

        addAdminLog(failureBatch, {
          action: "ANCHOR_CERTIFICATE_FAILED",
          performedBy: caller.uid,
          performedByEmail: caller.email,
          targetEmail: normalizedStudentEmail,
          orgId: caller.organizationId,
          certificateId,
          error: blockchainError,
        });

        await failureBatch.commit();
      }

      const ipfsResult = await uploadAndRecordCertificateMetadata({
        certificateRef,
        certificate: {
          ...certificateData,
          organizationName,
          certificateHash,
          blockchainStatus,
          blockchainTxHash,
          blockchainChainId,
          contractAddress,
          blockNumber,
          blockchainIssuerAddress,
        },
        verificationBaseUrl: getVerificationBaseUrl(request),
        createdAtIso,
      });

      const emailResult = await sendAndRecordCertificateEmail({
        certificateRef,
        certificate: {
          ...certificateData,
          organizationName,
          certificateHash,
          blockchainStatus,
          blockchainError,
          ipfsCid: ipfsResult.ipfsCid,
          ipfsGatewayUrl: ipfsResult.ipfsGatewayUrl,
          ipfsProvider: ipfsResult.ipfsProvider,
        },
        verificationBaseUrl: getVerificationBaseUrl(request),
      });

      return {
        success: true,
        certificateId,
        certificateHash,
        blockchainStatus,
        blockchainError,
        ipfsStatus: ipfsResult.status,
        ipfsCid: ipfsResult.ipfsCid,
        ipfsGatewayUrl: ipfsResult.ipfsGatewayUrl,
        ipfsError: ipfsResult.error,
        emailStatus: emailResult.status,
        emailError: emailResult.error,
        message: "Certificate issued successfully",
      };
    } catch (error) {
      console.error("issueCertificate error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError("internal", "Server error while issuing certificate");
    }
  },
);

// =============================
// ISSUE BULK CERTIFICATES
// =============================
exports.issueBulkCertificates = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    secrets: [
      BLOCKCHAIN_RPC_URL,
      BLOCKCHAIN_PRIVATE_KEY,
      CERTIFICATE_REGISTRY_ADDRESS,
      BLOCKCHAIN_CHAIN_ID,
      "SENDGRID_API_KEY",
      PINATA_JWT,
    ],
  },
  async (request) => {
    try {
      const caller = await requireActiveTeacher(request);
      const requestedOrganizationId = cleanName(request.data?.organizationId);
      const rows = request.data?.certificates;

      if (
        requestedOrganizationId &&
        requestedOrganizationId !== caller.organizationId
      ) {
        throw new HttpsError(
          "permission-denied",
          "Bulk certificates can only be issued for your organization",
        );
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "At least one certificate row is required",
        );
      }

      if (rows.length > MAX_BULK_CERTIFICATES) {
        throw new HttpsError(
          "invalid-argument",
          `Bulk issuance is limited to ${MAX_BULK_CERTIFICATES} certificates per batch`,
        );
      }

      const organization = await getActiveOrganization(caller.organizationId);
      const validationErrors = [];
      const normalizedRows = rows.map((row, index) => {
        const rowNumber = index + 1;
        const studentName = cleanName(row?.studentName);
        const studentEmail = normalizeEmail(row?.studentEmail);
        const courseName = cleanName(row?.courseName);
        const issueDate = cleanName(row?.issueDate);

        if (!studentName) {
          validationErrors.push(`Row ${rowNumber}: studentName is required`);
        }

        if (!studentEmail || !studentEmail.includes("@")) {
          validationErrors.push(
            `Row ${rowNumber}: a valid studentEmail is required`,
          );
        }

        if (!courseName) {
          validationErrors.push(`Row ${rowNumber}: courseName is required`);
        }

        if (!issueDate) {
          validationErrors.push(`Row ${rowNumber}: issueDate is required`);
        }

        return {
          studentName,
          studentEmail,
          courseName,
          issueDate,
        };
      });

      if (validationErrors.length > 0) {
        throw new HttpsError(
          "invalid-argument",
          validationErrors.slice(0, 5).join("; "),
          {
            errors: validationErrors,
          },
        );
      }

      const batchRef = db.collection("certificateBatches").doc();
      const batchId = batchRef.id;
      const createdAtIso = new Date().toISOString();
      const certificateRows = normalizedRows.map((row) => {
        const certificateRef = db.collection("certificates").doc();
        const certificateId = certificateRef.id;
        const certificateData = {
          certificateId,
          ...row,
          organizationId: organization.id,
          organizationName: organization.name,
          issuedBy: caller.uid,
          issuedByEmail: caller.email,
        };

        return {
          certificateRef,
          certificateData,
          certificateHash: computeCertificateHash(certificateData),
        };
      });
      const merkleBatch = buildMerkleBatch(
        certificateRows.map((certificate) => certificate.certificateHash),
      );
      const certificateIds = certificateRows.map(
        ({ certificateData }) => certificateData.certificateId,
      );
      const writeBatch = db.batch();

      certificateRows.forEach((certificate, index) => {
        writeBatch.set(certificate.certificateRef, {
          ...certificate.certificateData,
          certificateHash: certificate.certificateHash,
          status: "issued",
          blockchainStatus: "pending",
          ipfsStatus: "pending",
          batchId,
          batchRoot: merkleBatch.root,
          batchIndex: index,
          batchProof: merkleBatch.proofs[index],
          batchSize: merkleBatch.size,
          issuanceMode: "bulk",
          createdAt: timestamp(),
          updatedAt: timestamp(),
        });
      });

      writeBatch.set(batchRef, {
        batchId,
        organizationId: organization.id,
        organizationName: organization.name,
        issuedBy: caller.uid,
        issuedByEmail: caller.email,
        batchRoot: merkleBatch.root,
        certificateIds,
        count: certificateIds.length,
        status: "created",
        blockchainStatus: "pending",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      });

      addAdminLog(writeBatch, {
        action: "ISSUE_BULK_CERTIFICATES",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        orgId: organization.id,
        metadata: {
          batchId,
          batchRoot: merkleBatch.root,
          count: certificateIds.length,
          organizationName: organization.name,
        },
      });

      await writeBatch.commit();

      let blockchainStatus = "pending";
      let blockchainError = null;
      let blockchainTxHash = null;
      let blockchainChainId = null;
      let contractAddress = null;
      let blockNumber = null;
      let blockchainIssuerAddress = null;

      try {
        const anchorResult = await anchorBatchOnChain({
          batchId,
          batchRoot: merkleBatch.root,
          config: getBlockchainConfig(),
        });
        const successBatch = db.batch();

        successBatch.update(batchRef, {
          blockchainStatus: "confirmed",
          blockchainTxHash: anchorResult.txHash,
          contractAddress: anchorResult.contractAddress,
          blockchainChainId: anchorResult.chainId,
          blockNumber: anchorResult.blockNumber,
          blockchainAnchoredAt: timestamp(),
          blockchainIssuerAddress: anchorResult.issuerAddress,
          blockchainError: null,
          updatedAt: timestamp(),
        });

        certificateRows.forEach(({ certificateRef }) => {
          successBatch.update(certificateRef, {
            blockchainStatus: "confirmed",
            blockchainTxHash: anchorResult.txHash,
            contractAddress: anchorResult.contractAddress,
            blockchainChainId: anchorResult.chainId,
            blockNumber: anchorResult.blockNumber,
            blockchainBatchAnchoredAt: timestamp(),
            blockchainError: null,
            updatedAt: timestamp(),
          });
        });

        addAdminLog(successBatch, {
          action: "ANCHOR_BATCH_SUCCESS",
          performedBy: caller.uid,
          performedByEmail: caller.email,
          orgId: organization.id,
          txHash: anchorResult.txHash,
          contractAddress: anchorResult.contractAddress,
          chainId: anchorResult.chainId,
          blockNumber: anchorResult.blockNumber,
          metadata: {
            batchId,
            batchRoot: merkleBatch.root,
            count: certificateIds.length,
          },
        });

        await successBatch.commit();
        blockchainStatus = "confirmed";
        blockchainTxHash = anchorResult.txHash;
        blockchainChainId = anchorResult.chainId;
        contractAddress = anchorResult.contractAddress;
        blockNumber = anchorResult.blockNumber;
        blockchainIssuerAddress = anchorResult.issuerAddress;
      } catch (anchorError) {
        blockchainStatus = "failed";
        blockchainError = getErrorMessage(anchorError);
        console.error("anchorBatchOnChain error:", anchorError);

        const failureBatch = db.batch();

        failureBatch.update(batchRef, {
          blockchainStatus,
          blockchainError,
          updatedAt: timestamp(),
        });

        certificateRows.forEach(({ certificateRef }) => {
          failureBatch.update(certificateRef, {
            blockchainStatus,
            blockchainError,
            updatedAt: timestamp(),
          });
        });

        addAdminLog(failureBatch, {
          action: "ANCHOR_BATCH_FAILED",
          performedBy: caller.uid,
          performedByEmail: caller.email,
          orgId: organization.id,
          error: blockchainError,
          metadata: {
            batchId,
            batchRoot: merkleBatch.root,
            count: certificateIds.length,
          },
        });

        await failureBatch.commit();
      }

      const ipfsResults = await Promise.all(
        certificateRows.map(
          ({ certificateRef, certificateData, certificateHash }, index) =>
            uploadAndRecordCertificateMetadata({
              certificateRef,
              certificate: {
                ...certificateData,
                certificateHash,
                batchId,
                batchRoot: merkleBatch.root,
                batchProof: merkleBatch.proofs[index],
                batchIndex: index,
                batchSize: merkleBatch.size,
                issuanceMode: "bulk",
                blockchainStatus,
                blockchainTxHash,
                blockchainChainId,
                contractAddress,
                blockNumber,
                blockchainIssuerAddress,
              },
              verificationBaseUrl: getVerificationBaseUrl(request),
              createdAtIso,
            }),
        ),
      );
      const ipfsUploaded = ipfsResults.filter(
        (ipfsResult) => ipfsResult.status === "uploaded",
      ).length;
      const ipfsFailed = ipfsResults.length - ipfsUploaded;

      await batchRef
        .update({
          ipfsUploaded,
          ipfsFailed,
          updatedAt: timestamp(),
        })
        .catch((ipfsSummaryError) => {
          console.error(
            "Failed to record certificate batch IPFS summary:",
            ipfsSummaryError,
          );
        });

      const emailResults = await Promise.all(
        certificateRows.map(({ certificateRef, certificateData, certificateHash }, index) =>
          sendAndRecordCertificateEmail({
            certificateRef,
            certificate: {
              ...certificateData,
              certificateHash,
              batchId,
              batchRoot: merkleBatch.root,
              batchSize: merkleBatch.size,
              issuanceMode: "bulk",
              blockchainStatus,
              blockchainError,
              ipfsCid: ipfsResults[index]?.ipfsCid,
              ipfsGatewayUrl: ipfsResults[index]?.ipfsGatewayUrl,
              ipfsProvider: ipfsResults[index]?.ipfsProvider,
            },
            verificationBaseUrl: getVerificationBaseUrl(request),
          }),
        ),
      );
      const emailsSent = emailResults.filter(
        (emailResult) => emailResult.status === "sent",
      ).length;
      const emailsFailed = emailResults.length - emailsSent;

      await batchRef
        .update({
          emailsSent,
          emailsFailed,
          updatedAt: timestamp(),
        })
        .catch((emailSummaryError) => {
          console.error(
            "Failed to record certificate batch email summary:",
            emailSummaryError,
          );
        });

      return {
        success: true,
        batchId,
        batchRoot: merkleBatch.root,
        count: certificateIds.length,
        certificateIds,
        blockchainStatus,
        blockchainError,
        ipfsUploaded,
        ipfsFailed,
        emailsSent,
        emailsFailed,
        message: "Bulk certificates created successfully",
      };
    } catch (error) {
      console.error("issueBulkCertificates error:", error);

      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "internal",
        "Server error while issuing bulk certificates",
      );
    }
  },
);

// =============================
// REVOKE CERTIFICATE
// =============================
exports.revokeCertificate = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
    secrets: [
      BLOCKCHAIN_RPC_URL,
      BLOCKCHAIN_PRIVATE_KEY,
      CERTIFICATE_REGISTRY_ADDRESS,
      BLOCKCHAIN_CHAIN_ID,
    ],
  },
  async (request) => {
    const caller = await requireActiveTeacher(request);
    const certificateId = String(request.data?.certificateId || "").trim();

    if (!certificateId) {
      throw new HttpsError(
        "invalid-argument",
        "certificateId is required",
      );
    }

    const certificateRef = db.collection("certificates").doc(certificateId);
    const certificateSnap = await certificateRef.get();

    if (!certificateSnap.exists) {
      throw new HttpsError("not-found", "Certificate not found");
    }

    const certificate = certificateSnap.data();

    if (certificate?.status === "revoked") {
      throw new HttpsError(
        "failed-precondition",
        "Certificate is already revoked",
      );
    }

    if (certificate?.blockchainStatus !== "confirmed") {
      throw new HttpsError(
        "failed-precondition",
        "Only blockchain-confirmed certificates can be revoked.",
      );
    }

    const issuedByCaller = certificate?.issuedBy === caller.uid;
    const inCallerOrganization =
      certificate?.organizationId === caller.organizationId;

    if (!issuedByCaller && !inCallerOrganization) {
      throw new HttpsError(
        "permission-denied",
        "You can only revoke certificates you issued or certificates in your organization",
      );
    }

    try {
      const revokeResult = await revokeCertificateOnChain(certificateId, {
        ...getBlockchainConfig(),
      });
      const batch = db.batch();

      batch.update(certificateRef, {
        status: "revoked",
        revokedAt: timestamp(),
        revokedBy: caller.uid,
        blockchainRevocationStatus: "confirmed",
        blockchainRevocationError: null,
        revokeTxHash: revokeResult.revokeTxHash,
        revokeBlockNumber: revokeResult.blockNumber,
        blockchainRevokedAt: timestamp(),
        blockchainRevokedByAddress: revokeResult.revokedByAddress,
        updatedAt: timestamp(),
      });

      addAdminLog(batch, {
        action: "REVOKE_CERTIFICATE",
        performedBy: caller.uid,
        performedByEmail: caller.email,
        targetEmail: certificate?.studentEmail || null,
        orgId: certificate?.organizationId || caller.organizationId,
        certificateId,
        revokeTxHash: revokeResult.revokeTxHash,
      });

      await batch.commit();

      return {
        success: true,
        certificateId,
        revokeTxHash: revokeResult.revokeTxHash,
        blockNumber: revokeResult.blockNumber,
        contractAddress: revokeResult.contractAddress,
        chainId: revokeResult.chainId,
        revokedByAddress: revokeResult.revokedByAddress,
        message: "Certificate revoked successfully",
      };
    } catch (error) {
      const blockchainRevocationError = getErrorMessage(error);

      console.error("revokeCertificateOnChain error:", error);

      await certificateRef.update({
        blockchainRevocationStatus: "failed",
        blockchainRevocationError,
        updatedAt: timestamp(),
      });

      throw new HttpsError(
        "internal",
        `Blockchain revocation failed: ${blockchainRevocationError}`,
      );
    }
  },
);
