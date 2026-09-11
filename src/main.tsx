import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { App } from "./ui/App.js";
import "./ui/styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
