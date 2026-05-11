import { useState } from "react";
import { loginUser, getUserRole } from "../Auth";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const user = await loginUser(email, password);
      const role = await getUserRole(user.uid);

      if (role === "superadmin") {
        navigate("/admin");
      } else if (role === "orgAdmin" || role === "teacher") {
        navigate("/dashboard");
      } else if (role === "student") {
        navigate("/student");
      } else {
        alert("No valid role found for this user");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />

      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
