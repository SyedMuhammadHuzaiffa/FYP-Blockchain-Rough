import { useEffect, useState } from "react";
import { db, functions, auth } from "../firebase";

import { collection, getDocs } from "firebase/firestore";

import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";

export default function SuperAdmin() {
  const [orgName, setOrgName] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [orgAdminForm, setOrgAdminForm] = useState({});
  const [loading, setLoading] = useState(false);

  // =========================
  // CLOUD FUNCTIONS
  // =========================
  const createOrganizationFn = httpsCallable(functions, "createOrganization");

  const createOrgAdminFn = httpsCallable(functions, "createOrgAdmin");

  const revokeOrgAdminFn = httpsCallable(functions, "revokeOrgAdmin");

  // =========================
  // FETCH DATA
  // =========================
  const fetchData = async () => {
    try {
      const orgSnap = await getDocs(collection(db, "organizations"));
      const userSnap = await getDocs(collection(db, "users"));

      setOrganizations(
        orgSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );

      setUsers(
        userSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to fetch data");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =========================
  // LOGOUT
  // =========================
  const logout = async () => {
    try {
      await signOut(auth);

      alert("Logged out successfully");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // =========================
  // CREATE ORGANIZATION
  // =========================
  const createOrg = async () => {
    if (!orgName.trim()) {
      return alert("Enter organization name");
    }

    try {
      setLoading(true);

      await createOrganizationFn({
        name: orgName.trim(),
      });

      alert("Organization created successfully");

      setOrgName("");

      await fetchData();
    } catch (err) {
      console.error(err);

      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // CREATE ORG ADMIN
  // =========================
  const createOrgAdmin = async (orgId) => {
    const form = orgAdminForm[orgId] || {};

    const name = form.name || "";
    const email = form.email || "";
    const password = form.password || "";

    if (!email.trim()) {
      return alert("Enter admin email");
    }

    if (!password.trim()) {
      return alert("Enter password");
    }

    try {
      setLoading(true);

      await createOrgAdminFn({
        name: name.trim(),
        email: email.trim(),
        password,
        orgId,
      });

      alert("Org admin created successfully");

      // reset form
      setOrgAdminForm((prev) => ({
        ...prev,
        [orgId]: {
          name: "",
          email: "",
          password: "",
        },
      }));

      await fetchData();
    } catch (err) {
      console.error(err);

      if (err.code === "functions/already-exists") {
        alert("A user with this email already exists.");
      } else if (err.code === "functions/permission-denied") {
        alert("Only superadmin can perform this action.");
      } else {
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // REVOKE ORG ADMIN
  // =========================
  const removeOrgAdmin = async (orgId, uid) => {
    const confirmRevoke = window.confirm(
      "Are you sure you want to revoke this org admin?",
    );

    if (!confirmRevoke) return;

    try {
      setLoading(true);

      await revokeOrgAdminFn({
        uid,
        orgId,
      });

      alert("Org admin revoked successfully");

      await fetchData();
    } catch (err) {
      console.error(err);

      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // HELPERS
  // =========================
  const getUserById = (uid) => {
    return users.find((u) => u.id === uid || u.uid === uid);
  };

  const getUserLabel = (uid) => {
    const user = getUserById(uid);

    if (!user) return uid;

    if (user.name && user.email) {
      return `${user.name} (${user.email})`;
    }

    if (user.email) return user.email;

    if (user.name) return user.name;

    return uid;
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 20 }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1>Super Admin Panel</h1>

        <button
          onClick={logout}
          style={{
            background: "red",
            color: "white",
            border: "none",
            padding: "10px 16px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* CREATE ORGANIZATION */}
      <div
        style={{
          marginBottom: 30,
          padding: 20,
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      >
        <h3>Create Organization</h3>

        <input
          placeholder="Organization Name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          style={{
            marginRight: 10,
            padding: 8,
            width: 250,
          }}
        />

        <button onClick={createOrg} disabled={loading}>
          {loading ? "Creating..." : "Create Org"}
        </button>
      </div>

      <hr />

      {/* ORGANIZATIONS */}
      <h2>Organizations</h2>

      {organizations.length === 0 && <p>No organizations found.</p>}

      {organizations.map((org) => (
        <div
          key={org.id}
          style={{
            marginBottom: 40,
            padding: 20,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        >
          <h2>{org.name}</h2>

          <p>
            <strong>Org ID:</strong> {org.id}
          </p>

          <p>
            <strong>Created By:</strong>{" "}
            {getUserLabel(org.createdBy) || "Unknown"}
          </p>

          {/* ADMINS */}
          <h4>Org Admins</h4>

          {org.orgAdminIds?.length > 0 ? (
            org.orgAdminIds.map((uid) => (
              <div
                key={uid}
                style={{
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>👤 {getUserLabel(uid)}</span>

                <button
                  onClick={() => removeOrgAdmin(org.id, uid)}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Revoke"}
                </button>
              </div>
            ))
          ) : (
            <p>No org admins assigned</p>
          )}

          {/* ADD ORG ADMIN */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: "1px solid #eee",
            }}
          >
            <h4>Add Org Admin</h4>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxWidth: 400,
              }}
            >
              <input
                placeholder="Admin Name"
                value={orgAdminForm[org.id]?.name || ""}
                onChange={(e) =>
                  setOrgAdminForm((prev) => ({
                    ...prev,
                    [org.id]: {
                      ...prev[org.id],
                      name: e.target.value,
                    },
                  }))
                }
              />

              <input
                placeholder="Admin Email"
                value={orgAdminForm[org.id]?.email || ""}
                onChange={(e) =>
                  setOrgAdminForm((prev) => ({
                    ...prev,
                    [org.id]: {
                      ...prev[org.id],
                      email: e.target.value,
                    },
                  }))
                }
              />

              <input
                type="password"
                placeholder="Temporary Password"
                value={orgAdminForm[org.id]?.password || ""}
                onChange={(e) =>
                  setOrgAdminForm((prev) => ({
                    ...prev,
                    [org.id]: {
                      ...prev[org.id],
                      password: e.target.value,
                    },
                  }))
                }
              />

              <button onClick={() => createOrgAdmin(org.id)} disabled={loading}>
                {loading ? "Creating..." : "Create Org Admin"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
