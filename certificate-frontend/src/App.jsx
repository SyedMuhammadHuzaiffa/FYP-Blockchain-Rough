import { BrowserRouter, Routes, Route } from "react-router-dom";
import Admin from "./pages/Admin";

import Login from "./pages/Login";
import Register from "./pages/Register";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<Admin />} />

        {/* placeholders for now */}
        <Route path="/admin" element={<h1>Admin</h1>} />
        <Route path="/teacher" element={<h1>Teacher</h1>} />
        <Route path="/student" element={<h1>Student</h1>} />
      </Routes>
    </BrowserRouter>
  );
}
