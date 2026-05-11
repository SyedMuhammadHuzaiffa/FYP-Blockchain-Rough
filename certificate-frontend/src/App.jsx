import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebase";

import Login from "./pages/Login";
import Register from "./pages/Register";
import SuperAdmin from "./pages/SuperAdmin";
import Dashboard from "./pages/Dashboard";
import StudentDashboard from "./pages/StudentDashboard";
import OrgAdminDashboard from "./pages/OrgAdminDashboard";

// ✅ ADD THIS (your test page)
import TestAdmin from "./pages/TestAdmin";

import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setRole(docSnap.data().role || "");
        } else {
          setRole("");
        }
      } else {
        setUser(null);
        setRole("");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <h1>Loading...</h1>;

  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 🔥 TEMP TEST ROUTE (NO PROTECTION) */}
        <Route path="/test-admin" element={<TestAdmin />} />

        {/* SUPER ADMIN */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute
              user={user}
              role={role}
              allowedRoles={["superadmin"]}
            >
              <SuperAdmin user={user} />
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
            <ProtectedRoute user={user} role={role} allowedRoles={["student"]}>
              <StudentDashboard user={user} />
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
      </Routes>
    </BrowserRouter>
  );
}
