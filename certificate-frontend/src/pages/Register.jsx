import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeProvider";

function getRegisterErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "functions/unauthenticated":
      return "Account created, but profile setup needs you to sign in again.";
    case "functions/failed-precondition":
    case "functions/permission-denied":
      return "Account created, but the student profile could not be completed.";
    default:
      return "Registration failed. Please try again.";
  }
}

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const createStudentProfile = useMemo(
    () => httpsCallable(functions, "createStudentProfile"),
    [],
  );

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setLoading(true);
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      const user = userCred.user;

      await user.getIdToken(true);

      await createStudentProfile({
        name: name.trim(),
      });

      navigate("/student", { replace: true });
    } catch (err) {
      console.log(err);
      setError(getRegisterErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <div className="auth-header">
          <div>
            <p className="eyebrow">Student Portal</p>
            <h1>Create account</h1>
            <p className="muted">Self-registered accounts are created as students.</p>
          </div>
          <ThemeToggle />
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form className="grid" onSubmit={handleRegister}>
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </label>

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
              placeholder="Minimum 6 characters"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Register"}
          </button>
        </form>

        <p className="auth-links">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
