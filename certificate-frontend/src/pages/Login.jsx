import { useState } from "react";
import { loginUser, getUserRole } from "../auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const user = await loginUser(email, password);

      const role = await getUserRole(user.uid);

      // ROLE ROUTING
      if (role === "superadmin") navigate("/admin");
      else if (role === "teacher") navigate("/teacher");
      else navigate("/student");

    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>

      <input
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />

      <input
        placeholder="Password"
        type="password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <br />

      <button onClick={handleLogin}>
        Login
      </button>
    </div>
  );
}