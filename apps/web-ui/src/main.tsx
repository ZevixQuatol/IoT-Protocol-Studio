import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./start-page.css";
import "./project-page.css";
import "./protocol-code.css";
import "./message-workbench.css";
import "./debug-workbench.css";
import "./communication-workbench.css";
import "./ui-consistency.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
