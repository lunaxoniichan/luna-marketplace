# Experimentation (empirical work)

Discipline for any **experiment, backtest, A/B, POC, tuning sweep, or
metric-driven decision**. Read the mechanism and measure the cause **before**
you design an arm or claim a root cause. Companion to **`vibe-rules`** §0
(failure mode: *inference over measurement*) · §5 (RCA first) · skills
**`dev-debug`**, **`dev-research`**, **`dev-verify`**.

> **Why this exists:** the expensive failure is not a wrong result — it is a
> run that never *could* answer the question. Theorizing and tuning before
> reading and measuring burns whole experiment budgets around causes that were
> never located and mechanisms that already shipped.

## The five laws

1. **Read the baseline before you design the arm.** Read the current
   implementation of the exact mechanism under test; state — with `file:line` —
   what the baseline *actually does today*. If you might be "adding" something
   that could already exist, prove present/absent first (GitNexus
   `context`/`query`).
2. **Measure the cause before you fix it.** A root-cause claim is inadmissible
   unless backed by a measured per-unit distribution/attribution — not an
   aggregate, not a narrative. If the instrumentation to measure it does not
   exist, **building that instrumentation is the first experiment**, and it must
   be **behavior-inert** (proven identical outputs vs. pre-change).
3. **Diagnosis precedes tuning.** A parameter sweep is not a diagnosis. Do not
   spend N arms sweeping until a measurement names the lever the outcome is
   sensitive to. One measured diagnosis outranks six blind sweeps.
4. **Pre-register a falsifiable bar + evidence-validity checklist before the
   run.** State the PASS/FAIL bar, benchmark validity (no harness-capped or
   pseudo-benchmarks), input-data integrity (contamination check), and
   minimum-activity (non-vacuous / `fills > 0`) *up front*. Known-broken metrics
   are **non-citable**.
5. **Reconcile the decision record against code at write time.** A record's
   "current state" and "next steps" must match the implementation. A "not
   started / needs building" claim that contradicts the code is a defect to fix,
   not ship.

## Red flags — stop

| Thought | Reality |
|---------|---------|
| "We just need to test if X helps" | Read whether X already exists first (law 1). |
| "The numbers say the cause is Y" | Aggregates don't locate causes — measure the distribution (law 2). |
| "Let's sweep the parameters and see" | A sweep is not a diagnosis (law 3). |
| "SPY returned Z, so we beat it" | Was Z uncapped / valid? Broken metrics are non-citable (law 4). |
| "Next step: build the trailing stop" | Confirm it isn't already in the baseline (laws 1, 5). |

Project overlays (per-domain benchmark/data-integrity conventions) belong in the
repo's `RULES.md` or an experiments ledger, not here.
