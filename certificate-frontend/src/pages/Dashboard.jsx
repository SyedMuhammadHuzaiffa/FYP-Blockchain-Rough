import Navbar from "../components/Navbar";

export default function Dashboard({ user }) {
  return (
    <Navbar user={user}>
      <section className="card">
        <h1>Dashboard</h1>
        <p className="muted">Welcome {user?.email}</p>
      </section>
    </Navbar>
  );
}
