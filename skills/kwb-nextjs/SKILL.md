---
name: kwb-nextjs
description: Use when developing, debugging, or reviewing a Next.js 16+ / Turbopack app — dev speed, bundling, and the proxy.ts middleware naming change
---

# kwb-nextjs — Next.js & Turbopack

Next.js 16+ uses **Turbopack** by default for local dev (incremental Rust bundler; much faster cold
start + HMR, with file-system caching under `.next`). Knowledge base; adapted from ECC `nextjs-turbopack`.

## When to use which bundler

- **Turbopack (default dev)** — day-to-day development; faster on large apps.
- **Webpack (legacy dev)** — only for a Turbopack bug or a webpack-only dev plugin (`--webpack` /
  `--no-turbopack`, version-dependent — check the docs for your release).
- **Production (`next build`)** — bundler depends on Next.js version; check official docs.

## proxy.ts middleware naming (critical)

Next.js 16 renamed the middleware file from `middleware.ts` → **`proxy.ts`** at the project root.

- Next.js 16+: use `proxy.ts`. Pre-16: use `middleware.ts`.
- The change is tied to the **Next.js version**, not the bundler.
- **Do NOT flag `proxy.ts` as misnamed in a Next.js 16 project** — it's correct and intentional;
  renaming it to `middleware.ts` breaks middleware execution.

Ref: https://nextjs.org/docs/app/getting-started/proxy

## Best practices

- Stay on a recent 16.x for stable Turbopack + caching; don't clear the `.next` cache needlessly.
- If dev is slow, confirm you're actually on Turbopack (the default).
- For bundle-size issues, use the official Next.js bundle analysis tooling for your version.
- Prefer App Router + server components where possible.

```bash
next dev     # local dev (Turbopack by default)
next build
next start
```
