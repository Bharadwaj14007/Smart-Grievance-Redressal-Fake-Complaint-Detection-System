# Nagrik Setu

Nagrik Setu is a React/Vite grievance-portal demo with a separate Express/TypeScript API, PostgreSQL data model, private object storage, Redis job queue, and an AI-service integration boundary.

## Run the portal

```sh
npm ci
npm run dev
```

The portal uses the API by default. It expects the API at `/api/v1`; set `VITE_API_BASE_URL` when the API is hosted elsewhere. To run the UI without the backend, start Vite with `VITE_DEMO_MODE=true` in the environment. Demo mode is development-only and uses in-memory sample data; authentication and portal data are not persisted in browser storage.

## Run the local full-stack services

Docker Compose is intended for local development and binds its service ports to loopback. Copy the example environment files and replace all placeholder values with unique local secrets:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
```

`backend/.env` must contain distinct `JWT_SECRET` and `REFRESH_TOKEN_SECRET` values of at least 32 characters. Keep both `.env` files out of version control. `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `SEED_ADMIN_PASSWORD`, and the two token secrets must not be reused.

Start the services and migrate the database:

```sh
docker compose up --build -d
docker compose exec api npm run db:deploy
```

Seed the baseline department/category and an administrator account. Use the same `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values configured in `backend/.env`:

```sh
docker compose exec api npm run db:seed:compiled
```

The portal is available at `http://localhost:8080`; API documentation is at `http://localhost:8080/docs`. PostgreSQL, Redis, and MinIO are exposed only on localhost at ports 5432, 6379, 9000, and 9001. Persisted data is stored in named Compose volumes. MinIO initialization creates a private bucket and a scoped service account for the API.

The AI worker is wired to the included FastAPI service, but no model is bundled. Analysis requests therefore return `NOT_CONFIGURED`; the worker does not invent a classification or risk score. SMTP environment keys are reserved but email delivery is not implemented. Notifications are persisted in the database.

For production, deploy behind HTTPS, set `COOKIE_SECURE=true`, configure `TRUST_PROXY` only for the actual trusted proxy topology, provide managed Postgres/Redis/private S3-compatible storage, rotate strong secrets, and review the service's authentication, retention, backup, monitoring, and operational policies before accepting real complaint data. The included Compose defaults are development-only.

## API overview

The API is versioned under `/api/v1`:

- `/auth`: citizen registration, login, refresh, logout, current user and profile.
- `/metadata`: active departments and complaint categories.
- `/complaints`: role-scoped complaints, notes, status updates, assignments, evidence, feedback and explicit AI-analysis state.
- `/notifications`: current-user notifications and read state.
- `/admin`: officer/citizen administration, departments, categories, SLA settings, audit records, reports and duplicate-review decisions.

Access and rotating refresh tokens are set as `HttpOnly` cookies. API mutations validate request bodies, enforce role/ownership checks, and write audit events. Images are validated by file signature, capped at 512 KiB per image, stored without public access, and served only after complaint authorization. Interactive OpenAPI documentation and the machine-readable specification are served at `/docs` and `/api/openapi.json`.

## Backend development

With PostgreSQL and Redis available:

```sh
cd backend
npm ci
cp .env.example .env
npm run db:deploy
npm run db:seed
npm run dev
```

For direct backend development against the Compose database, set `DATABASE_URL` in `backend/.env` to the same database name, user and `POSTGRES_PASSWORD` from the root `.env`, using the local host and port. Compose overrides that URL inside its containers.

In another terminal, run the BullMQ AI/SLA worker:

```sh
cd backend
npm run worker:dev
```

Validate the schema, types and request validation tests with:

```sh
cd backend
npm run build
npm test
```
