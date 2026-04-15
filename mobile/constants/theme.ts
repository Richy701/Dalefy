export const darkColors = {
  bg: "#060608",
  surface: "#0a0a0d",
  card: "#111116",
  elevated: "#18181f",

  border: "rgba(255,255,255,0.07)",
  borderLight: "rgba(255,255,255,0.04)",

  textPrimary: "#EDEDEF",
  textSecondary: "#8A8F98",
  textTertiary: "#4a4f59",
  textDim: "#2a2f38",

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

  flight: "#60a5fa",
  hotel: "#0bd2b5",
  activity: "#a78bfa",
  dining: "#fb923c",
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
  textTertiary: "#8c93a3",
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

  flight: "#1d6ee6",
  hotel: "#0099a8",
  activity: "#6d28d9",
  dining: "#c2410c",
};

// Backward compat — screens not yet migrated to useTheme() will always get dark
export const C = darkColors;

export type ThemeColors = typeof darkColors;

export const T = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  "4xl": 34,

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
