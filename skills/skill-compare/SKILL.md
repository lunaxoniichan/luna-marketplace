---
name: skill-compare
description: Use when deciding whether to adopt, update, or drop a skill versus the reference forks — diff our version against superpowers/ECC/cpo and recommend
---

# Skill compare

Curation decisions against the reference forks (pain #6). The forks in `fork/` are **read-only
references** — this skill decides what to copy/adapt/drop, it does not sync forks.

## Inputs

- Our skill: `skills/<name>/SKILL.md`.
- Fork sources: `fork/superpowers/skills/*`, `fork/ECC/skills/*`,
  `fork/claude-plugins-official/plugins/*`.
- The `Action`/`Source` columns in `docs/TOOLS_LIST.md` (what we claimed we did).

## Process

1. Locate the fork counterpart named in `TOOLS_LIST.md` (`copy`/`adapt`/`new`/`reuse`).
2. Diff intent, not text: has the fork added a capability we're missing? did we intentionally drop
   coupling/graphviz/bloat (expected) or accidentally lose a useful check (regression)?
3. Classify each delta: **adopt** (pull the improvement), **keep-ours** (our decouple/trim is correct),
   **drop** (skill no longer earns its keep), **new-need** (fork has something worth a fresh skill).
4. For `kwb-*`, confirm the trim still <250 lines and didn't lose a canonical rule.

## Output

```markdown
## Skill compare — <skill>
| Delta | Fork has | We have | Verdict | Why |
Recommendation: adopt / keep-ours / drop / new-need
```

## Do not

- Re-introduce the coupling we deliberately removed (`REQUIRED SUB-SKILL`, Graphviz, 2× forced review)
  without evidence it improves outcomes.
- Bulk-copy ECC domain skills — `kwb-*` are copy-on-use, trimmed.
- Edit anything under `fork/` — references only.
