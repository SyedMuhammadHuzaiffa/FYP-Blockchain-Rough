import { useState } from "react";
import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";

export default function Admin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456"); // temp fixed
  const [role, setRole] = useState("teacher");

  const createUser = async () => {
    await addDoc(collection(db, "pendingUsers"), {
      email,
      password,
      role,
      status: "pending",
    });

    alert("User created (pending system)");
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Super Admin Panel</h2>

      <input
        placeholder="Teacher Email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <br />

      <button onClick={createUser}>Create Teacher</button>
    </div>
  );
}
