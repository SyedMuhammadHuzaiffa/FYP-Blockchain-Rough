import React, { useState } from "react";
import Single from "./Single";
import Bulk from "./Bulk";
import Verify from "./Verify";
import IssuedTable from "./IssuedTable";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState("single");

  return (
    <div className="container">
      <header className="header">
        <div className="title">Blockchain Certificate System</div>
        <div className="network">Polygon Amoy (Testnet)</div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === "single" ? "active" : ""}`}
          onClick={() => setTab("single")}
        >
          Teacher – Single
        </button>
        <button
          className={`tab ${tab === "bulk" ? "active" : ""}`}
          onClick={() => setTab("bulk")}
        >
          Teacher – Bulk
        </button>
        <button
          className={`tab ${tab === "verify" ? "active" : ""}`}
          onClick={() => setTab("verify")}
        >
          Student – Verify
        </button>
        <button
          className={`tab ${tab === "issued" ? "active" : ""}`}
          onClick={() => setTab("issued")}
        >
          Admin – Issued
        </button>
      </nav>

      {tab === "single" && <Single />}
      {tab === "bulk" && <Bulk />}
      {tab === "verify" && <Verify />}
      {tab === "issued" && <IssuedTable />}
    </div>
  );
}
