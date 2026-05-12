import { Link, NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { ThemeToggle } from "./ThemeProvider";

const roleLabels = {
  superadmin: "Super Admin",
  orgAdmin: "Org Admin",
  teacher: "Teacher",
  student: "Student",
};

function getInitial(email = "") {
  return email.trim().charAt(0).toUpperCase() || "U";
}

export default function AppLayout({
  children,
  user,
  role,
  title,
  subtitle,
  navItems = [],
  actions,
}) {
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Application navigation">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">BC</span>
          <span>
            <span className="brand-title">CertChain</span>
            <span className="brand-subtitle">Verification System</span>
          </span>
        </Link>

        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "nav-item nav-item-active" : "nav-item"
              }
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="page-heading">
            <p className="eyebrow">Blockchain Certificate Verification</p>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <div className="topbar-actions">
            {actions}
            <ThemeToggle />
            <div className="profile-chip" title={user?.email || "Signed in"}>
              <span className="profile-avatar">{getInitial(user?.email)}</span>
              <span className="profile-meta">
                <strong>{roleLabels[role] || "User"}</strong>
                <span>{user?.email || "No email"}</span>
              </span>
            </div>
            <button type="button" className="button button-tonal" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
