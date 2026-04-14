# DAF Adventures — DESIGN.md

> Paste this file into any AI agent and say: "Build a new page/component that matches this design system."

---

## Identity & Atmosphere

DAF Adventures is a premium travel-planning dashboard. The aesthetic is **dark, precise, and editorial** — closer to a high-end design tool than a typical travel app. Think sports car instrument cluster meets luxury magazine layout.

Key qualities:
- **Void-black backgrounds** with near-zero contrast noise
- **Cyber teal** as the single accent — never diluted, never overused
- **Uppercase black italic type** creates urgency and forward motion
- Tight letter-spacing everywhere — this is not a cozy serif experience
- Interactions are crisp: 200ms transitions, spring-physics entrances, glow on focus

Light mode exists and is clean, but **dark mode is the primary experience**.

---

## Color System

### Brand Palette

| Token | Hex | Usage |
|---|---|---|
| `--primary` | `#0BD2B5` | Cyber teal — the only accent. Active states, focus rings, glows, CTAs |
| `--background` (dark) | `#050505` | Void black — page background |
| `--card` (dark) | `#111111` | Card surfaces, sidebar |
| `--border` (dark) | `#1F1F1F` | All borders and dividers |
| `--muted-foreground` | `#888888` | Secondary text, placeholders |
| `--foreground` | `#FFFFFF` | Primary text on dark |
| `--destructive` | `#F87171` | Errors, danger states |

### Semantic Event Colors

| Event Type | Color | Hex |
|---|---|---|
| Hotel | Amber | `#FBBF24` |
| Activity | Cyber Teal | `#0BD2B5` |
| Dining | Pink | `#F472B6` |
| Flight | Slate | `#94A3B8` |
| Confirmed | Emerald | `#10B981` |
| Proposed | Amber | `#F59E0B` |

Event type colors appear as **icon backgrounds at 10% opacity** with the full-saturation color on the icon itself. Never apply event colors to full surfaces.

### Light Mode Overrides

| Token | Hex |
|---|---|
| `--background` | `#FFFFFF` |
| `--card` | `#FFFFFF` |
| `--border` | `#E8EAED` |
| `--muted-foreground` | `#787878` |
| `--foreground` | `#0A0A0A` |

Light mode keeps `#0BD2B5` as the accent — it's the one constant.

---

## Typography

### Font Families

| Role | Family | Fallback |
|---|---|---|
| Body / UI | `Barlow` | `system-ui, sans-serif` |
| Display / Logo | `Barlow Condensed` | `system-ui, sans-serif` |

Import from Google Fonts: `Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700` and `Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,700;1,800;1,900`

### Type Scale

| Use | Size | Weight | Style | Tracking |
|---|---|---|---|---|
| Logo / Hero label | `text-lg` | 900 (Black) | Italic | `tracking-tighter` |
| Section titles | `text-base` | 700 (Bold) | Uppercase Italic | `tracking-[0.2em]` |
| Nav labels | `text-xs` | 700 (Bold) | Uppercase Italic | `tracking-[0.3em]` |
| Card titles | `text-base` | 500 (Medium) | Normal | default |
| Body / Descriptions | `text-sm` | 400 (Regular) | Normal | default |
| Metadata / Labels | `text-xs` | 400–500 | Uppercase | `tracking-wider` |
| Button text | `text-sm` | 500 (Medium) | Normal | `tracking-widest` |

**Rule:** Anything that acts as a label, tag, or heading goes **uppercase**. Body copy and descriptions stay sentence-case.

---

## Spacing & Layout

### Base Unit

The design uses an 8px base grid. All spacing is multiples of 4px (half-unit steps acceptable for fine-tuning).

### Layout Structure

```
┌─────────────────────────────────────────────┐
│  Sidebar (w-64 / 256px)  │  Main content    │
│  hidden below xl         │  flex-1, scroll  │
└─────────────────────────────────────────────┘
```

- Sidebar: `w-64`, `bg-card`, `border-r border-border`
- Sidebar is hidden on viewports narrower than `xl` (1280px)
- Main content scrolls independently; sidebar is fixed

