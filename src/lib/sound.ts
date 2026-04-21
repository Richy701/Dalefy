let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const w = window as unknown as Window & { webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function playChime(kind: "success" | "error" = "success") {
  const ac = getCtx();
  if (!ac) return;

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type = "sine";
  const freqs = kind === "error" ? [440, 330] : [880, 1320];
  osc.frequency.setValueAtTime(freqs[0], now);
  osc.frequency.exponentialRampToValueAtTime(freqs[1], now + 0.09);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.start(now);
  osc.stop(now + 0.2);
}
