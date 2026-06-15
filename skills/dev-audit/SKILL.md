---
name: dev-audit
description: Use to pressure-test a proposed idea, design, or plan before committing to it — surface feasibility, risks, unknowns, and a go / no-go recommendation
---

# dev-audit

Feasibility & risk check on a **proposed** idea/design/plan — before code, often right after
`dev-brainstorm` or `dev-plan`. Independent skill. Output is a verdict + the assumptions it rests on,
not an implementation. Be the honest skeptic: if it won't work, say so now (cheaper than later).

## When to use

- A spec or plan exists and you want a second, adversarial pass before approval.
- An external API/library/service is on the critical path and its viability is unverified.
- The change is large, irreversible, or touches money/security/data integrity.

## Process

1. **Restate** the idea in one or two sentences — confirm you're auditing the real proposal.
2. **List assumptions** it depends on; mark each *verified* vs *unverified*.
3. **Probe the risky ones live** (don't trust prior research): does the API exist and is signup open?
   does the library support this? is the data shape real? Check current state, not memory.
4. **Risks** — for each: likelihood × impact, and the cheapest way to de-risk (spike, prototype, fallback).
5. **Unknowns** — what must be answered before starting; who/what can answer it.
6. **Verdict** — **go** / **go-with-changes** / **spike-first** / **no-go**, with the reasoning.

## Output

```markdown
## Audit — <idea>
**Restated:** …
**Assumptions:** ✓ verified … · ✗ unverified …
**Risks:** [H/M/L × impact] risk → mitigation
**Unknowns:** open question → how to resolve
**Verdict:** go / go-with-changes / spike-first / no-go — because …
```

## Do not

- Rubber-stamp. An audit with no risks/unknowns is a failed audit — dig.
- State external-service capabilities as fact without a live probe.
- Slide into implementing — this skill decides *whether*, not *how*.
