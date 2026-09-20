import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts: Arabic UI face + Latin variable face. Loaded here so
// they are bundled and cached by the service worker (no network at demo time).
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource-variable/inter";
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
