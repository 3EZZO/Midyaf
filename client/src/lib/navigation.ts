import { tacticalAudio } from "./tacticalAudio";

export function smoothScrollToSection(sectionId: string, delayMs = 60) {
  setTimeout(() => {
    const el = document.getElementById(sectionId);
    if (!el) return;

    // Offset scroll so it doesn't get hidden behind the sticky header
    const yOffset = -90;
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;

    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });

    // Visual pulse
    el.classList.remove("target-highlight");
    // Force reflow
    void el.offsetWidth;
    el.classList.add("target-highlight");
    tacticalAudio.playTacticalPing();

    setTimeout(() => {
      el.classList.remove("target-highlight");
    }, 2200);
  }, delayMs);
}
