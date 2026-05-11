import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function Navbar({ user }) {
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "15px",
        background: "#111",
        color: "white",
      }}
    >
      <h2>Blockchain Certificates</h2>

      <div>
        {user?.email}

        <button
          onClick={logout}
          style={{
            marginLeft: "10px",
            padding: "8px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}