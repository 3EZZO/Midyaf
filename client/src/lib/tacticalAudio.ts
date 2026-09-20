// Midyaf Sovereign Tactical Audio Synthesizer
// Pure Web Audio API synthesis — 0 external sound files, 100% reliable, zero network latency

/**
 * Named cues the director and live events use. Each maps onto one of the
 * synthesized sounds below so a script never names an oscillator.
 *   ring      — convoy crossed into a geofence ring (approaching)
 *   handshake — docked at the bay / curbside handshake confirmed
 *   alert     — corridor closed, delay, diversion
 *   chime     — guest arrived / act completed
 *   ping      — generic acknowledgement (navigation, mute toggle)
 */
export type AudioCue = "ring" | "handshake" | "alert" | "chime" | "ping";

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private listeners = new Set<() => void>();

  constructor() {
    try {
      this.muted = typeof localStorage !== "undefined" && localStorage.getItem("midyaf_audio_muted") === "true";
    } catch {
      this.muted = false;
    }
  }

  /** Subscribe to mute changes (for `useSyncExternalStore`). */
  public subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  public cue(name: AudioCue) {
    switch (name) {
      case "ring":
        return this.playTacticalPing();
      case "handshake":
        return this.playBiometricAuth();
      case "alert":
        return this.playAlert();
      case "chime":
        return this.playChime();
      case "ping":
        return this.playTacticalPing();
    }
  }

  public setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    try {
      localStorage.setItem("midyaf_audio_muted", String(muted));
    } catch {
      // Ignore localStorage errors
    }
    this.listeners.forEach((fn) => fn());
    if (!muted) this.playTacticalPing();
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public playTacticalPing() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {
      // Gracefully handle browser autoplay policies
    }
  }

  public playChime() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 (Royal Major Triad)

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.035, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch {
      // Silent fallback
    }
  }

  public playBiometricAuth() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // Silent fallback
    }
  }

  public playAlert() {
    if (this.muted) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(480, now + 0.1);

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Silent fallback
    }
  }
}

export const tacticalAudio = new TacticalAudioEngine();
