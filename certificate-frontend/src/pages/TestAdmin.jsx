import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase";
import { useState } from "react";

export default function TestAdmin() {
  const [loading, setLoading] = useState(false);

  const createAdmin = async () => {
    setLoading(true);

    try {
      const user = auth.currentUser;

      console.log("USER:", user);

      if (!user) {
        alert("Not logged in");
        return;
      }

      const token = await user.getIdToken(true);

      console.log("TOKEN EXISTS:", !!token);

      const createOrgAdmin = httpsCallable(functions, "createOrgAdmin");

      const res = await createOrgAdmin({
        email: "testadmin@demo.com",
        password: "12345678",
        orgId: "org_001",
      });

      console.log("SUCCESS:", res.data);
      alert("Org Admin Created!");
    } catch (err) {
      console.error("ERROR:", err);

      alert(err.message || err.code || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Admin Panel</h1>

      <button onClick={createAdmin} disabled={loading}>
        {loading ? "Creating..." : "Create Org Admin"}
      </button>
    </div>
  );
}
