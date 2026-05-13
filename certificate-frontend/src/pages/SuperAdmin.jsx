import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import AppLayout from "../components/AppLayout";

export default function SuperAdmin({ user, role = "superadmin", view = "overview" }) {
  const [orgName, setOrgName] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [orgAdminForm, setOrgAdminForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [organizationSearchTerm, setOrganizationSearchTerm] = useState("");
  const [organizationStatusFilter, setOrganizationStatusFilter] = useState("all");
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

  const getUserById = useCallback((uid) => {
    return users.find((u) => u.id === uid || u.uid === uid);
  }, [users]);

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

  const normalizedOrganizationSearch = organizationSearchTerm
    .trim()
    .toLowerCase();
  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const adminProfiles = (org.orgAdminIds || [])
        .map((uid) => getUserById(uid))
        .filter(Boolean);
      const searchTarget = [
        org.name,
        org.status || "active",
        org.id,
        ...adminProfiles.flatMap((admin) => [
          admin.name,
          admin.email,
          admin.status,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const orgStatus = String(org.status || "active").toLowerCase();
      const hasAdminWithStatus = adminProfiles.some(
        (admin) =>
          String(admin.status || "active").toLowerCase() ===
          organizationStatusFilter,
      );

      return (
        (!normalizedOrganizationSearch ||
          searchTarget.includes(normalizedOrganizationSearch)) &&
        (organizationStatusFilter === "all" ||
          orgStatus === organizationStatusFilter ||
          hasAdminWithStatus)
      );
    });
  }, [
    normalizedOrganizationSearch,
    organizationStatusFilter,
    organizations,
    getUserById,
  ]);
  const orgAdmins = useMemo(
    () => users.filter((item) => item.role === "orgAdmin"),
    [users],
  );
  const [orgAdminSearchTerm, setOrgAdminSearchTerm] = useState("");
  const [orgAdminStatusFilter, setOrgAdminStatusFilter] = useState("all");
  const normalizedOrgAdminSearch = orgAdminSearchTerm.trim().toLowerCase();
  const filteredOrgAdmins = useMemo(() => {
    return orgAdmins.filter((admin) => {
      const organization = organizations.find(
        (org) => org.id === admin.organizationId,
      );
      const adminStatus = String(admin.status || "active").toLowerCase();
      const searchTarget = [
        admin.name,
        admin.email,
        admin.status,
        admin.id,
        organization?.name,
        organization?.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!normalizedOrgAdminSearch ||
          searchTarget.includes(normalizedOrgAdminSearch)) &&
        (orgAdminStatusFilter === "all" || adminStatus === orgAdminStatusFilter)
      );
    });
  }, [
    normalizedOrgAdminSearch,
    orgAdminStatusFilter,
    orgAdmins,
    organizations,
  ]);
  const activeOrganizationCount = organizations.filter(
    (org) => String(org.status || "active").toLowerCase() === "active",
  ).length;
  const activeOrgAdminCount = orgAdmins.filter(
    (admin) => String(admin.status || "active").toLowerCase() === "active",
  ).length;
  const navItems = [
    { to: "/admin", label: "Overview", icon: "O" },
    { to: "/admin/organizations", label: "Organizations", icon: "L" },
    { to: "/admin/create-organization", label: "Create Org", icon: "N" },
    { to: "/admin/org-admins", label: "Org Admins", icon: "A" },
    { to: "/admin/create-org-admin", label: "Create Admin", icon: "C" },
  ];
  const pageTitle =
    {
      overview: "Super Admin Overview",
      organizations: "Organizations",
      createOrganization: "Create Organization",
      orgAdmins: "Org Admins",
      createOrgAdmin: "Create Org Admin",
    }[view] || "Super Admin Panel";

  return (
    <AppLayout
      user={user}
      role={role}
      title={pageTitle}
      subtitle="Manage organizations and assign organization administrators."
      navItems={navItems}
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

        {view === "overview" ? (
          <>
            <section className="quick-actions">
              <Link to="/admin/create-organization" className="action-card">
                <span className="badge badge-primary">New</span>
                <strong>Create Organization</strong>
                <span>Add a university or issuing body for the demo.</span>
              </Link>
              <Link to="/admin/create-org-admin" className="action-card">
                <span className="badge badge-primary">Admin</span>
                <strong>Create Org Admin</strong>
                <span>Assign an administrator to an existing organization.</span>
              </Link>
              <Link to="/admin/org-admins" className="action-card">
                <span className="badge badge-primary">Directory</span>
                <strong>View Org Admins</strong>
                <span>Search active and revoked admin accounts.</span>
              </Link>
            </section>

            <div className="grid grid-two">
              <section className="card stat-card">
                <span className="muted">Active Organizations</span>
                <strong className="stat-value">{activeOrganizationCount}</strong>
              </section>
              <section className="card stat-card">
                <span className="muted">Active Org Admins</span>
                <strong className="stat-value">{activeOrgAdminCount}</strong>
              </section>
            </div>
          </>
        ) : null}

        {view === "createOrganization" ? (
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
        ) : null}

        {view === "orgAdmins" ? (
          <section className="card">
            <div className="section-header">
              <div>
                <h2>Org Admins</h2>
                <p className="muted">Search organization administrators by email, organization, or status.</p>
              </div>
              <button
                type="button"
                className="button button-outline"
                onClick={fetchData}
                disabled={fetching}
              >
                {fetching ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="list-toolbar">
              <label className="field">
                <span>Search Org Admins</span>
                <input
                  className="input"
                  placeholder="Admin email, name, organization, or status"
                  value={orgAdminSearchTerm}
                  onChange={(event) => setOrgAdminSearchTerm(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Filter</span>
                <select
                  className="input"
                  value={orgAdminStatusFilter}
                  onChange={(event) => setOrgAdminStatusFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="disabled">Disabled</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>
            </div>

            {fetching ? <div className="alert">Loading org admins...</div> : null}

            {!fetching && orgAdmins.length === 0 ? (
              <div className="empty-state">
                <strong>No org admins found</strong>
                <span>Create an org admin from the dedicated page.</span>
              </div>
            ) : null}

            {!fetching && orgAdmins.length > 0 && filteredOrgAdmins.length === 0 ? (
              <div className="empty-state">
                <strong>No matching org admins</strong>
                <span>Try another search term or filter.</span>
              </div>
            ) : null}

            {!fetching && filteredOrgAdmins.length > 0 ? (
              <div className="table-container table-container-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Organization</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrgAdmins.map((admin) => {
                      const organization = organizations.find(
                        (org) => org.id === admin.organizationId,
                      );

                      return (
                        <tr key={admin.id}>
                          <td>{admin.name || "-"}</td>
                          <td>{admin.email || "-"}</td>
                          <td>{organization?.name || admin.organizationId || "-"}</td>
                          <td>
                            <span className="badge">
                              {admin.status || "active"}
                            </span>
                          </td>
                          <td>
                            {admin.organizationId ? (
                              <button
                                type="button"
                                className="button button-danger button-small"
                                onClick={() =>
                                  removeOrgAdmin(admin.organizationId, admin.id)
                                }
                                disabled={loading}
                              >
                                {loading ? "Processing..." : "Revoke"}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {view === "organizations" || view === "createOrgAdmin" ? (
        <section className="grid">
          <div className="section-header">
            <div>
              <h2>{view === "createOrgAdmin" ? "Create Org Admin" : "Organizations"}</h2>
              <p className="muted">
                {view === "createOrgAdmin"
                  ? "Choose an organization and create an administrator account."
                  : "Search organizations and review assigned administrators."}
              </p>
            </div>
          </div>

          <div className="list-toolbar">
            <label className="field">
              <span>Search Organizations</span>
              <input
                className="input"
                placeholder="Organization, admin email, or status"
                value={organizationSearchTerm}
                onChange={(event) => setOrganizationSearchTerm(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Filter</span>
              <select
                className="input"
                value={organizationStatusFilter}
                onChange={(event) =>
                  setOrganizationStatusFilter(event.target.value)
                }
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="disabled">Disabled</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>
          </div>

          {fetching ? <div className="alert">Loading organizations...</div> : null}

          {!fetching && organizations.length === 0 ? (
            <div className="empty-state">
              <strong>No organizations found</strong>
              <span>Create an organization to begin onboarding admins.</span>
            </div>
          ) : null}

          {!fetching && organizations.length > 0 && filteredOrganizations.length === 0 ? (
            <div className="empty-state">
              <strong>No matching organizations or admins</strong>
              <span>Try another search term or filter.</span>
            </div>
          ) : null}

          {!fetching && filteredOrganizations.length > 0 ? (
            <div className="grid grid-two">
              {filteredOrganizations.map((org) => (
                <article className="card card-subtle" key={org.id}>
                  <div className="section-header">
                    <div>
                      <h3>{org.name || "Untitled organization"}</h3>
                      <p className="muted hash-value">ID: {org.id}</p>
                    </div>
                    <div className="badge-row">
                      <span className="badge badge-primary">
                        {org.orgAdminIds?.length || 0} admins
                      </span>
                      <span className="badge">
                        {org.status || "active"}
                      </span>
                    </div>
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

                    {view === "createOrgAdmin" ? (
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
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
        ) : null}
      </div>
    </AppLayout>
  );
}
