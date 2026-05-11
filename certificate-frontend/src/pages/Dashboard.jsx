import Navbar from "../components/Navbar";

export default function Dashboard({ user }) {
  return (
    <div>
      <Navbar user={user} />

      <div style={{ padding: "20px" }}>
        <h1>Dashboard</h1>

        <h3>Welcome {user?.email}</h3>
      </div>
    </div>
  );
}