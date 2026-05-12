import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import { auth, db } from "./firebase";

import Login from "./pages/Login";
import Register from "./pages/Register";
import SuperAdmin from "./pages/SuperAdmin";
import Dashboard from "./pages/Dashboard";
import StudentDashboard from "./pages/StudentDashboard";
import OrgAdminDashboard from "./pages/OrgAdminDashboard";
import VerifyCertificate from "./pages/VerifyCertificate";

import ProtectedRoute from "./components/ProtectedRoute";
import { ThemeProvider } from "./components/ThemeProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastProvider from "./components/ToastProvider";

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
                    <SuperAdmin user={user} role={role} />
                  </ProtectedRoute>
                }
              />

              {/* TEACHER / ORG ADMIN */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute
                    user={user}
                    role={role}
                    allowedRoles={["teacher", "orgAdmin"]}
                  >
                    <OrgAdminDashboard user={user} />
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
                    ) : role === "teacher" || role === "orgAdmin" ? (
                      <Navigate to="/dashboard" />
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
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
