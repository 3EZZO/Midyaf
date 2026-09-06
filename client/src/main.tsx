import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles/index.css";
import { App } from "./App";
import { TacticalToastProvider } from "./components/TacticalToast";
import { PwaUpdateBanner } from "./components/PwaUpdateBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TacticalToastProvider>
      <App />
      <PwaUpdateBanner />
    </TacticalToastProvider>
  </StrictMode>
);

