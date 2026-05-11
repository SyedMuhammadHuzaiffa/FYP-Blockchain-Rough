const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const REGION = "us-central1";
const FROM_EMAIL = "syed.huzaiffaxd@gmail.com";
const FROM_NAME = "Blockchain Certificate System";

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
