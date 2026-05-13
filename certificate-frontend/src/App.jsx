import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import { auth, db } from "./firebase";

import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastProvider from "./components/ToastProvider";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const OrgAdminDashboard = lazy(() => import("./pages/OrgAdminDashboard"));
const VerifyCertificate = lazy(() => import("./pages/VerifyCertificate"));

function RouteFallback() {
  return <div className="loading-screen">Loading page...</div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (currentUser) {
        setUser(currentUser);

        const docRef = doc(db, "users", currentUser.uid);

        unsubscribeProfile = onSnapshot(
          docRef,
          (docSnap) => {
            setRole(docSnap.exists() ? docSnap.data().role || "" : "");
            setLoading(false);
          },
          (error) => {
            console.error("Failed to load user profile:", error);
            setRole("");
            setLoading(false);
          },
        );
      } else {
        setUser(null);
        setRole("");
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading application...</div>;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* PUBLIC */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                  path="/verify/:certificateId"
                  element={<VerifyCertificate />}
                />

                {/* SUPER ADMIN */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["superadmin"]}
                    >
                      <SuperAdmin user={user} role={role} view="overview" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/organizations"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["superadmin"]}
                    >
                      <SuperAdmin user={user} role={role} view="organizations" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/create-organization"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["superadmin"]}
                    >
                      <SuperAdmin user={user} role={role} view="createOrganization" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/org-admins"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["superadmin"]}
                    >
                      <SuperAdmin user={user} role={role} view="orgAdmins" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/create-org-admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["superadmin"]}
                    >
                      <SuperAdmin user={user} role={role} view="createOrgAdmin" />
                    </ProtectedRoute>
                  }
                />

                {/* TEACHER */}
                <Route
                  path="/dashboard"
                  element={
                    role === "orgAdmin" ? (
                      <Navigate to="/org-admin" replace />
                    ) : (
                      <ProtectedRoute
                        user={user}
                        role={role}
                        allowedRoles={["teacher"]}
                      >
                        <OrgAdminDashboard user={user} view="overview" />
                      </ProtectedRoute>
                    )
                  }
                />
                <Route
                  path="/dashboard/issue"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["teacher"]}
                    >
                      <OrgAdminDashboard user={user} view="issue" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/bulk-issue"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["teacher"]}
                    >
                      <OrgAdminDashboard user={user} view="bulkIssue" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/certificates"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["teacher"]}
                    >
                      <OrgAdminDashboard user={user} view="certificates" />
                    </ProtectedRoute>
                  }
                />

                {/* ORG ADMIN */}
                <Route
                  path="/org-admin"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["orgAdmin"]}
                    >
                      <OrgAdminDashboard user={user} view="overview" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/org-admin/teachers"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["orgAdmin"]}
                    >
                      <OrgAdminDashboard user={user} view="teachers" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/org-admin/create-teacher"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["orgAdmin"]}
                    >
                      <OrgAdminDashboard user={user} view="createTeacher" />
                    </ProtectedRoute>
                  }
                />

                {/* STUDENT */}
                <Route
                  path="/student"
                  element={
                    <ProtectedRoute
                      user={user}
                      role={role}
                      allowedRoles={["student"]}
                    >
                      <StudentDashboard user={user} role={role} />
                    </ProtectedRoute>
                  }
                />

                {/* DEFAULT ROUTE */}
                <Route
                  path="/"
                  element={
                    user ? (
                      role === "superadmin" ? (
                        <Navigate to="/admin" />
                      ) : role === "teacher" ? (
                        <Navigate to="/dashboard" />
                      ) : role === "orgAdmin" ? (
                        <Navigate to="/org-admin" />
                      ) : (
                        <Navigate to="/student" />
                      )
                    ) : (
                      <Navigate to="/login" />
                    )
                  }
                />

                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
