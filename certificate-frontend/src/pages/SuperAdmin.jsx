import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import AppLayout from "../components/AppLayout";

export default function SuperAdmin({ user, role = "superadmin" }) {
  const [orgName, setOrgName] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [orgAdminForm, setOrgAdminForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const createOrganizationFn = useMemo(
    () => httpsCallable(functions, "createOrganization"),
    [],
  );
  const createOrgAdminFn = useMemo(
    () => httpsCallable(functions, "createOrgAdmin"),
    [],
  );
  const revokeOrgAdminFn = useMemo(
    () => httpsCallable(functions, "revokeOrgAdmin"),
    [],
  );

  const fetchData = async () => {
    setFetching(true);
    setError("");

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
      setError("Failed to fetch admin data.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createOrg = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!orgName.trim()) {
      setError("Enter an organization name.");
      return;
    }

    try {
      setLoading(true);

      await createOrganizationFn({
        name: orgName.trim(),
      });

      setSuccess("Organization created successfully.");
      setOrgName("");
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to create organization.");
    } finally {
      setLoading(false);
    }
  };

  const createOrgAdmin = async (orgId) => {
    const form = orgAdminForm[orgId] || {};
    const name = form.name || "";
    const email = form.email || "";
    const password = form.password || "";

    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Enter admin email.");
      return;
    }

    if (!password.trim()) {
      setError("Enter a temporary password.");
      return;
    }

    try {
      setLoading(true);

      await createOrgAdminFn({
        name: name.trim(),
        email: email.trim(),
        password,
        orgId,
      });

      setSuccess("Org admin created successfully.");
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
        setError("A user with this email already exists.");
      } else if (err.code === "functions/permission-denied") {
        setError("Only superadmin can perform this action.");
      } else {
        setError(err.message || "Unable to create org admin.");
      }
    } finally {
      setLoading(false);
    }
  };

  const removeOrgAdmin = async (orgId, uid) => {
    const confirmRevoke = window.confirm(
      "Are you sure you want to revoke this org admin?",
    );

    if (!confirmRevoke) return;

    setError("");
    setSuccess("");

    try {
      setLoading(true);

      await revokeOrgAdminFn({
        uid,
        orgId,
      });

      setSuccess("Org admin revoked successfully.");
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to revoke org admin.");
    } finally {
      setLoading(false);
    }
  };

  const getUserById = (uid) => {
    return users.find((u) => u.id === uid || u.uid === uid);
  };

  const getUserLabel = (uid) => {
    const profile = getUserById(uid);

    if (!profile) return uid;
    if (profile.name && profile.email) return `${profile.name} (${profile.email})`;
    if (profile.email) return profile.email;
    if (profile.name) return profile.name;

    return uid;
  };

  const updateOrgAdminForm = (orgId, field, value) => {
    setOrgAdminForm((prev) => ({
      ...prev,
      [orgId]: {
        ...prev[orgId],
        [field]: value,
      },
    }));
  };

  return (
    <AppLayout
      user={user}
      role={role}
      title="Super Admin Panel"
      subtitle="Manage organizations and assign organization administrators."
      navItems={[
        { to: "/admin", label: "Organizations", icon: "O" },
      ]}
      actions={
        <button
          type="button"
          className="button button-outline"
          onClick={fetchData}
          disabled={fetching}
        >
          {fetching ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <div className="grid">
        <div className="grid grid-three">
          <section className="card stat-card">
            <span className="muted">Organizations</span>
            <strong className="stat-value">{organizations.length}</strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Org Admins</span>
            <strong className="stat-value">
              {users.filter((item) => item.role === "orgAdmin").length}
            </strong>
          </section>
          <section className="card stat-card">
            <span className="muted">Users</span>
            <strong className="stat-value">{users.length}</strong>
          </section>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? <div className="alert alert-success">{success}</div> : null}

        <section className="card">
          <div className="section-header">
            <div>
              <h2>Create Organization</h2>
              <p className="muted">
                Add a certificate issuing organization to the system.
              </p>
            </div>
          </div>

          <form className="form-grid" onSubmit={createOrg}>
            <label className="field">
              <span>Organization Name</span>
              <input
                className="input"
                placeholder="Example University"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={loading}
              />
            </label>
            <div className="field">
              <span>&nbsp;</span>
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Org"}
              </button>
            </div>
          </form>
        </section>

        <section className="grid">
          <div className="section-header">
            <div>
              <h2>Organizations</h2>
              <p className="muted">Assign and revoke organization admins.</p>
            </div>
          </div>

          {fetching ? <div className="alert">Loading organizations...</div> : null}

          {!fetching && organizations.length === 0 ? (
            <div className="empty-state">
              <strong>No organizations found</strong>
              <span>Create an organization to begin onboarding admins.</span>
            </div>
          ) : null}

          {!fetching && organizations.length > 0 ? (
            <div className="grid grid-two">
              {organizations.map((org) => (
                <article className="card card-subtle" key={org.id}>
                  <div className="section-header">
                    <div>
                      <h3>{org.name || "Untitled organization"}</h3>
                      <p className="muted hash-value">ID: {org.id}</p>
                    </div>
                    <span className="badge badge-primary">
                      {org.orgAdminIds?.length || 0} admins
                    </span>
                  </div>

                  <p className="muted">
                    Created by {getUserLabel(org.createdBy) || "Unknown"}
                  </p>

                  <div className="grid">
                    <div>
                      <h3>Org Admins</h3>
                      {org.orgAdminIds?.length > 0 ? (
                        <div className="grid">
                          {org.orgAdminIds.map((uid) => (
                            <div className="profile-chip" key={uid}>
                              <span className="profile-avatar">
                                {getUserLabel(uid).charAt(0).toUpperCase()}
                              </span>
                              <span className="profile-meta">
                                <strong>{getUserLabel(uid)}</strong>
                                <span className="hash-value">{uid}</span>
                              </span>
                              <button
                                type="button"
                                className="button button-danger button-small"
                                onClick={() => removeOrgAdmin(org.id, uid)}
                                disabled={loading}
                              >
                                {loading ? "Processing..." : "Revoke"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <strong>No org admins assigned</strong>
                          <span>Add an admin using the form below.</span>
                        </div>
                      )}
                    </div>

                    <form
                      className="form-grid"
                      onSubmit={(event) => {
                        event.preventDefault();
                        createOrgAdmin(org.id);
                      }}
                    >
                      <label className="field full-width">
                        <span>Admin Name</span>
                        <input
                          className="input"
                          placeholder="Admin name"
                          value={orgAdminForm[org.id]?.name || ""}
                          onChange={(e) =>
                            updateOrgAdminForm(org.id, "name", e.target.value)
                          }
                          disabled={loading}
                        />
                      </label>

                      <label className="field">
                        <span>Admin Email</span>
                        <input
                          className="input"
                          placeholder="admin@example.com"
                          type="email"
                          value={orgAdminForm[org.id]?.email || ""}
                          onChange={(e) =>
                            updateOrgAdminForm(org.id, "email", e.target.value)
                          }
                          disabled={loading}
                        />
                      </label>

                      <label className="field">
                        <span>Temporary Password</span>
                        <input
                          className="input"
                          type="password"
                          placeholder="Minimum 6 characters"
                          value={orgAdminForm[org.id]?.password || ""}
                          onChange={(e) =>
                            updateOrgAdminForm(org.id, "password", e.target.value)
                          }
                          disabled={loading}
                        />
                      </label>

                      <button className="button full-width" disabled={loading}>
                        {loading ? "Creating..." : "Create Org Admin"}
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
