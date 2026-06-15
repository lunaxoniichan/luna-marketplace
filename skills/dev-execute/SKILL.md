---
name: dev-execute
description: Use when implementing a written plan in docs/plans/ — task-by-task with verification checkpoints
---

# Dev execute

Load a plan from `docs/plans/`, review critically, execute tasks, report completion.

**Announce:** "Using dev-execute to implement this plan."

## Process

### 1. Load and review

1. Read the plan file completely
2. Identify gaps or risks — ask the user before starting if blocking
3. Create todos (native Task tools or TodoWrite) per plan task

### 2. Execute tasks

For each task:

1. Mark in progress
2. Follow plan steps exactly
3. For behavior changes: write a failing test before implementation
4. When blocked by bugs: investigate root cause before fixing
5. Run verifications specified in the plan
6. Mark complete

### 3. Subagents

When Task/subagent tools are available, dispatch **real** subagents for isolated tasks. Do not fabricate subagent transcripts.

When subagents are unavailable, execute inline in this session.

### 4. Complete

- Fresh verification evidence before claiming done (command output, exit codes)
- Offer optional review if the user wants it before merge
- When the user asks to commit, include the `Plan:` trailer (see `.claude/rules/git.md`)

## Stop and ask when

- Blocker (missing dep, repeated test failure, unclear step)
- Plan has critical gaps
- Verification fails repeatedly

## Do not

- Chain mandatory review after every task (optional `review-*` only)
- Invoke `subagent-driven-development` as required coupling
- Start on main/master without explicit user consent

## Plan linkage

Active plan commits must include: `Plan: docs/plans/<file>.md#phase-N` (see `.claude/rules/git.md`).
