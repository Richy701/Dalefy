# DAF Adventures - Claude Code Guidelines

## Project Context

This workspace contains multiple apps/projects. Always confirm which app/codebase is being discussed before making changes.

- **Web app** (this repo): React 19 + TypeScript + Vite 8 + Tailwind CSS 3
- **Mobile app**: Expo/React Native in `/mobile`

## General Rules

- When asked to fix or audit something, make minimal targeted changes. Do NOT refactor surrounding code, add unrequested features, or change layouts beyond what was asked.
- If an audit reveals issues, list them first and wait for approval before changing.
- Never remove or delete existing code without explicitly stating what will be removed and why BEFORE making the change.
- Install npm packages with `--legacy-peer-deps` due to react-day-picker peer dep conflict with React 19.

## Git Operations

- Never refuse to push to git when asked. Always execute `git push` immediately when the user requests it.
- When committing, write concise commit messages that describe the change.

## UI/Design Guidelines

- Avoid generic, overly polished "AI-looking" designs. Match the existing app's visual identity.
- When the user shares inspiration screenshots, match the specific aesthetic rather than producing generic Material/Tailwind defaults.
- Prefer subtle, warm, human-feeling design over clinical defaults.
- For color and contrast changes: always verify contrast ratios programmatically (WCAG AA minimum 4.5:1 for text). Do not guess at color combinations.
- Existing palette: accent `#0bd2b5`, dark bg `#050505`, card `#111111`, border `#1f1f1f`.
- Font style: uppercase, black italic, tight tracking (Barlow Condensed).
- Every dark-mode color class needs a light-mode counterpart -- never use bare `bg-[#111111]` without a `light:` variant.

## Code Changes

- The linter auto-removes unused imports -- always add imports in the same edit as their usage.
- Do not add docstrings, comments, or type annotations to code you did not change.
- Pre-existing TS errors in WorkspacePage, ReportsPage are known -- do not fix unless asked.

## Writing Style

- Use commas, hyphens, or periods instead of em dashes in generated text.
