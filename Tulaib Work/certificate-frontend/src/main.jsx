import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
console.log("ENV KEY =", import.meta.env.VITE_NFT_STORAGE_KEY);


createRoot(document.getElementById("root")).render(<App />);
