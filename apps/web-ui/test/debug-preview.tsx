import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import "../src/styles.css";
import "../src/start-page.css";
import "../src/project-page.css";
import "../src/protocol-code.css";
import "../src/message-workbench.css";
import "../src/debug-workbench.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
