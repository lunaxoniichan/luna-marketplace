---
name: review-security
description: Use when changing auth, handling user input, touching secrets/credentials, adding API endpoints, or implementing payment/sensitive features — security review against OWASP basics
---

# Review security

Standalone security review (OWASP basics + secrets). Independent skill — report findings; do not
auto-chain. Trimmed from ECC `security-review`.

## When to activate

Auth/authz · user input or file uploads · new API endpoints · secrets/credentials · payments ·
storing/transmitting sensitive data · third-party API integration.

## Checklist

1. **Secrets** — no hardcoded keys/passwords/tokens; all via env; `.env*` gitignored; none in git
   history; never logged.
2. **Input validation** — validate every external input against a schema (allowlist, not blocklist);
   restrict file uploads (size, MIME, extension); error messages don't leak internals.
3. **Injection** — parameterized queries only; never string-concatenate SQL/shell; ORM used correctly.
4. **Authn/authz** — tokens in httpOnly+Secure+SameSite cookies (not localStorage); authorization check
   *before* every sensitive op; row-level security where the DB supports it.
5. **XSS** — sanitize user HTML; strict CSP (no `'unsafe-inline'`/`'unsafe-eval'` without a removal plan).
6. **CSRF** — tokens on state-changing requests; `SameSite=Strict`.
7. **Rate limiting** — on all endpoints; stricter on expensive ops.
8. **Sensitive-data exposure** — generic user-facing errors, detail only in server logs; no secrets/PII
   in logs or stack traces.
9. **Dependencies** — `npm audit` (or stack equivalent) clean; lock files committed.

## Output

```markdown
## Security review
### Critical (block)   — issue · file:line · fix
### Important (should) — …
### Notes              — defense-in-depth suggestions
```

## Do not

- Wave through `http://`, secret reads, or `--no-verify` (hooks guard these — don't suggest bypass).
- Default CSP to `'unsafe-*'`. Treat it as temporary, documented debt only.
