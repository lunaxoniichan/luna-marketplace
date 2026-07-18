---
title: Luna Studio is host-first (no multi-project Docker)
scope: project
type: decision
lifecycle: official
status: active
keywords: [studio, docker, host-first, registry]
related: []
updated: 2026-07-18
---

# Luna Studio is host-first (no multi-project Docker)

## Context

Studio's registry (`~/.claude/luna/registry.json`) stores **host-absolute** project paths.
Phase 1 compose mounted only the plugin repo (`:ro`) + the registry JSON directory. That
cannot resolve other registered projects inside the container, and `:ro` blocks Phase 2
markdown writes.

## Decision

**Host-first is the supported execution model.** Run Studio with `npm run studio` on the
machine that owns the projects. Docker is **not** part of the multi-project or editing
product path.

## Why

- Registry paths are host filesystem truths; rewriting them for a container needs a
  projects-root mount + path map we do not have yet.
- Phase 2 editing requires write access to plugin + project trees; a read-only plugin
  mount contradicts that.
- Keeping a "supported-ish" compose service erodes trust when it cannot show the
  constellation or accept writes.

## Consequences

- Document host-first in `studio/README.md`; compose profile is experimental/plugin-only
  or removable.
- Revisit Docker only with an explicit design: projects-root volume + path rewrite + RW
  mounts for editing.
- Phase 2 proceeds on the host without waiting on compose.
