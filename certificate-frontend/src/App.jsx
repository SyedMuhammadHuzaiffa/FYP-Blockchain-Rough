// src/App.jsx
import React, { useState, useEffect } from "react";
import Single from "./Single.jsx";
import Bulk from "./Bulk.tsx";
import Verify from "./Verify.jsx";
import IssuedTable from "./IssuedTable.jsx";
import AIBulkIssuer from "./AIBulkIssuer.jsx";
import MerkleBulkIssuer from "./MerkleBulkIssuer.jsx";
import "./App.css";

export default function App() {
  function getInitialState() {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const cidParam = params.get("cid");
    const mpParam  = params.get("mp");  // Merkle proof payload
    return {
      tab: tabParam === "verify" ? "verify" : "single",
      cid: cidParam || "",
      mp:  mpParam  || "",
    };
  }

  const initial = getInitialState();
  const [tab, setTab]                 = useState(initial.tab);
  const [deepLinkCid, setDeepLinkCid] = useState(initial.cid);
  const [deepLinkMp,  setDeepLinkMp]  = useState(initial.mp);

  useEffect(() => {
    // Delay clearing the URL so Verify.jsx has time to read ?mp= on mount
    if (initial.tab === "verify" || initial.cid) {
      const timer = setTimeout(() => {
        window.history.replaceState({}, "", window.location.pathname);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="container">
      <header className="header">
        <div className="title">Blockchain Certificate System</div>
        <div className="network">Polygon Amoy (Testnet)</div>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === "single"  ? "active" : ""}`} onClick={() => setTab("single")}>
          Teacher – Single
        </button>
        <button className={`tab ${tab === "bulk"    ? "active" : ""}`} onClick={() => setTab("bulk")}>
          Teacher – Bulk
        </button>
        <button className={`tab ${tab === "ai-bulk" ? "active" : ""}`} onClick={() => setTab("ai-bulk")}>
          🤖 AI Generator
        </button>
        <button className={`tab ${tab === "merkle"  ? "active" : ""}`} onClick={() => setTab("merkle")}>
          🌲 Merkle Bulk
        </button>
        <button className={`tab ${tab === "verify"  ? "active" : ""}`} onClick={() => setTab("verify")}>
          Student – Verify
        </button>
        <button className={`tab ${tab === "issued"  ? "active" : ""}`} onClick={() => setTab("issued")}>
          Admin – Issued
        </button>
      </nav>

      {tab === "single"  && <Single />}
      {tab === "bulk"    && <Bulk />}
      {tab === "ai-bulk" && <AIBulkIssuer />}
      {tab === "merkle"  && <MerkleBulkIssuer />}
      {tab === "verify"  && (
        <Verify
          initialCid={deepLinkCid}
          initialMp={deepLinkMp}
          onCidUsed={() => { setDeepLinkCid(""); setDeepLinkMp(""); }}
        />
      )}
      {tab === "issued"  && <IssuedTable />}
    </div>
  );
}