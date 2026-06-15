---
name: kwb-docker
description: Use when setting up Docker Compose for local dev, writing/reviewing Dockerfiles, or debugging container networking, volumes, or security
---

# kwb-docker — Docker & Compose patterns

Knowledge base for containerized development. Adapted (trimmed) from ECC `docker-patterns`.

## Compose stack (local dev)

```yaml
services:
  app:
    build: { context: ., target: dev }   # dev stage of a multi-stage Dockerfile
    ports: ["3000:3000"]
    volumes:
      - .:/app                            # bind mount for hot reload
      - /app/node_modules                 # anonymous volume protects container deps
    environment:
      - DATABASE_URL=postgres://postgres:postgres@db:5432/app_dev
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: app_dev }
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
volumes: { pgdata: {} }
```

- Services on the same network resolve by **service name** (`db`, `redis`).
- Dev `docker-compose.override.yml` is auto-loaded; prod is explicit:
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
- Expose only what's needed: `"127.0.0.1:5432:5432"` (host-only), or omit `ports` in prod.

## Multi-stage Dockerfile

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --production

FROM node:22.12-alpine3.20 AS production   # pin a specific tag, never :latest
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app                                   # run as non-root
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

## Security hardening (compose)

```yaml
services:
  app:
    security_opt: [no-new-privileges:true]
    read_only: true
    tmpfs: [/tmp, /app/.cache]
    cap_drop: [ALL]
    cap_add: [NET_BIND_SERVICE]   # only if binding ports < 1024
    env_file: [.env]              # never commit .env; or use Docker secrets
```

`.dockerignore`: `node_modules .git .env .env.* dist coverage *.log .next Dockerfile* tests/`

## Key commands

```bash
docker compose logs -f app          # follow logs
docker compose exec app sh          # shell in
docker compose up --build           # rebuild
docker compose down -v              # stop + remove volumes (DESTRUCTIVE)
docker compose exec app nslookup db # debug DNS/service discovery
```

## Anti-patterns

`:latest` tags · running as root · secrets in the image or `docker-compose.yml` · data in containers
without volumes · one giant container for all services · plain Compose in production (use
Kubernetes/ECS/Swarm for orchestrated prod workloads).
