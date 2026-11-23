import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
// Self-hosted fonts (Qasr Obsidian), bundled and cached by the service worker
// so a demo never waits on the network: IBM Plex Sans Arabic (body), Noto Kufi
// Arabic (Arabic display, Arabic subset only), Plus Jakarta Sans (Latin) and
// IBM Plex Mono (codes, plates and timestamps; Latin subset only).
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/noto-kufi-arabic/arabic-600.css";
import "@fontsource/noto-kufi-arabic/arabic-700.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./i18n";
import "./styles/index.css";
import { App } from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { TooltipProvider } from "./components/ui/Tooltip";
import { PwaUpdateBanner } from "./components/PwaUpdateBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user" collapses every motion/react animation to a fade when the OS asks for it. */}
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <App />
          <PwaUpdateBanner />
        </ToastProvider>
      </TooltipProvider>
    </MotionConfig>
  </StrictMode>
);
