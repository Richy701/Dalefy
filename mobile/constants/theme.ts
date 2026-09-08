import { Platform, type ViewStyle } from "react-native";

export const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : 60;

/** Standard bottom padding for scrollable screens (clears tab bar + breathing room) */
export const SCROLL_BOTTOM_PAD = 100;

export const darkColors = {
  bg: "#09090b",
  surface: "#0e0e12",
  card: "#141418",
  elevated: "#1c1c22",

  border: "rgba(255,255,255,0.10)",
  borderLight: "rgba(255,255,255,0.05)",

  textPrimary: "#EDEDEF",
  textSecondary: "#9a9a9a",
  textTertiary: "#8e8e96",
  textDim: "#4a4a4a",

  teal: "#0bd2b5",
  tealText: "#0bd2b5",
  tealDim: "rgba(11,210,181,0.1)",
  tealMid: "rgba(11,210,181,0.25)",

  toggleTrack: "#3F3F46",

  green: "#10b981",
  greenText: "#10b981",
  greenDim: "rgba(16,185,129,0.12)",
  greenMid: "rgba(16,185,129,0.25)",
  amber: "#f59e0b",
  amberText: "#f59e0b",
  amberDim: "rgba(245,158,11,0.12)",
  amberMid: "rgba(245,158,11,0.25)",
  red: "#ef4444",
  redText: "#f87171",
  redDim: "rgba(239,68,68,0.12)",
  redMid: "rgba(239,68,68,0.25)",

  /** Text/icon color for content sitting on the accent (teal) fill */
  onAccent: "#000000",

  /** Over-photo glass pill surface + border */
  glass: "rgba(9,9,11,0.65)",
  glassBorder: "rgba(255,255,255,0.10)",

  // Event categories — Apple Maps style: one glyph colour + one soft fill each.
  // The accent (teal) is never a category colour, so it can mean "tap" or "live".
  flight: "#6FA8F5",
  hotel: "#B08CF0",
  activity: "#F07AA3",
  dining: "#F0975A",
  transfer: "#A0AEC0",
  flightSoft: "rgba(111,168,245,0.18)",
  hotelSoft: "rgba(176,140,240,0.18)",
  activitySoft: "rgba(240,122,163,0.18)",
  diningSoft: "rgba(240,151,90,0.18)",
  transferSoft: "rgba(160,174,192,0.18)",
};

export const lightColors = {
  bg: "#f5f6fa",
  surface: "#eef0f5",
  card: "#ffffff",
  elevated: "#f0f1f5",

  border: "rgba(0,0,0,0.07)",
  borderLight: "rgba(0,0,0,0.03)",

  textPrimary: "#0d0f14",
  textSecondary: "#4b5263",
  textTertiary: "#555d6e",
  textDim: "#c5cad6",

  teal: "#0ab8a0",
  tealText: "#007a68",
  tealDim: "rgba(10,184,160,0.12)",
  tealMid: "rgba(10,184,160,0.28)",

  toggleTrack: "#D1D5DB",

  green: "#10b981",
  greenText: "#047857",
  greenDim: "rgba(16,185,129,0.12)",
  greenMid: "rgba(16,185,129,0.25)",
  amber: "#f59e0b",
  amberText: "#b45309",
  amberDim: "rgba(245,158,11,0.12)",
  amberMid: "rgba(245,158,11,0.25)",
  red: "#ef4444",
  redText: "#b91c1c",
  redDim: "rgba(239,68,68,0.12)",
  redMid: "rgba(239,68,68,0.25)",

  onAccent: "#000000",

  glass: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(0,0,0,0.10)",

  flight: "#2F80ED",
  hotel: "#8E5CD9",
  activity: "#E0447A",
  dining: "#E8791D",
  transfer: "#4A5568",
  flightSoft: "rgba(47,128,237,0.14)",
  hotelSoft: "rgba(142,92,217,0.14)",
  activitySoft: "rgba(224,68,122,0.14)",
  diningSoft: "rgba(232,121,29,0.14)",
  transferSoft: "rgba(74,85,104,0.14)",
};

export type ThemeColors = typeof darkColors;

export const F = {
  // Brand headings — Barlow Condensed (uppercase, tight tracking)
  bold: "BarlowCondensed_700Bold",
  extrabold: "BarlowCondensed_800ExtraBold",
  black: "BarlowCondensed_900Black",
  // Body text — iOS system font (SF Pro)
  system: "System",
  systemRounded: "System",
} as const;

export const T = {
  "2xs": 10,
  xs: 11,
  sm: 12,
  base: 15,
  md: 16,
  lg: 17,
  xl: 20,
  "2xl": 23,
  "3xl": 27,
  "4xl": 32,
  "5xl": 36,

  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

export const R = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 22,
  "2xl": 28,
  full: 100,
};

export const S = {
  "2xs": 4,
  xs2: 6,
  xs: 8,
  sm2: 10,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  "2xl": 36,
};

/**
 * Elevation recipes. Shadows are a light-mode affordance — a black shadow on
 * #09090b is invisible, so dark mode returns {} and saves the render pass.
 */
