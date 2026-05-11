import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ user, role, allowedRoles, children }) {
  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/login" />;
  }

  return children;
}
