---
name: design-system
description: Use when establishing or reviewing design tokens and a component vocabulary — colors, type scale, spacing, radii, and a mock UI to prove them
---

# design-system

Define the **design tokens** and component vocabulary a project draws from, and a small mock UI that
proves they hang together. Feeds `design-frontend` (screens) and `kwb-frontend` (implementation).
Writes to `docs/DESIGN_SYSTEM.md` when the user wants it persisted.

## Tokens to define

| Group | Contents |
|-------|----------|
| **Color** | semantic roles (bg, surface, text, muted, primary, success, warning, danger) for light + dark; check WCAG contrast |
| **Typography** | font families, a modular type scale (e.g. 12/14/16/20/24/32), line-heights, weights |
| **Spacing** | a single scale (4/8/12/16/24/32/48…) used everywhere — no ad-hoc pixels |
| **Radii / elevation** | corner radii + shadow levels |
| **Motion** | durations + easing for enter/exit/hover |

Express tokens as named variables (CSS custom properties / a `theme.ts`), never raw hex scattered in
components — one canonical source.

## Process

1. Derive tokens from the brand/style direction (or audit existing values and consolidate duplicates).
2. Map **semantic** roles on top of raw values (`--color-primary` → a palette step), so themes swap
   cleanly.
3. Build a **mock UI** (buttons, inputs, card, alert, nav) using only tokens to prove coverage.
4. Verify contrast + dark-mode parity; list any gaps.
5. If persisting, write `docs/DESIGN_SYSTEM.md` (token tables + the component vocabulary).

## Do not

- Hardcode raw colors/spacing in components — reference tokens.
- Ship a token set without a mock UI exercising it.
- Let two tokens mean the same thing (dedupe — one canonical representation).
