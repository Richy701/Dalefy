import flattenColorPalette from "tailwindcss/lib/util/flattenColorPalette";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Tremor constructs these class names dynamically at runtime — Tailwind
    // can't find them during its content scan so we safelist the colors we use.
    ...["slate","teal","amber","sky","rose","emerald","red"].flatMap(c => [
      `fill-${c}-500`, `dark:fill-${c}-500`,
      `stroke-${c}-500`, `dark:stroke-${c}-500`,
      `bg-${c}-500`, `dark:bg-${c}-500`,
      `text-${c}-500`, `dark:text-${c}-500`,
      `hover:bg-${c}-500`, `dark:hover:bg-${c}-500`,
    ]),
  ],
  theme: {
    extend: {
      data: {
        active: 'active',
      },
      fontFamily: {
        condensed: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: "rgb(var(--brand-rgb) / <alpha-value>)",
        // Tremor chart tokens — light mode
        tremor: {
          brand: {
            faint: "#f0fdfa",
            muted: "#ccfbf1",
            subtle: "#5eead4",
            DEFAULT: "#0bd2b5",
            emphasis: "#0d9488",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f8fafc",
            subtle: "#f1f5f9",
            DEFAULT: "#ffffff",
            emphasis: "#e2e8f0",
          },
          border: { DEFAULT: "#e2e8f0" },
          ring: { DEFAULT: "#e2e8f0" },
          content: {
            subtle: "#94a3b8",
            DEFAULT: "#64748b",
            emphasis: "#1e293b",
            strong: "#0f172a",
            inverted: "#ffffff",
          },
        },
        // Tremor chart tokens — dark mode
        "dark-tremor": {
          brand: {
            faint: "#050505",
            muted: "#0a0a0a",
            subtle: "#0bd2b5",
            DEFAULT: "#0bd2b5",
            emphasis: "#0bd2b5",
            inverted: "#050505",
          },
          background: {
            muted: "#0a0a0a",
            subtle: "#111111",
            DEFAULT: "#111111",
            emphasis: "#1f1f1f",
          },
          border: { DEFAULT: "#1f1f1f" },
          ring: { DEFAULT: "#1f1f1f" },
          content: {
            subtle: "#555555",
            DEFAULT: "#888888",
            emphasis: "#ffffff",
            strong: "#ffffff",
            inverted: "#050505",
          },
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          accent: {
            DEFAULT: "hsl(var(--sidebar-accent))",
            foreground: "hsl(var(--sidebar-accent-foreground))",
          },
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.4s ease-out",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [
    // Tremor needs fill-* and stroke-* utilities for SVG chart elements
    function({ matchUtilities, theme }) {
      matchUtilities(
        { "fill": (value) => ({ fill: value }) },
        { values: flattenColorPalette(theme("colors")), type: "color" }
      );
      matchUtilities(
        { "stroke": (value) => ({ stroke: value }) },
        { values: flattenColorPalette(theme("colors")), type: "color" }
      );
    },
  ],
}
