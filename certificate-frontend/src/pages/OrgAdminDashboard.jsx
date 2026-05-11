import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";

const emptyTeacherForm = {
  name: "",
  email: "",
  password: "",
};

function getReadableError(error) {
  if (error?.code === "functions/already-exists") {
    return "A user with this email already exists.";
  }

  if (error?.code === "functions/permission-denied") {
    return "You do not have permission to perform this action.";
  }

  if (error?.code === "functions/unauthenticated") {
    return "Please log in again before continuing.";
  }

  if (error?.code === "functions/invalid-argument") {
    return error.message || "Please check the form and try again.";
  }

  if (error?.code === "functions/failed-precondition") {
    return error.message || "This action cannot be completed right now.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

export default function OrgAdminDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [teacherForm, setTeacherForm] = useState(emptyTeacherForm);
  const [pageLoading, setPageLoading] = useState(true);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [revokingTeacherId, setRevokingTeacherId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const createTeacherFn = useMemo(
    () => httpsCallable(functions, "createTeacher"),
    [],
  );
  const revokeTeacherFn = useMemo(
    () => httpsCallable(functions, "revokeTeacher"),
    [],
  );

  const organizationId = profile?.organizationId || "";
  const isOrgAdmin = profile?.role === "orgAdmin";
  const isTeacher = profile?.role === "teacher";

  const logout = async () => {
    await signOut(auth);
  };

  const fetchTeachers = useCallback(async (orgId) => {
    if (!orgId) {
      setTeachers([]);
      return;
    }

    setTeachersLoading(true);

    try {
      const teacherQuery = query(
        collection(db, "users"),
        where("organizationId", "==", orgId),
      );
      const teacherSnap = await getDocs(teacherQuery);

      setTeachers(
        teacherSnap.docs
          .map((teacherDoc) => ({
            id: teacherDoc.id,
            ...teacherDoc.data(),
          }))
          .filter((teacher) => teacher.role === "teacher"),
      );
    } catch (err) {
      console.error(err);
      setError("Failed to load teachers for this organization.");
    } finally {
      setTeachersLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!user?.uid) return;

    setPageLoading(true);
    setError("");
    setOrganizationName("");

    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));

      if (!profileSnap.exists()) {
        setProfile(null);
        setError("Your user profile was not found.");
        return;
      }

      const profileData = {
        id: profileSnap.id,
        ...profileSnap.data(),
      };

      setProfile(profileData);

      if (profileData.organizationId) {
        const organizationSnap = await getDoc(
          doc(db, "organizations", profileData.organizationId),
        );

        setOrganizationName(
          organizationSnap.exists() ? organizationSnap.data()?.name || "" : "",
        );
      }

      if (profileData.role === "orgAdmin") {
        await fetchTeachers(profileData.organizationId);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load your dashboard profile.");
    } finally {
      setPageLoading(false);
    }
  }, [fetchTeachers, user?.uid]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateTeacherForm = (field, value) => {
    setTeacherForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const createTeacher = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = teacherForm.name.trim();
    const email = teacherForm.email.trim();
    const password = teacherForm.password;

    if (!name || !email || !password.trim()) {
      setError("Name, email, and temporary password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Temporary password must be at least 6 characters.");
      return;
    }

    try {
      setCreatingTeacher(true);
      await user.getIdToken(true);

      await createTeacherFn({
        name,
        email,
        password,
      });

      setTeacherForm(emptyTeacherForm);
      setSuccess("Teacher created successfully. Invite email sent.");
      await fetchTeachers(organizationId);
    } catch (err) {
      console.error(err);
      setError(getReadableError(err));
    } finally {
      setCreatingTeacher(false);
    }
  };

  const revokeTeacher = async (teacher) => {
    const confirmRevoke = window.confirm(
      `Revoke ${teacher.email || "this teacher"}?`,
    );

    if (!confirmRevoke) return;

    setError("");
    setSuccess("");

    try {
      setRevokingTeacherId(teacher.id);
      await user.getIdToken(true);

      await revokeTeacherFn({
        uid: teacher.uid || teacher.id,
      });

      setSuccess("Teacher revoked successfully.");
      await fetchTeachers(organizationId);
    } catch (err) {
      console.error(err);
      setError(getReadableError(err));
    } finally {
      setRevokingTeacherId("");
    }
  };

  if (pageLoading) {
    return <h1 style={{ padding: 20 }}>Loading dashboard...</h1>;
  }

  if (isTeacher) {
    return (
      <div style={{ padding: 20 }}>
        <div style={styles.header}>
          <div>
            <h1>Teacher Dashboard</h1>
            <p style={styles.muted}>Email: {profile?.email || user?.email}</p>
            <p style={styles.muted}>
              Organization: {organizationName || "Unknown Organization"}
            </p>
            <p style={styles.muted}>Status: {profile?.status || "unknown"}</p>
          </div>

          <button onClick={logout} style={styles.dangerButton}>
            Logout
          </button>
        </div>

        <div style={styles.panel}>
          <h2>Access Granted</h2>
          <p style={styles.muted}>
            You are signed in as a teacher for your organization.
          </p>
        </div>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Dashboard unavailable</h1>
        <p>{error || "This dashboard is only available to organization users."}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={styles.header}>
        <div>
          <h1>Org Admin Dashboard</h1>
          <p style={styles.muted}>Email: {profile?.email || user?.email}</p>
          <p style={styles.muted}>
            Organization: {organizationName || "Unknown Organization"}
          </p>
        </div>

        <button onClick={logout} style={styles.dangerButton}>
          Logout
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {success ? <div style={styles.success}>{success}</div> : null}

      <div style={styles.panel}>
        <h2>Create Teacher</h2>

        <form onSubmit={createTeacher} style={styles.form}>
          <input
            placeholder="Teacher name"
            value={teacherForm.name}
            onChange={(event) => updateTeacherForm("name", event.target.value)}
            disabled={creatingTeacher}
            style={styles.input}
          />

          <input
            placeholder="Teacher email"
            type="email"
            value={teacherForm.email}
            onChange={(event) => updateTeacherForm("email", event.target.value)}
            disabled={creatingTeacher}
            style={styles.input}
          />

          <input
            placeholder="Temporary password"
            type="password"
            value={teacherForm.password}
            onChange={(event) =>
              updateTeacherForm("password", event.target.value)
            }
            disabled={creatingTeacher}
            style={styles.input}
          />

          <button
            type="submit"
            disabled={creatingTeacher}
            style={styles.primaryButton}
          >
            {creatingTeacher ? "Creating..." : "Create Teacher"}
          </button>
        </form>
      </div>

      <div style={styles.panel}>
        <div style={styles.sectionHeader}>
          <h2>Teachers</h2>
          <button
            onClick={() => fetchTeachers(organizationId)}
            disabled={teachersLoading}
            style={styles.secondaryButton}
          >
            {teachersLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {teachersLoading ? <p>Loading teachers...</p> : null}

        {!teachersLoading && teachers.length === 0 ? (
          <p style={styles.muted}>No active teachers found for this organization.</p>
        ) : null}

        {!teachersLoading && teachers.length > 0 ? (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableCell}>Name</th>
                <th style={styles.tableCell}>Email</th>
                <th style={styles.tableCell}>Status</th>
                <th style={styles.tableCell}>Action</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td style={styles.tableCell}>{teacher.name || "-"}</td>
                  <td style={styles.tableCell}>{teacher.email || "-"}</td>
                  <td style={styles.tableCell}>{teacher.status || "unknown"}</td>
                  <td style={styles.tableCell}>
                    <button
                      onClick={() => revokeTeacher(teacher)}
                      disabled={revokingTeacherId === teacher.id}
                      style={styles.dangerButton}
                    >
                      {revokingTeacherId === teacher.id ? "Revoking..." : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  },
  panel: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  form: {
    display: "grid",
    gap: 10,
    maxWidth: 420,
  },
  input: {
    padding: "10px 12px",
    border: "1px solid #ccc",
    borderRadius: 6,
  },
  primaryButton: {
    background: "#0f172a",
    color: "white",
    border: "none",
    padding: "10px 16px",
    borderRadius: 6,
    cursor: "pointer",
  },
  secondaryButton: {
    background: "#f8fafc",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  dangerButton: {
    background: "#dc2626",
    color: "white",
    border: "none",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  tableCell: {
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 8px",
    textAlign: "left",
  },
  muted: {
    color: "#555",
    margin: "4px 0",
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  success: {
    background: "#dcfce7",
    color: "#166534",
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
};
