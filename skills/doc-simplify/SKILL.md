---
name: doc-simplify
description: Use when a doc grew too long, fragmented, or repetitive — right-size it by trimming, merging, splitting, and deduping without losing facts
---

# Doc simplify

Right-size documentation (pains #4, #8). Reduce length and fragmentation **without losing any fact**.
Behavior-for-docs: simplify *form*, never drop *content* — if a fact is removed, it moves somewhere
canonical, it does not vanish.

## Triggers

- A doc exceeds a sane length (skills <250 lines; rules ≤50 lines; most docs scannable in one screen).
- The same fact is stated in 2+ places (duplication → pick one canonical home, cross-link the rest).
- Content is scattered across many tiny files that should merge, or one file does 3 unrelated jobs and
  should split.

## Process

1. Inventory the target docs; `wc -l` to find oversized ones.
2. For each issue, choose: **trim** (cut prose/redundant examples), **merge** (combine fragments),
   **split** (one doc → focused docs), or **dedupe** (one canonical statement + `[[links]]`).
3. Apply changes; preserve every distinct fact. Keep the one-canonical-representation rule.
4. Update cross-references and any index/tree that pointed at moved content.
5. Report: before/after line counts + what moved where.

## Limits (per kit conventions)

- Skill `SKILL.md` <250 lines · rules ≤50 lines · keep one excellent example, not many.

## Do not

- Delete a fact without relocating it.
- Merge two doc **classes** (project vs agent) into one file.
- "Simplify" by removing the rationalization tables / red-flags that make discipline skills work.
