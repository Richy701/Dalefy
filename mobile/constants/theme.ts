export const darkColors = {
  bg: "#09090b",
  surface: "#0c0c0f",
  card: "#131316",
  elevated: "#1a1a1f",

  border: "rgba(255,255,255,0.12)",
  borderLight: "rgba(255,255,255,0.06)",

  textPrimary: "#EDEDEF",
  textSecondary: "#9a9a9a",
  textTertiary: "#8a8a8a",
  textDim: "#4a4a4a",

  teal: "#0bd2b5",
  tealDim: "rgba(11,210,181,0.1)",
  tealMid: "rgba(11,210,181,0.25)",
  tealGlow: "rgba(11,210,181,0.15)",

  green: "#10b981",
  greenDim: "rgba(16,185,129,0.12)",
  amber: "#f59e0b",
  amberDim: "rgba(245,158,11,0.12)",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.12)",

  // Event type colors — all use brand accent
  flight: "#0bd2b5",
  hotel: "#0bd2b5",
  activity: "#0bd2b5",
  dining: "#0bd2b5",
  transfer: "#0bd2b5",
};

export const lightColors = {
  bg: "#f7f8fb",
  surface: "#eef0f5",
  card: "#ffffff",
  elevated: "#e9ecf2",

  border: "rgba(0,0,0,0.08)",
  borderLight: "rgba(0,0,0,0.04)",

  textPrimary: "#0d0f14",
  textSecondary: "#4b5263",
  textTertiary: "#606878",
  textDim: "#c5cad6",

  teal: "#0ab8a0",
  tealDim: "rgba(10,184,160,0.12)",
  tealMid: "rgba(10,184,160,0.28)",
  tealGlow: "rgba(10,184,160,0.18)",

  green: "#10b981",
  greenDim: "rgba(16,185,129,0.12)",
  amber: "#f59e0b",
  amberDim: "rgba(245,158,11,0.12)",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.12)",

  flight: "#0ab8a0",
  hotel: "#0ab8a0",
  activity: "#0ab8a0",
  dining: "#0ab8a0",
  transfer: "#0ab8a0",
};

// Backward compat — screens not yet migrated to useTheme() will always get dark
export const C = darkColors;

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
  xs: 11,
  sm: 12,
  base: 15,
  md: 16,
  lg: 17,
  xl: 20,
  "2xl": 23,
  "3xl": 27,
  "4xl": 32,

  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

export const R = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  "2xl": 24,
  full: 100,
};

export const S = {
  "2xs": 3,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 32,
};

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
  return (C as any)[type] ?? C.teal;
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

export function applyAccent(base: ThemeColors, accent: AccentId, isDark: boolean): ThemeColors {
  const preset = ACCENT_PALETTE.find((p) => p.id === accent) ?? ACCENT_PALETTE[0];
  const hex = isDark ? preset.dark : preset.light;
  return applyAccentHex(base, hex);
}

export function applyAccentHex(base: ThemeColors, hex: string): ThemeColors {
  const [r, g, b] = hexToRgbTuple(hex);
  return {
    ...base,
    teal: hex,
    tealDim: `rgba(${r},${g},${b},0.1)`,
    tealMid: `rgba(${r},${g},${b},0.25)`,
    tealGlow: `rgba(${r},${g},${b},0.15)`,
    flight: hex,
    hotel: hex,
    activity: hex,
    dining: hex,
    transfer: hex,
  };
}
