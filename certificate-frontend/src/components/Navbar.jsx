import AppLayout from "./AppLayout";

export default function Navbar({ user, role = "student", children }) {
  return (
    <AppLayout
      user={user}
      role={role}
      title="Student Dashboard"
      subtitle="View certificate verification status."
      navItems={[{ to: "/student", label: "Student", icon: "S" }]}
    >
      {children}
    </AppLayout>
  );
}