### Common Spacing

| Context | Value |
|---|---|
| Card internal padding | `p-6` (24px) |
| Card small variant | `p-4` (16px) |
| Nav item padding | `px-4 py-3.5` |
| Section vertical gap | `space-y-8` (32px) |
| Item vertical gap | `space-y-6` (24px) |
| Sidebar padding | `p-8 pb-10` |
| Dialog padding | `p-6` |

### Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded-xl` | 12px | Cards, nav items |
| `rounded-2xl` | 16px | Event cards, dialogs, image containers |
| `rounded-full` | 9999px | Avatars, badges, pills |
| `rounded-md` | 8px | Buttons, inputs |

---

## Shadows & Elevation

Elevation is expressed through **layered shadow + border** combos, not just drop shadows.

| Level | Shadow | Use |
|---|---|---|
| Surface | `shadow-xs ring-1 ring-foreground/10` | Cards, default |
| Hover | `shadow-2xl` | Event cards on hover |
| Dialog | `shadow-lg` | Modals, popovers |
| Glow (brand) | `shadow-[0_0_30px_rgba(11,210,181,0.3)]` | Logo badge |
| Glow (accent) | `shadow-[0_0_10px_rgba(11,210,181,0.5)]` | Active indicators |
| Nav active | `shadow-lg shadow-[#0bd2b5]/20` | Sidebar active item |
| Tooltip (dark) | `0 8px 24px rgba(0,0,0,0.4)` | Map tooltips |

**Rule:** Never use shadow alone without a border. Dark surfaces use `border border-[#1f1f1f]`. The combination creates depth without harsh edges.

---

## Component Patterns

### Buttons

```
Base:    rounded-md border font-medium text-sm tracking-widest
         transition-all duration-200
         active:translate-y-px
         focus-visible:ring-3 focus-visible:ring-[#0bd2b5]
         disabled:opacity-50

default: bg-primary text-black hover:bg-primary/90
outline: border-input hover:bg-accent
ghost:   hover:bg-accent hover:text-accent-foreground
```

Sizes: `h-6` (xs) / `h-8` (sm) / `h-9` (default) / `h-10` (lg)

### Cards

```
Base:    rounded-xl bg-card text-sm text-card-foreground
         shadow-xs ring-1 ring-foreground/10

Header:  px-6 pt-6 rounded-t-xl
Title:   text-base font-medium
Desc:    text-sm text-muted-foreground
Content: px-6
Footer:  px-6 pb-6 rounded-b-xl
```

### Inputs

```
h-9 rounded-md border border-input
bg-transparent dark:bg-input/30
px-2.5 py-1 text-sm
shadow-xs
focus-visible:border-[#0bd2b5] focus-visible:ring-3 focus-visible:ring-[#0bd2b5]/30
placeholder:text-muted-foreground
```

### Badges

```
h-5 rounded-full border border-transparent
px-2 py-0.5 text-xs font-medium uppercase tracking-wider
```

### Event Cards

```
bg-white dark:bg-[#111111]
border border-slate-200 dark:border-[#1f1f1f]
rounded-2xl overflow-hidden p-6
hover:border-[#0bd2b5]/40 hover:shadow-2xl
transition-all duration-200
```

Event type icon container: `rounded-xl p-2.5 bg-[eventColor]/10`
Event type icon: full `text-[eventColor]`

### Sidebar Navigation

```
Inactive: text-[#888888] hover:bg-[#1f1f1f] hover:text-white rounded-xl px-4 py-3.5
Active:   bg-[#0bd2b5] text-black rounded-xl px-4 py-3.5
          shadow-lg shadow-[#0bd2b5]/20
```

Labels are **uppercase, 700 weight, italic, tracking-[0.3em]**.

### Sticky Day Headers

```
sticky top-16 z-20
backdrop-blur-md
bg-slate-50/80 dark:bg-[#050505]/80
border-b border-slate-200 dark:border-[#1f1f1f]
```

