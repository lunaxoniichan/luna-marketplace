---
name: design-database
description: Use when designing or revising a database schema — produce an entity model in dbdiagram (DBML) form with keys, relationships, and indexes, then write DATABASE_DESIGN.md
---

# design-database

Design a relational schema as a reviewable artifact **before** writing migrations. Output is a DBML
(dbdiagram.io) model + `docs/DATABASE_DESIGN.md`. Postgres specifics (types, indexes, RLS) live in
`kwb-postgres`; this skill is the modeling step.

## Process

1. **Entities** — list the nouns/tables and their purpose; one concept per table.
2. **Columns** — for each: type (prefer `bigint` ids, `text`, `timestamptz`, `numeric` for money — see `kwb-postgres`), nullability, defaults, constraints.
3. **Relationships** — PKs, FKs, cardinality; resolve many-to-many with a join table; **index every FK**.
4. **Integrity** — unique constraints, check constraints, enums (or a lookup table); soft-delete vs hard.
5. **Access** — note where Row Level Security / ownership columns are needed.
6. **Emit DBML** + write `docs/DATABASE_DESIGN.md` (tables, relationships, indexing rationale).

## DBML example

```dbml
Table users {
  id          bigint [pk]
  email       text   [unique, not null]
  created_at  timestamptz [default: `now()`]
}

Table orders {
  id        bigint [pk]
  user_id   bigint [not null, ref: > users.id]   // FK → index it
  total     numeric(10,2) [not null]
  status    text [not null, note: 'active|paid|cancelled']
  Indexes { (user_id, status) }
}
```

## Do not

- Generate migrations before the model is reviewed/approved.
- Use `float` for money, `varchar(255)` reflexively, or random-UUID PKs without reason
  (see `kwb-postgres`).
- Leave foreign keys unindexed.
- Model one concept two ways — one canonical table per concept.
