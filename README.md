# Luna Agent Kit

Local-first agent kit for **Claude Code + Cursor**: phased workflow, corrections-as-rules, plan↔commit tracing, and GitNexus-aware coding.

## What you get

| Component | Count |
|-----------|-------|
| Skills | 38 |
| Agents | 8 |
| Hooks | 10 |
| Rules | 7 |

Each **app repo** gets its own `docs/workflows/WORKFLOW.md` (customize with `workflow-update`). Full list: [docs/TOOLS_LIST.md](docs/TOOLS_LIST.md).

## Setup

You do **not** clone or open this `luna-marketplace` repo to use Luna.

- **Plugin** — Claude Code downloads it from GitHub into its own cache (skills, agents, hooks).
- **Your project** — your app repo (e.g. `my-api`, `my-website`). Luna adds docs and workflow files there.

Do this once per machine, then once per app repo.

### 1. Install the plugin (Claude Code)

Run in Claude Code from **any** directory:

```text
/plugin marketplace add https://github.com/lunaxoniichan/luna-marketplace.git
/plugin install luna-agent-kit@luna-marketplace
```

Check `/plugin` → **Installed** → `luna-agent-kit` is enabled. Start a new session.

Requires [Claude Code](https://code.claude.com/) v2.1+ and Node.js 18+ (for hooks). Uninstall **Superpowers** first if you have it — skill names overlap.

To update later:

```text
/plugin marketplace update luna-marketplace
```

### 2. Wire your app repo

Open Claude Code in **your application repository** (not `luna-marketplace`) and say:

```text
Run doc-init for this project.
```

That creates the minimum docs in **your** repo (`AGENTS.md`, `docs/README.md` catalog, `docs/workflows/WORKFLOW.md`, `docs/PLANS.md`, `docs/TODO.md`, `.claude/rules/lessons.md`, `.cursor/` mirror). It only adds missing files — never overwrites existing ones. The plugin's other five behavioral rules load automatically from the plugin cache — you do not need to copy them. Commit the new files.

### 3. Start working

1. New session → `workflow-guide` loads automatically.
2. Read `docs/workflows/WORKFLOW.md` for phases and skill menus.
3. For a full feature: brainstorm → design → plan → execute (use `trivial` / `fix` / `spike` variants for small tasks).

## Optional — customize your project's workflow

Skip this if the default workflow in `docs/workflows/WORKFLOW.md` is fine.

After `doc-init`, each app repo has its **own** workflow file. To change phases, gates, skill menus, or variants for **your project only**:

1. Describe what you want in plain language.
2. Ask Claude to run **`workflow-update`**.
3. Review the diff to `docs/workflows/WORKFLOW.md` and commit it.

Example prompts:

```text
Add kwb-postgres to system-design suggested_skills.

For the fix variant, skip system-design.

Add a payment variant that requires user_approval before dev-execute.
```

Use skill names from [docs/TOOLS_LIST.md](docs/TOOLS_LIST.md). Do not hand-edit `WORKFLOW.md` — `workflow-update` keeps the YAML frontmatter and Mermaid diagram in sync.

Both Claude Code and Cursor read the same file after you commit.

## Daily use

- Workflow **suggests** skills per phase; the agent **picks** what fits.
- Plan commits: `Plan: docs/plans/<file>.md#phase-N` (use **`doc-update-agent`** to sync `PLANS.md` / `TODO.md`)

## More

| Topic | Where |
|-------|--------|
| Agent/contributor guide | [AGENTS.md](AGENTS.md) |
| Hook env vars | [AGENTS.md § Configuration](AGENTS.md#configuration-env-vars) |
| Architecture | [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) |

## Reference forks

`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` are read-only references — not loaded at runtime.
