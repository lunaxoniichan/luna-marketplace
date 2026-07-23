---
name: dev-research
description: Use when the user wants thorough, cited research from multiple web sources before deciding or building — "research", "deep dive", "investigate", "what's the current state of"
---

# dev-research

Produce thorough, **cited** research reports synthesized from multiple web sources. Independent skill
(runs before `dev-brainstorm` when a decision needs evidence). Adapted from ECC `deep-research`.

> Sources are fetched via WebSearch/WebFetch (or firecrawl/exa MCP tools if configured). The
> `url-safety-guard` hook enforces HTTPS + the source lists — append trusted hosts to
> `scripts/hooks/web-allowlist.txt` rather than bypassing it.

## Workflow

0. **Route first** — if the project has `docs/README.md`, check its catalog and `Agent keywords`
   before searching externally. L1 routing → L2 GitNexus → L3 source → L4 external. Skip to step 1
   only if the topic is external (library/framework/market research, not codebase internals).
   **Empirical prerequisite** — if this feeds an experiment, backtest, POC, or tuning
   sweep: first read the current implementation of the mechanism under test, state
   what the baseline *actually does today*, and define the instrumentation that will
   **measure** the hypothesis. Do not design an arm around a mechanism you have not
   read (it may already exist). See the `experimentation` rule.
1. **Goal** — ask 1–2 quick clarifiers (learning vs deciding vs writing; angle/depth). "Just research
   it" → proceed with sensible defaults.
2. **Plan** — break the topic into 3–5 sub-questions.
3. **Search** — for each sub-question, 2–3 keyword variations; aim for 15–30 unique sources;
   prioritize academic/official/reputable news > blogs > forums.
4. **Deep-read** — fetch 3–5 key sources in full; don't rely on snippets.
5. **Synthesize** — write the report (template below) with inline citations.
6. **Deliver** — short topic → full report in chat; long → exec summary + takeaways in chat, full
   report saved to a file (e.g. `docs/specs/<topic>-research.md`).

For broad topics, parallelize with the Task tool (dispatch 2–3 research subagents over sub-question
groups; the main session synthesizes). See `dev-parallel`.

## Report template

```markdown
# <Topic>: Research Report
*Generated: <date> | Sources: <N> | Confidence: High/Medium/Low*

## Executive Summary
<3–5 sentences>

## 1. <Theme>
- Finding ([Source](url)) · supporting data ([Source](url))

## Key Takeaways
- <actionable insight>

## Sources
1. [Title](url) — one-line summary

## Methodology
Queries run, sources analyzed, sub-questions, known gaps.
```

## Quality rules

1. Every claim needs a source — no unsourced assertions.
2. Cross-reference; flag single-source claims as unverified.
3. Prefer sources from the last 12 months.
4. Acknowledge gaps ("insufficient data found") — no hallucination.
5. Separate fact from inference; label estimates/projections/opinions.
