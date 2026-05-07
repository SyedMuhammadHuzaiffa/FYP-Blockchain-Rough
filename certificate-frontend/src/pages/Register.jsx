import { useState } from "react";
import { registerUser } from "../auth";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      // Default role = student
      await registerUser(email, password, "student");

      alert("Student Registered!");
      navigate("/login");
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Register</h2>

      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />

      <br />

      <input
        placeholder="Password"
        type="password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <br />

      <button onClick={handleRegister}>Register</button>
    </div>
  );
}
