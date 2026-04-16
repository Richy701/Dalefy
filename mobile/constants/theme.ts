export const darkColors = {
  bg: "#050505",
  surface: "#080808",
  card: "#111111",
  elevated: "#1a1a1a",

  border: "rgba(255,255,255,0.12)",
  borderLight: "rgba(255,255,255,0.06)",

  textPrimary: "#EDEDEF",
  textSecondary: "#9a9a9a",
  textTertiary: "#7a7a7a",
  textDim: "#333333",

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

  // Event type colors — matched exactly to web DashboardPage EVENT_COLORS
  flight: "#60a5fa",    // blue-400  (web: text-blue-500)
  hotel: "#f59e0b",     // amber-500 (web: text-amber-500)
  activity: "#0bd2b5",  // teal      (web: text-[#0bd2b5])
  dining: "#ec4899",    // pink-500  (web: text-pink-500)
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

  teal: "#0099a8",
  tealDim: "rgba(0,153,168,0.1)",
  tealMid: "rgba(0,153,168,0.25)",
  tealGlow: "rgba(0,153,168,0.15)",

  green: "#0a8f6a",
  greenDim: "rgba(10,143,106,0.1)",
  amber: "#b45309",
  amberDim: "rgba(180,83,9,0.1)",
  red: "#c0392b",
  redDim: "rgba(192,57,43,0.1)",

  // Event type colors — matched exactly to web DashboardPage EVENT_COLORS (darkened for light bg)
  flight: "#1d6ee6",    // blue-600   (web: text-blue-500)
  hotel: "#d97706",     // amber-600  (web: text-amber-500)
  activity: "#0099a8",  // teal       (web: text-[#0bd2b5], lightened for contrast)
  dining: "#db2777",    // pink-600   (web: text-pink-500)
};

// Backward compat — screens not yet migrated to useTheme() will always get dark
export const C = darkColors;

export type ThemeColors = typeof darkColors;

export const F = {
  bold: "BarlowCondensed_700Bold",
  extrabold: "BarlowCondensed_800ExtraBold",
  black: "BarlowCondensed_900Black",
} as const;

export const T = {
  xs: 12,
  sm: 13,
  base: 16,
  md: 17,
  lg: 19,
  xl: 22,
  "2xl": 26,
  "3xl": 30,
  "4xl": 36,

  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

export const R = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 28,
  full: 100,
};

export const S = {
  "2xs": 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  "2xl": 36,
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
  { id: "teal",    label: "Cyber Teal",      dark: "#0bd2b5", light: "#0099a8" },
  { id: "violet",  label: "Electric Violet", dark: "#8b5cf6", light: "#7c3aed" },
  { id: "amber",   label: "Solar Amber",     dark: "#f59e0b", light: "#b45309" },
  { id: "crimson", label: "Crimson",         dark: "#ef4444", light: "#c0392b" },
  { id: "cobalt",  label: "Cobalt",          dark: "#3b82f6", light: "#1d6ee6" },
  { id: "lime",    label: "Lime",            dark: "#84cc16", light: "#5c8a10" },
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
  const [r, g, b] = hexToRgbTuple(hex);
  return {
    ...base,
    teal: hex,
    tealDim: `rgba(${r},${g},${b},0.1)`,
    tealMid: `rgba(${r},${g},${b},0.25)`,
    tealGlow: `rgba(${r},${g},${b},0.15)`,
    activity: hex,
  };
}