Active day indicator: `h-2 w-2 rounded-full bg-[#0bd2b5] shadow-[0_0_10px_rgba(11,210,181,0.5)]`

### Map Tooltips

```
background: #111111 (dark) / rgba(255,255,255,0.95) (light)
border:     1px solid #1f1f1f
border-radius: 12px
padding: 12px 16px
shadow: 0 8px 24px rgba(0,0,0,0.4)
```

---

## Animation System

### Keyframes

```css
fade-up:   opacity 0→1, translateY 16px→0, 0.5s cubic-bezier(0.16, 1, 0.3, 1)
fade-in:   opacity 0→1, 0.4s ease
scale-in:  opacity 0→1 + scale 0.95→1, 0.5s cubic-bezier(0.16, 1, 0.3, 1)
shimmer:   background-position -200%→200%, 3s ease-in-out infinite
```

### Stagger System

Apply class `stagger-{n}` (n: 1–8) to stagger entrance animations in 50ms increments:

```
stagger-1: 50ms delay
stagger-2: 100ms delay
...
stagger-8: 400ms delay
```

### Transition Defaults

- Most interactive elements: `transition-all duration-200`
- Image zoom on hover: `duration-500 group-hover:scale-110`
- Always respect `prefers-reduced-motion` — disable all keyframe animations

---

## Frosted Glass & Backdrop Blur

Used on sticky headers and overlays:

```
backdrop-blur-md
bg-[#050505]/80  ← dark
bg-slate-50/80   ← light
```

Never use `bg-[#050505]` (fully opaque) where a blur layer is expected — the translucency is intentional.

---

## Text Selection

```css
::selection {
  background: rgba(11, 210, 181, 0.3);
}
```

---

## Design Guardrails

### Do
- Use `#0BD2B5` for active, focused, and primary interactive states only
- Pair every shadow with a `border` — never use shadow alone on dark surfaces
- Use uppercase + italic + wide tracking for any navigational or label text
- Apply entrance animations with stagger delays when rendering lists
- Use `backdrop-blur-md` on any sticky or floating UI element
- Keep cards at `#111111` on dark — not `#0d0d0d`, not `#1a1a1a`
- Use event-type colors ONLY for icon tinting and small indicators

### Don't
- Don't use more than one accent color. `#0BD2B5` is the only color with meaning.
- Don't use rounded corners smaller than `rounded-md` (8px) on interactive elements
- Don't use `font-weight < 500` for anything interactive or navigational
- Don't apply full-opacity event type colors to card backgrounds or large surfaces
- Don't skip the `ring-1 ring-foreground/10` on card surfaces — it defines edge contrast on dark
- Don't use `shadow` without pairing it with a border on dark backgrounds
- Don't use sentence-case for labels, tags, nav items, or section headers

---

## Agent Prompt Guide

When asking an AI to build UI in this system:

> "Build a [component] following the DAF Adventures design system. Dark background `#050505`, card surface `#111111`, border `#1f1f1f`. Accent is `#0BD2B5` (cyber teal) — use it only for active/focus states and primary CTAs. Font is Barlow (body) and Barlow Condensed (display). All labels and nav text are uppercase italic with wide letter-spacing. Cards use `rounded-xl`, `ring-1 ring-foreground/10`, and `shadow-xs`. Buttons use `rounded-md` with `active:translate-y-px` press effect. Entrance animations use `fade-up` with stagger delays."

---

## Quick Reference Tokens (Tailwind)

```js
// tailwind.config.js theme extensions
colors: {
  primary: '#0BD2B5',
  background: { DEFAULT: '#FFFFFF', dark: '#050505' },
  card:       { DEFAULT: '#FFFFFF', dark: '#111111' },
  border:     { DEFAULT: '#E8EAED', dark: '#1F1F1F' },
  muted:      { foreground: '#888888' },
}
fontFamily: {
  sans:       ['Barlow', 'system-ui', 'sans-serif'],
  condensed:  ['Barlow Condensed', 'system-ui', 'sans-serif'],
}
borderRadius: {
  DEFAULT: '1rem',
}
```
