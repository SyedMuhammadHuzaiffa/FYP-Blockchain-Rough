import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      const user = userCred.user;

      // ALL SELF-REGISTERED USERS = STUDENTS
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email,
        role: "student",
        createdAt: new Date(),
      });

      alert("User registered successfully");

      navigate("/login");
    } catch (err) {
      console.log(err);
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Register</h1>

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
