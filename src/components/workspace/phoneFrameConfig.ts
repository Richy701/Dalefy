export type Device = "iphone" | "android";

export const DEVICES: Array<{ key: Device; label: string }> = [
  { key: "iphone", label: "iPhone 17 Pro" },
  { key: "android", label: "Pixel 10 Pro" },
];

export interface Finish { key: string; label: string; a: string; b: string; c: string; edge: string; seam: string; button: string }

export const FINISHES: Record<Device, Finish[]> = {
  iphone: [
    { key: "deep-blue", label: "Deep Blue", a: "#3a4a6a", b: "#161d2c", c: "#24304a", edge: "rgba(255,255,255,0.2)", seam: "#0b0e16", button: "#3b4a6b" },
    { key: "cosmic-orange", label: "Cosmic Orange", a: "#f5a05a", b: "#8f4416", c: "#d2702f", edge: "rgba(255,255,255,0.35)", seam: "#5a2a0c", button: "#d97a38" },
    { key: "silver", label: "Silver", a: "#f4f4f7", b: "#c2c3ca", c: "#e1e1e6", edge: "rgba(255,255,255,0.9)", seam: "#9a9aa3", button: "#d6d6dc" },
  ],
  android: [
    { key: "obsidian", label: "Obsidian", a: "#3c3c40", b: "#141416", c: "#26262a", edge: "rgba(255,255,255,0.18)", seam: "#0a0a0b", button: "#2e2e33" },
    { key: "moonstone", label: "Moonstone", a: "#8d9bb0", b: "#3d4757", c: "#5f6c80", edge: "rgba(255,255,255,0.3)", seam: "#2a313d", button: "#6a778b" },
    { key: "jade", label: "Jade", a: "#a9c9b8", b: "#4d6c5c", c: "#7fa08e", edge: "rgba(255,255,255,0.35)", seam: "#3a5347", button: "#88a996" },
    { key: "porcelain", label: "Porcelain", a: "#f6f4ef", b: "#c9c5bb", c: "#e6e2d9", edge: "rgba(255,255,255,0.9)", seam: "#a19d94", button: "#d9d5cc" },
  ],
};
