---
name: kwb-typescript
description: Use when writing or reviewing TypeScript/JavaScript for baseline quality — naming, immutability, type safety, error handling, and code smells
---

# kwb-typescript — TypeScript/JS baseline

The shared quality floor for TS/JS. Framework specifics live in `kwb-frontend` (React) and `kwb-api`
(endpoints). Adapted (trimmed) from ECC `coding-standards`. Principles: readability first · KISS · DRY ·
YAGNI.

## Naming

```typescript
const isUserAuthenticated = true;          // descriptive, not `flag`
async function fetchMarketData(id: string) {}  // verb-noun, not `market(id)`
function isValidEmail(email: string): boolean {}
```

## Immutability (default)

```typescript
const updated = { ...user, name: "New" };  // spread, don't mutate
const next = [...items, newItem];          // not items.push(newItem)
```
Mutate only with a comment explaining why (e.g. perf on large arrays).

## Type safety

```typescript
interface Market { id: string; status: "active" | "resolved" | "closed"; createdAt: Date }
function getMarket(id: string): Promise<Market> { /* … */ }   // never `any`
```

## Error handling — explicit, no silent fallback

```typescript
async function fetchData(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}
```

## Async — parallelize independent work

```typescript
const [users, markets, stats] = await Promise.all([fetchUsers(), fetchMarkets(), fetchStats()]);
// not three sequential awaits
```

## Code smells → fixes

- **Long function (>~50 lines)** → split into named steps (`validate → transform → save`).
- **Deep nesting (>3)** → early returns/guard clauses.
  ```typescript
  if (!user) return;
  if (!user.isAdmin) return;
  if (!market?.isActive) return;
  // do the thing
  ```
- **Magic numbers** → named constants (`const MAX_RETRIES = 3;`).
- **Ternary hell** → `{isLoading && <Spinner/>}` / `{error && <Error/>}`, not nested `? :`.

## Conventions

- **File naming:** `Button.tsx` (PascalCase components) · `useAuth.ts` (`use` prefix hooks) ·
  `formatDate.ts` (camelCase utils) · `market.types.ts`.
- **Comments:** explain **WHY**, not WHAT. JSDoc public APIs (`@param`/`@returns`/`@throws`/`@example`).
- **Tests:** AAA (Arrange-Act-Assert); descriptive names ("returns empty array when no markets match"),
  never `test('works')`.
- **DB queries:** select only needed columns, never `SELECT *` in hot paths (see `kwb-postgres`).

**Code quality is not negotiable — clear code enables confident refactoring.**