export function shadow(level: "subtle" | "card" | "deep", isDark: boolean): ViewStyle {
  if (isDark) return {};
  switch (level) {
    case "subtle":
      return { shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 };
    case "card":
      return { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
    case "deep":
      return { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 5 };
  }
}

export function statusColor(status: string, C: ThemeColors = darkColors) {
  if (status === "Published") return C.green;
  if (status === "In Progress") return C.teal;
  return C.textTertiary;
}

export function statusBg(status: string, C: ThemeColors = darkColors) {
  if (status === "Published") return C.greenDim;
  if (status === "In Progress") return C.tealDim;
  return C.elevated;
}

export function eventColor(type: string, C: ThemeColors = darkColors): string {
  return (C as any)[type] ?? C.activity;
}

export type EventCategory = "flight" | "hotel" | "activity" | "dining" | "transfer";
const CATEGORIES: EventCategory[] = ["flight", "hotel", "activity", "dining", "transfer"];
export const CATEGORY_LABEL: Record<EventCategory, string> = {
  flight: "Flight", hotel: "Stay", activity: "Activity", dining: "Meal", transfer: "Transfer",
};
/** Glyph colour + soft fill for a category circle. Unknown types fall back to Activity. */
export function categoryTone(type: string, C: ThemeColors): { fg: string; bg: string } {
  const key = (CATEGORIES as string[]).includes(type) ? (type as EventCategory) : "activity";
  return { fg: (C as any)[key], bg: (C as any)[`${key}Soft`] };
}

export type StatusTone = {
  /** Vivid color for icons/dots/fills */
  color: string;
  /** AA-compliant color for text */
  text: string;
  /** Soft background */
  bg: string;
  /** Border (0.25 alpha) */
  border: string;
};

/**
 * The single source of truth for status → color. Replaces the per-file maps
 * that had drifted onto three different greens.
 */
export function statusTone(status: string, C: ThemeColors): StatusTone {
  const s = status.toLowerCase().replace(/[\s_-]/g, "");
  const green: StatusTone = { color: C.green, text: C.greenText, bg: C.greenDim, border: C.greenMid };
  const amber: StatusTone = { color: C.amber, text: C.amberText, bg: C.amberDim, border: C.amberMid };
  const red: StatusTone = { color: C.red, text: C.redText, bg: C.redDim, border: C.redMid };
  const teal: StatusTone = { color: C.teal, text: C.tealText, bg: C.tealDim, border: C.tealMid };
  const neutral: StatusTone = { color: C.textTertiary, text: C.textTertiary, bg: C.elevated, border: C.border };

  if (["ontime", "landed", "arrived", "published", "signed", "confirmed", "complete", "completed", "done"].includes(s)) return green;
  if (["delayed", "pending", "inreview", "expiring", "boarding"].includes(s)) return amber;
  if (["cancelled", "canceled", "expired", "missed", "diverted"].includes(s)) return red;
  if (["live", "active", "inprogress", "now"].includes(s)) return teal;
  return neutral;
}

export const ACCENT_PALETTE = [
  { id: "teal",    label: "Cyber Teal",      dark: "#0bd2b5", light: "#0ab8a0" },
  { id: "violet",  label: "Electric Violet", dark: "#8b5cf6", light: "#8b5cf6" },
  { id: "amber",   label: "Solar Amber",     dark: "#f59e0b", light: "#f59e0b" },
  { id: "crimson", label: "Crimson",         dark: "#ef4444", light: "#ef4444" },
  { id: "cobalt",  label: "Cobalt",          dark: "#3b82f6", light: "#3b82f6" },
  { id: "lime",    label: "Lime",            dark: "#84cc16", light: "#84cc16" },
] as const;

export type AccentId = typeof ACCENT_PALETTE[number]["id"];

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function relLuminance(r: number, g: number, b: number): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/**
 * Derive an AA-safe text shade (>= 4.5:1 on white) from an accent.
 * Keeps hue, holds saturation high, and only lowers lightness, so the
 * result reads as a darker version of the brand colour rather than a muddy one.
 */
function aaTextShade(hex: string): string {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l0 = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  const s = Math.max(s0, 0.9);
  for (let l = Math.min(l0, 0.4); l >= 0.05; l -= 0.01) {
    const [cr, cg, cb] = hslToRgb(h, s, l);
    if ((1.05) / (relLuminance(cr, cg, cb) + 0.05) >= 4.5) {
      return `#${[cr, cg, cb].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return "#000000";
}

export function applyAccent(base: ThemeColors, accent: AccentId, isDark: boolean): ThemeColors {
  const preset = ACCENT_PALETTE.find((p) => p.id === accent) ?? ACCENT_PALETTE[0];
  const hex = isDark ? preset.dark : preset.light;
  return applyAccentHex(base, hex);
}

export function isValidHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(v);
}

export function applyAccentHex(base: ThemeColors, hex: string): ThemeColors {
  const [r, g, b] = hexToRgbTuple(hex);
  const isLight = base.card === "#ffffff";
  return {
    ...base,
    teal: hex,
    // On light backgrounds a raw accent rarely passes AA as text — derive a darker shade.
    tealText: isLight ? aaTextShade(hex) : hex,
    tealDim: `rgba(${r},${g},${b},0.1)`,
    tealMid: `rgba(${r},${g},${b},0.25)`,
  };
}
