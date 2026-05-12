import { useState } from "react";
import { loginUser, getUserRole } from "../auth";
import { Link, useNavigate } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeProvider";
import { useToast } from "../components/toastContext";

function getLoginErrorMessage(error) {
  switch (error?.code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait and try again.";
    default:
      return "Login failed. Please try again.";
  }
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();

  const handleLogin = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      const user = await loginUser(email, password);
      const role = await getUserRole(user.uid);

      if (role === "superadmin") {
        navigate("/admin");
      } else if (role === "orgAdmin" || role === "teacher") {
        navigate("/dashboard");
      } else if (role === "student") {
        navigate("/student");
      } else {
        toast.warning("No valid role found for this user.");
      }
    } catch (err) {
      toast.error(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <div className="auth-header">
          <div>
            <p className="eyebrow">Secure Access</p>
            <h1>Sign in</h1>
            <p className="muted">Continue to your certificate workspace.</p>
          </div>
          <ThemeToggle />
        </div>

        <form className="grid" onSubmit={handleLogin}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="auth-links">
          New student? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </div>
  );
}
