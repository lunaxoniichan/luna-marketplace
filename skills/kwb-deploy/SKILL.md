---
name: kwb-deploy
description: Use when setting up CI/CD, planning a deployment strategy, adding health checks, validating env config, or preparing a production release
---

# kwb-deploy — deployment & CI/CD patterns

Knowledge base for shipping to production. Container/Dockerfile specifics live in `kwb-docker`.
Adapted (trimmed) from ECC `deployment-patterns`.

## Deployment strategies

| Strategy | How | Use when |
|----------|-----|----------|
| **Rolling** (default) | replace instances gradually; old+new run together | backward-compatible changes |
| **Blue-green** | two identical envs; switch traffic atomically | critical services, instant rollback (2× infra) |
| **Canary** | route 5% → 50% → 100% to new version | high-traffic / risky changes; needs traffic split + metrics |

Rolling and canary require **backward-compatible** changes (two versions live at once).

## CI/CD (GitHub Actions skeleton)

```yaml
on: { push: { branches: [main] }, pull_request: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm test -- --coverage
  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  deploy: { needs: build, environment: production, runs-on: ubuntu-latest }
```

Stages: PR → lint → typecheck → unit → integration → preview deploy. Main → … → build image →
staging → smoke tests → production.

## Health checks

```typescript
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/health/detailed", async (_req, res) => {
  const checks = { database: await checkDb(), redis: await checkRedis() };
  const ok = Object.values(checks).every(c => c.status === "ok");
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", checks,
    version: process.env.APP_VERSION, uptime: process.uptime() });
});
```

K8s: `livenessProbe` (restart if dead) + `readinessProbe` (gate traffic) + `startupProbe`
(`failureThreshold * periodSeconds` = max startup time).

## Env config (twelve-factor) — validate at startup, fail fast

```typescript
import { z } from "zod";
export const env = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
}).parse(process.env);
```

All config via env vars (never in code); secrets injected by a secrets manager.

## Rollback

```bash
kubectl rollout undo deployment/app    # k8s
vercel rollback                        # vercel
railway up --commit <previous-sha>     # railway
```
Preconditions: previous artifact tagged + available · migrations backward-compatible · feature flags
can disable new features without a deploy · rollback rehearsed in staging.

## Production readiness (condensed)

- **App:** all tests pass · no hardcoded secrets · structured logs without PII · meaningful `/health`.
- **Infra:** reproducible image (pinned) · env vars validated · CPU/mem limits · TLS everywhere.
- **Monitoring:** request/latency/error metrics · error-rate alerts · log aggregation · uptime check.
- **Security:** deps CVE-scanned · CORS allowlist · rate limiting · authn/authz verified · CSP/HSTS.
- **Ops:** rollback plan tested · migration tested at prod scale · runbook · on-call path.
