import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles/index.css";
import { App } from "./App";
import { TacticalToastProvider } from "./components/TacticalToast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TacticalToastProvider>
      <App />
    </TacticalToastProvider>
  </StrictMode>
);

