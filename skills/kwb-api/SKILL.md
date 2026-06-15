---
name: kwb-api
description: Use when designing or reviewing REST endpoints — resource naming, status codes, pagination, filtering, error shape, versioning, and rate limiting
---

# kwb-api — REST API design

Conventions for consistent, developer-friendly REST APIs. Knowledge base; adapted (trimmed) from ECC
`api-design`.

## Resource URLs

Nouns, plural, lowercase, kebab-case. No verbs in paths (CRUD = HTTP method).

```
GET/POST          /api/v1/users           GET/PUT/PATCH/DELETE /api/v1/users/:id
GET/POST          /api/v1/users/:id/orders        # sub-resource for ownership
POST              /api/v1/orders/:id/cancel       # non-CRUD action (verb, sparingly)
```
Bad: `/getUsers` (verb) · `/user` (singular) · `/team_members` (snake_case).

## Methods & status codes

| Method | Idempotent | For |
|--------|-----------|-----|
| GET | ✓ (safe) | retrieve |
| POST | ✗ | create / action |
| PUT | ✓ | full replace |
| PATCH | ✗* | partial update |
| DELETE | ✓ | remove |

`200` OK · `201` Created (+`Location`) · `204` No Content · `400` validation/malformed ·
`401` unauthenticated · `403` unauthorized · `404` not found · `409` conflict · `422` semantically
invalid · `429` rate limited · `500` server (never leak details) · `503` overload (+`Retry-After`).
**Use status codes semantically — never `200 {success:false}`.**

## Response shape

```jsonc
// success
{ "data": { "id": "abc-123", "name": "Alice" } }
// collection + pagination
{ "data": [...], "meta": { "total": 142, "page": 1, "per_page": 20 },
  "links": { "next": "/api/v1/users?page=2" } }
// error — stable code + message + field details
{ "error": { "code": "validation_error", "message": "Request validation failed",
  "details": [ { "field": "email", "message": "Must be a valid email", "code": "invalid_format" } ] } }
```

## Pagination

| Use case | Type |
|----------|------|
| Admin dashboards, small (<10K), "jump to page N" | **Offset** (`?page=2&per_page=20`) |
| Feeds, infinite scroll, large datasets, public APIs | **Cursor** (`?cursor=…&limit=20`, fetch N+1 for `has_next`) |

Cursor is stable under concurrent inserts and O(1); offset is O(n) on large offsets.

## Filtering / sorting / fields

```
?status=active&customer_id=abc           # equality
?price[gte]=10&price[lte]=100            # operators (bracket notation)
?category=electronics,clothing           # multi-value (comma)
?sort=-featured,price                    # sort (prefix - = desc, comma = multi)
?q=wireless+headphones                   # full-text search
?fields=id,name,email                    # sparse fieldset (smaller payload)
```

## Auth, rate limiting, versioning

- `Authorization: Bearer <jwt>` for users; `X-API-Key` for server-to-server. Check **ownership**
  (404 if missing, 403 if not owner) and **role** for privileged ops.
- Rate-limit headers: `X-RateLimit-Limit/Remaining/Reset`; `429` + `Retry-After` when exceeded.
- **URL path versioning** (`/api/v1/`) recommended. Start at v1; keep ≤2 active versions; non-breaking
  changes (new fields/optional params/new endpoints) don't bump the version; breaking changes
  (remove/rename/retype fields, change URL/auth) do. Deprecate with a `Sunset` header → `410 Gone`.

## Implementation example (Next.js + Zod)

```typescript
const schema = z.object({ email: z.string().email(), name: z.string().min(1).max(100) });
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: { code: "validation_error",
    message: "Request validation failed",
    details: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message, code: i.code })) } },
    { status: 422 });
  const user = await createUser(parsed.data);
  return NextResponse.json({ data: user }, { status: 201, headers: { Location: `/api/v1/users/${user.id}` } });
}
```

## Checklist

URL conventions · correct method/status · schema-validated input · standard error shape · pagination
on lists · authn required (or explicitly public) · authz/ownership checked · rate limited · no internal
detail leaks · consistent field casing · OpenAPI updated.
