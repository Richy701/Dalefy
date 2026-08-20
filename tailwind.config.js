/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      data: {
        active: 'active',
      },
      fontFamily: {
        // Body, UI and headings. `font-sans` previously fell through to the
        // system stack, so the fonts the app downloaded were never rendered.
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        // Kept as aliases so existing/future `font-display` usage resolves;
        // Geist carries headings through weight and tracking, not a second face.
        display: ['Geist', 'system-ui', 'sans-serif'],
        condensed: ['Geist', 'system-ui', 'sans-serif'],
        // Times, flight numbers, IATA codes — anything that lines up in columns.
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Third elevation tier, above card
        "surface-raised": "hsl(var(--surface-raised) / <alpha-value>)",
        // Warm secondary — stays, hotels, non-urgent state
        sand: {
          DEFAULT: "hsl(var(--sand) / <alpha-value>)",
          foreground: "hsl(var(--sand-foreground) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand-rgb) / <alpha-value>)",
          50: "hsl(var(--brand-50) / <alpha-value>)",
          100: "hsl(var(--brand-100) / <alpha-value>)",
          200: "hsl(var(--brand-200) / <alpha-value>)",
          300: "hsl(var(--brand-300) / <alpha-value>)",
          400: "hsl(var(--brand-400) / <alpha-value>)",
          500: "hsl(var(--brand-500) / <alpha-value>)",
          600: "hsl(var(--brand-600) / <alpha-value>)",
          700: "hsl(var(--brand-700) / <alpha-value>)",
          800: "hsl(var(--brand-800) / <alpha-value>)",
          900: "hsl(var(--brand-900) / <alpha-value>)",
          950: "hsl(var(--brand-950) / <alpha-value>)",
        },
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
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          accent: {
            DEFAULT: "hsl(var(--sidebar-accent))",
            foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          },
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
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
  // fill-* and stroke-* color utilities that Tremor charts need are built into
  // Tailwind v4, so the plugin that used to generate them is gone.
  plugins: [],
}
