import Navbar from "../components/Navbar";

export default function StudentDashboard({ user }) {
  return (
    <div>
      <Navbar user={user} />

      <div style={{ padding: "20px" }}>
        <h1>Student Dashboard</h1>

        <p>Your certificates will appear here.</p>
      </div>
    </div>
  );
}