# Nagrik Setu

Nagrik Setu is a grievance-redressal portal with React/Vite and Next.js frontends, a JavaScript Express API, PostgreSQL/PostGIS data model, authenticated Cloudinary image storage, Redis job queues, and AI analysis through Google Gemini and the included pretrained-model service.

## Run the portal

```sh
npm ci
npm run dev
```

The portal uses the API by default. It expects the API at `/api/v1`; set `VITE_API_BASE_URL` when the API is hosted elsewhere. To run the UI without the backend, start Vite with `VITE_DEMO_MODE=true` in the environment. Demo mode is development-only and uses in-memory sample data; authentication and portal data are not persisted in browser storage.

The separate Next.js frontend is available on port 3000 in Compose. For local development, install its dependencies and run it independently:

```sh
cd frontend-next
npm ci
BACKEND_URL=http://localhost:4000 npm run dev
```

It proxies API requests through the same origin and uses the API's `HttpOnly` session cookies; access tokens are not stored in browser storage.

## Run the local full-stack services

Docker Compose is intended for local development and binds its service ports to loopback. Copy the example environment files and replace all placeholder values with unique local secrets:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
```

`backend/.env` must contain distinct `JWT_SECRET` and `REFRESH_TOKEN_SECRET` values of at least 32 characters. Configure Cloudinary and Gemini credentials there; replace the example placeholders with valid provider credentials. Keep both `.env` files out of version control. `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD`, and the two token secrets must not be reused.

Start the services and migrate the database:

```sh
docker compose up --build -d
docker compose exec api npm run db:deploy
```

Seed the baseline department/category and an administrator account. Use the same `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values configured in `backend/.env`:

```sh
docker compose exec api npm run db:seed
```

The Vite portal is available at `http://localhost:8080`, the Next.js portal at `http://localhost:3000`, and API documentation at `http://localhost:8080/docs`. PostgreSQL/PostGIS and Redis are exposed only on localhost at ports 5432 and 6379. Database and queue data are stored in named Compose volumes. New complaint images and officer/resolution evidence are uploaded server-side to Cloudinary as authenticated assets and are served through role-authorized API routes; no Cloudinary secret is sent to either frontend. Existing S3/MinIO image records remain readable when the optional `STORAGE_*` settings are configured. For the bundled legacy MinIO service, set `STORAGE_ENDPOINT=http://minio:9000`, `STORAGE_BUCKET=nagrik-private`, and the `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` values to match `MINIO_APP_USER`/`MINIO_APP_PASSWORD` in the root `.env`, then run `docker compose --profile legacy-storage up`. Existing objects are not copied to Cloudinary automatically. Apply migrations after the database starts and before using the API or worker; the migration set enables PostGIS, stores/backfills complaint points, and creates spatial indexes.

The AI worker sends complaint text and a bounded set of nearby existing complaint records to Gemini when `GEMINI_API_KEY` is configured (`GEMINI_MODEL` defaults to `gemini-flash-latest`). The key is sent to Google in the `X-goog-api-key` header and is never exposed to a frontend. Gemini output is schema-validated, constrained to active categories/departments and real candidate records, and persisted in the existing AI analysis record. Model suggestions and confidence are advisory, confidence is not calibrated, and human review is required; the model is not asked to determine fraud. The included FastAPI service remains available for text/image embeddings and heuristic duplicate ranking. It downloads the configured public Sentence Transformers text model and Hugging Face ViT image classifier on first analysis; set `TEXT_MODEL_NAME`, `TEXT_MODEL_REVISION`, `IMAGE_MODEL_NAME`, and `IMAGE_MODEL_REVISION` in the root `.env` to select alternatives. If Gemini is unavailable, the worker records a clear failure status and complaint submission continues; the existing analysis service can still supply its independent results.

In-app notifications are always persisted. SMTP and Twilio SMS delivery are optional and require complete provider settings in `backend/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_FROM`). When credentials are absent, deliveries are marked `NOT_CONFIGURED`; they are not reported as sent. Configured deliveries are retried by the worker and administrators can review delivery status and errors in the portal.

For production, deploy behind HTTPS, set `COOKIE_SECURE=true`, configure `TRUST_PROXY` only for the actual trusted proxy topology, provide managed Postgres/Redis and valid Cloudinary/Gemini credentials, rotate strong secrets, and review the service's authentication, retention, backup, monitoring, and operational policies before accepting real complaint data. The included Compose defaults are development-only.

## API overview

The API is versioned under `/api/v1`:

- `/auth`: citizen registration, login, refresh, logout, current user and profile.
- `/metadata`: active departments and complaint categories.
- `/complaints`: role-scoped complaints, notes, status updates, assignments, evidence, feedback and explicit AI-analysis state.
- `/notifications`: current-user notifications and read state.
- `/admin`: officer/citizen administration, departments, categories, SLA settings, audit records, reports, AI monitoring, provider-delivery logs and duplicate-review decisions.

Access and rotating refresh tokens are set as `HttpOnly` cookies. API mutations validate request bodies, enforce role/ownership checks, and write audit events. Images are validated by file signature, capped at 512 KiB per image, uploaded as authenticated Cloudinary assets, and served only after complaint authorization through the API. Interactive OpenAPI documentation and the machine-readable specification are served at `/docs` and `/api/openapi.json`.

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

Validate the Prisma schema and run the request and integration tests with:

```sh
cd backend
npm run build
npm test
```

Build the independent Next.js frontend with:

```sh
cd frontend-next
npm ci
npm run build
```
