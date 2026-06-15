---
name: design-frontend
description: Use when generating UI from a style direction, a prompt, or a reference URL — produce a concrete component/layout design before implementing it
---

# design-frontend

Turn a style direction / prompt / reference URL into a concrete UI design (layout + components +
states) **before** coding. Pairs with `design-system` (tokens) and `kwb-frontend` (React
implementation). Output is a spec, not production code.

## Inputs (any of)

- A **prompt** ("a calm budgeting dashboard for tired parents").
- A **style direction** (brand adjectives, an existing palette, dark/light).
- A **reference URL** — fetch via WebFetch (the `url-safety-guard` hook enforces HTTPS) and extract
  layout/spacing/typographic patterns; do not copy proprietary assets.

## Process

1. **Frame** — who is it for, primary task, device targets (desktop 1440 + mobile 390), tone.
2. **Layout** — page structure, grid, hierarchy; what's above the fold.
3. **Components** — list each with variants and **all states** (default, hover, focus, disabled,
   loading, empty, error). Reuse a `design-system` token set if one exists.
4. **Content & a11y** — real copy (not lorem), contrast, keyboard order, focus management
   (see `kwb-frontend`).
5. **Spec out** — annotated layout (ASCII/Mermaid or component tree) + token references + interaction
   notes. Then hand to implementation.

## Output

```markdown
## UI design — <screen>
**For:** <user/task/devices/tone>
**Layout:** <structure + hierarchy>
**Components:** name — variants — states — tokens used
**States covered:** default/hover/focus/disabled/loading/empty/error
**A11y:** contrast, keyboard order, focus
**Open questions:** …
```

## Do not

- Jump to JSX before the design is agreed.
- Use lorem ipsum or fake data where real content reveals layout problems.
- Skip empty/loading/error states — they're where designs break.
- Copy a reference site's proprietary assets/branding.
