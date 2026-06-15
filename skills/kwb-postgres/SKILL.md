---
name: kwb-postgres
description: Use when writing SQL or migrations, designing a Postgres schema, choosing indexes, implementing Row Level Security, or diagnosing slow queries
---

# kwb-postgres — PostgreSQL patterns

Quick reference for PostgreSQL best practices (knowledge base). For a schema-generation workflow see
`design-database`; for query hot-path review see `review-performance`. Adapted from ECC
`postgres-patterns` (Supabase best practices, MIT).

## Index cheat sheet

| Query pattern | Index type | Example |
|---------------|------------|---------|
| `WHERE col = value` | B-tree (default) | `CREATE INDEX idx ON t (col)` |
| `WHERE a = x AND b > y` | Composite (equality, then range) | `CREATE INDEX idx ON t (a, b)` |
| `WHERE jsonb @> '{}'` / `tsv @@ q` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| Time-series ranges | BRIN | `CREATE INDEX idx ON t USING brin (col)` |

## Data types

| Use case | Correct | Avoid |
|----------|---------|-------|
| IDs | `bigint` | `int`, random UUID PK |
| Strings | `text` | `varchar(255)` |
| Timestamps | `timestamptz` | `timestamp` |
| Money | `numeric(10,2)` | `float` |
| Flags | `boolean` | `varchar`/`int` |

## Common patterns

```sql
-- Covering index (avoids table lookup)
CREATE INDEX idx ON users (email) INCLUDE (name, created_at);

-- Partial index (smaller; only active rows)
CREATE INDEX idx ON users (email) WHERE deleted_at IS NULL;

-- RLS optimized: wrap the auth call in SELECT so it's evaluated once
CREATE POLICY p ON orders USING ((SELECT auth.uid()) = user_id);

-- UPSERT
INSERT INTO settings (user_id, key, value) VALUES (123, 'theme', 'dark')
ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;

-- Cursor pagination — O(1) vs OFFSET's O(n)
SELECT * FROM products WHERE id > $last_id ORDER BY id LIMIT 20;

-- Queue worker — atomic claim
UPDATE jobs SET status = 'processing'
WHERE id = (SELECT id FROM jobs WHERE status = 'pending'
            ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```

## Diagnostics

```sql
-- Unindexed foreign keys
SELECT conrelid::regclass, a.attname FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f' AND NOT EXISTS (
  SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey));

-- Slow queries (needs pg_stat_statements)
SELECT query, mean_exec_time, calls FROM pg_stat_statements
WHERE mean_exec_time > 100 ORDER BY mean_exec_time DESC;

-- Table bloat
SELECT relname, n_dead_tup, last_vacuum FROM pg_stat_user_tables
WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC;
```

## Config defaults

```sql
ALTER SYSTEM SET work_mem = '8MB';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '30s';
ALTER SYSTEM SET statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
REVOKE ALL ON SCHEMA public FROM public;   -- security default
SELECT pg_reload_conf();
```
