# DAF Adventures - Claude Code Guidelines

## Project Context

This workspace contains multiple apps/projects. Always confirm which app/codebase is being discussed before making changes.

- **Web app** (this repo): React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- **Mobile app**: Expo/React Native in `/mobile`

## General Rules

- When asked to fix or audit something, make minimal targeted changes. Do NOT refactor surrounding code, add unrequested features, or change layouts beyond what was asked.
- If an audit reveals issues, list them first and wait for approval before changing.
- Never remove or delete existing code without explicitly stating what will be removed and why BEFORE making the change.
- Install npm packages with `--legacy-peer-deps` due to react-day-picker peer dep conflict with React 19.

## Git Operations

- Never refuse to push to git when asked. Always execute `git push` immediately when the user requests it.
- When committing, write concise commit messages that describe the change.
- "Push" means commit and push ALL pending changes unless told otherwise. If something should be held back, ask first instead of silently leaving it out.
- "Don't push" is ambiguous (git vs. live deploy). Ask which one is meant.
- Before pushing, run `npm run lint` and `npx vite build`. Any visual mobile change must also reach the web preview, so confirm the Vercel deploy is Ready.
- If a deploy or command is blocked for you, end with the exact commands for me to run in one copyable block.

## UI Verification

- After any layout change, screenshot it and check alignment and centering in both light and dark mode before calling it done. Web: Playwright headless (the Chrome extension cannot render localhost). Mobile: simulator via deep link + screenshot.
- Test with realistic trip data, not just empty or demo states. Confirm new components still render (and don't hide themselves) on real data.
- The simulator can miss device-only artifacts (stray dividers, safe-area black bars). Check safe areas explicitly and flag anything that can only be confirmed on a real device.
- Before building a feature, check the data it needs actually exists. If it doesn't, say so before writing code.
- Use real logos and assets from the repo, never invented placeholders.

## UI/Design Guidelines

- Avoid generic, overly polished "AI-looking" designs. Match the existing app's visual identity.
- When the user shares inspiration screenshots, match the specific aesthetic rather than producing generic Material/Tailwind defaults.
- Prefer subtle, warm, human-feeling design over clinical defaults.
- For color and contrast changes: always verify contrast ratios programmatically (WCAG AA minimum 4.5:1 for text). Do not guess at color combinations.
- Use semantic tokens, never raw hex. `bg-background` / `bg-card` / `bg-secondary` (raised) / `border-border` / `text-muted-foreground`, accent `text-brand`, warm secondary `text-sand` (accommodation).
- Palette resolves per theme: dark page `#0E0E10`, card `#17181C`, raised `#202127`, border `#26272E`; light page `#F7F7F9`, card `#FFFFFF`, raised `#F1F1F4`, border `#E4E4E9`. Accent `#0bd2b5`.
- Radius tops out at `rounded-xl`; `rounded-full` is only for avatars, dots, spinners, and circular icon buttons.
- Build forms and surfaces from `src/components/ui/*` (real shadcn, Base UI primitives), not hand-rolled divs.
- Font style: uppercase, heavy weight, tight tracking (Barlow Condensed). No italics.
- Every dark-mode color class needs a light-mode counterpart -- never use bare `bg-[#111111]` without a `light:` variant.

## Code Changes

- The linter auto-removes unused imports -- always add imports in the same edit as their usage.
- Do not add docstrings, comments, or type annotations to code you did not change.
- Pre-existing TS errors in WorkspacePage, ReportsPage are known -- do not fix unless asked.

## Writing Style

- Use commas, hyphens, or periods instead of em dashes in generated text.
