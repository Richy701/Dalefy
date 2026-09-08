/** Airline brand colours keyed by IATA code (mirrors web src/data/airlines.ts). */
export const AIRLINE_COLORS: Record<string, string> = {
  BA: "#075aaa", EK: "#d71a21", QR: "#5c0632", TK: "#c80815", LH: "#05164d", AF: "#002157",
  KL: "#00a1de", QF: "#e0001b", SQ: "#f5a623", CX: "#006564", NH: "#13448f", JL: "#c80815",
  DL: "#003a70", AA: "#0078d2", UA: "#002244", WN: "#f9b612", FR: "#073590", U2: "#ff6600",
  W6: "#c6007e", KQ: "#003e1f", ET: "#005f3b", SA: "#f37021", XQ: "#fdc200", PC: "#1d2671",
  TG: "#3e1f6e", MH: "#004b87", EY: "#bd8b13", VS: "#e40028", DY: "#d81939", FI: "#003893",
  AY: "#0b1560", SK: "#000080", LX: "#c80815", OS: "#c80815", IB: "#d7192d", RJ: "#1f3d73",
  WY: "#8e6f3e", GF: "#c0a062", SV: "#006747", AI: "#e23a28", UL: "#003580", PK: "#006747",
  FZ: "#f26522", G9: "#ed7902", KC: "#00b0f0", MS: "#002e6d", AT: "#c80815", LO: "#003189",
  TP: "#006747", AZ: "#00563f", VN: "#e0861a", CZ: "#003399", MU: "#003399", CA: "#c80815",
  OZ: "#003d6b", KE: "#003876", BR: "#006747", CI: "#e4007f", JQ: "#ff5400", VA: "#e10a21",
  AC: "#c80815", WS: "#00b2a9", AS: "#014983", B6: "#003876", HA: "#4b2069", F9: "#01890f",
  NK: "#ffee00",
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Brand colour for an airline icon on a given surface, nudged toward white (dark theme)
 * or black (light theme) until it clears WCAG 3:1 for non-text graphics.
 * Returns null when the airline is unknown so callers can fall back to the category tone.
 */
export function airlineAccent(iata: string, surfaceHex: string, isDark: boolean): string | null {
  const base = AIRLINE_COLORS[iata.toUpperCase()];
  if (!base) return null;
  const surface = hexToRgb(surfaceHex);
  const target: [number, number, number] = isDark ? [255, 255, 255] : [0, 0, 0];
  let rgb = hexToRgb(base);
  for (let i = 0; i < 20 && contrast(rgb, surface) < 3; i++) {
    rgb = rgb.map((v, k) => v + (target[k] - v) * 0.12) as [number, number, number];
  }
  return rgbToHex(rgb);
}
