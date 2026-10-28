# Deployment

---

## Docker Images

### Backend services — `docker/base.Dockerfile`

A multi-stage build using Turborepo pruning to produce minimal images:

| Stage     | What happens                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `pruner`  | `turbo prune --scope=<service>` produces a minimal subtree with only the files needed by that service |
| `builder` | Installs pruned dependencies, runs `pnpm proto:gen` and `pnpm db:generate`, compiles TypeScript       |
| `runner`  | Copies only production build artifacts, drops all dev dependencies, runs as a non-root `nodejs` user  |

### Frontend — `docker/web.Dockerfile`

| Stage     | What happens                                                                   |
| --------- | ------------------------------------------------------------------------------ |
| `pruner`  | Turborepo prune for the `web` scope                                            |
| `builder` | Full Vite build pipeline (WASM → bundle → images → service worker → CSS purge) |
| `runner`  | Copies `dist/` into `nginx:alpine` — no Node.js at runtime                     |

---

## Compose Files

| File                       | Use case                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.local.yml` | Full local stack including MongoDB and Redis containers                                                                                        |
| `docker-compose.dev.yml`   | Services only — connects to external/remote infra                                                                                              |
| `docker-compose.ci.yml`    | Build and smoke-test all service images — run both locally and as a required step in `.github/workflows/ci.yml` on every PR; see "CI/CD" below |
| `docker-compose.prod.yml`  | Pull pre-built images from the container registry                                                                                              |

### Local development

```bash
docker compose -f docker-compose.local.yml up
```

### Production

```bash
TAG_NAME=v1.2.3 docker compose -f docker-compose.prod.yml up -d
```

Images are tagged with `$TAG_NAME` and published by the CI pipeline before deploying.

---

## Service Ports

| Service     | Exposed port | Protocol            |
| ----------- | ------------ | ------------------- |
| api-gateway | 9002         | HTTPS + WebSocket   |
| web (nginx) | 443          | HTTPS               |
| MongoDB     | 27017        | TCP (internal only) |
| Redis       | 6379         | TCP (internal only) |

gRPC ports (50051–50060) are internal to the Docker network and are never exposed to the host.

---

## nginx Configuration

`docker/nginx.conf` configures the frontend container:

- Serves static files from `/usr/share/nginx/html`
- All routes fall back to `index.html` (SPA routing)
- Gzip compression for JS/CSS/HTML
- Cache-Control headers: hashed assets (`/assets/`) get long-lived caching; `index.html` gets `no-cache`
- Proxies `/api/*` requests to the API gateway (optional — can also be handled at the load balancer)

---

## Environment Variables

### API Gateway

| Variable                  | Required | Description                                                                                  |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | Yes      | `production` or `development`                                                                |
| `API_GATEWAY_PORT`        | Yes      | Port to bind (default `9002`)                                                                |
| `CLIENT_URL`              | Yes      | Allowed frontend origin(s), comma-separated                                                  |
| `JWT_SECRET_ACCESS`       | Yes      | Access token signing key (≥ 32 random bytes)                                                 |
| `JWT_SECRET_REFRESH`      | Yes      | Refresh token signing key (≥ 32 random bytes)                                                |
| `CSRF_SECRET`             | Yes      | CSRF double-cookie secret (≥ 32 random bytes)                                                |
| `GOOGLE_CLIENT_ID`        | Yes      | Google OAuth 2.0 client ID                                                                   |
| `GOOGLE_CLIENT_SECRET`    | Yes      | Google OAuth 2.0 client secret                                                               |
| `GOOGLE_CALLBACK_URL`     | Yes      | OAuth redirect URI (must match Google Console)                                               |
| `REDIS_HOST`              | Yes      | Redis hostname                                                                               |
| `REDIS_PORT`              | No       | Redis port (default `6379`)                                                                  |
| `REDIS_PASSWORD`          | No       | Redis password (if auth enabled)                                                             |
| `RAZORPAY_KEY_ID`         | Yes      | Razorpay API key ID                                                                          |
| `RAZORPAY_KEY_SECRET`     | Yes      | Razorpay API key secret                                                                      |
| `RAZORPAY_WEBHOOK_SECRET` | Yes      | Razorpay webhook HMAC secret                                                                 |
| `OLLAMA_BASE_URL`         | No       | Ollama server URL (default `http://localhost:11434`); AI Insights and resume scoring only    |
| `MCP_ISSUER_URL`          | No       | Public gateway origin for the MCP/OAuth endpoints (default: origin of `GOOGLE_CALLBACK_URL`) |
| `AUTH_SERVICE_PORT`       | No       | Default `50051`                                                                              |
| `EMPLOYEE_SERVICE_PORT`   | No       | Default `50053`                                                                              |
| _(etc. for each service)_ |          |                                                                                              |

### All backend services

| Variable                   | Required | Description                                 |
| -------------------------- | -------- | ------------------------------------------- |
| `MONGO_URI`                | Yes      | MongoDB connection string (master database) |
| `NODE_ENV`                 | Yes      |                                             |
| `FIELD_ENCRYPTION_KEY`     | Yes      | AES-256 key for sensitive field encryption  |
| `AWS_ACCESS_KEY_ID`        | Yes      | For S3 file uploads and Secrets Manager     |
| `AWS_SECRET_ACCESS_KEY`    | Yes      |                                             |
| `AWS_REGION`               | Yes      |                                             |
| `S3_BUCKET_NAME`           | Yes      | S3 bucket for file uploads                  |
| `FIREBASE_SERVICE_ACCOUNT` | Yes      | Stringified FCM service account JSON        |
| `SMTP_HOST`                | Yes      | Email relay host                            |
| `SMTP_PORT`                | No       | Default `587`                               |
| `SMTP_USER`                | Yes      |                                             |
| `SMTP_PASS`                | Yes      |                                             |

### Frontend (Vite)

| Variable                | Description                               |
| ----------------------- | ----------------------------------------- |
| `VITE_API_STRING`       | API gateway base URL                      |
| `VITE_SOCKET_URL`       | Socket.IO server URL                      |
| `VITE_FIREBASE_CONFIG`  | Firebase config object (JSON stringified) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID                    |

---

## SSL / TLS

The API gateway and Vite dev server both require SSL certificates.

**Development:** Self-signed certificates in `packages/certificates/cert.pem` and `packages/certificates/key.pem`.

**Production:** Use certificates from a trusted CA (Let's Encrypt, AWS ACM, etc.) and mount them into the container or terminate TLS at the load balancer.

---

## Database Strategy in Production

Because each tenant gets its own MongoDB database, production deployments should consider:

- **Connection pool memory:** `getClientForDb` creates one `PrismaClient` per tenant, capped at 50 clients per process with LRU eviction, plus a 30-minute idle TTL sweep (`packages/database/src/tenantClientPool.ts`). This bounds memory per process but is still multiplied across every service process — watch per-tenant client counts as tenant volume grows.
- **Backups:** Each tenant database should be backed up independently. Automate backups via MongoDB Atlas or mongodump cron jobs.
- **Migrations:** `pnpm db:push` (`prisma db push`) only targets the single database `DEV_MONGODB_URI` resolves to — it does **not** fan out to tenant databases. Run `pnpm db:migrate` after every schema change to push the schema to every tenant database (`packages/database/src/push-to-all-tenants.ts`). For production, apply schema changes in a rolling deployment and verify backward compatibility first.
- **Monitoring:** Add per-tenant tags to metrics and logs to identify slow tenants.

### MongoDB HA and backups — action required before launch

This repository connects to MongoDB purely via the `MONGO_URI` (and per-tenant
database) connection strings — there is no MongoDB resource anywhere in
`cloudformation/hrms-deploy.yaml` or any Docker Compose file. That's not an
oversight to fix in code: it means MongoDB is provisioned and operated
entirely outside this repository, on infrastructure this codebase has no
visibility into. Concretely, that means:

- **Replication/HA cannot be verified or added from here.** Whoever
  provisioned the database (MongoDB Atlas, a self-managed replica set, AWS
  DocumentDB, or a single standalone `mongod`) needs to confirm directly
  against that system whether it's actually running as a replica set. A
  standalone instance means a single node failure is unrecoverable data loss
  for every tenant's data — this is the one item severe enough to block
  launch on its own if it turns out to be true.
- **Automated backups cannot be added from here either**, for the same
  reason. If on Atlas: enable Continuous Cloud Backup (point-in-time
  restore) in the Atlas project settings. If self-managed: schedule
  `mongodump --uri="$MONGO_URI" --gzip --archive=...` (or, better, filesystem
  / EBS snapshots if the data directory is on EBS) via cron or AWS Backup,
  shipped to S3 with a lifecycle policy, and **test a real restore** —
  an unverified backup is not a backup.
- **What this means operationally:** before production launch, get written
  (or at minimum Slack-message-level) confirmation from whoever owns the
  Mongo deployment that both replication and backups are in place, and keep
  that confirmation somewhere durable (this file, or a runbook). Do not infer
  it from the absence of a finding in this repo — the repo genuinely cannot
  see it either way.

---

## Health Checks

Each gRPC service implements the standard `grpc.health.v1.Health` service. The API gateway exposes:

```
GET /health   → 200 OK
```

Docker Compose healthchecks use this endpoint to determine when the gateway is ready before routing traffic.

---

## Scaling

- The **API gateway** is stateless and can be scaled horizontally. Socket.IO uses the Redis adapter, so multiple instances share room memberships — no sticky sessions needed.
- **gRPC services** are stateless and scale independently.
- The **scheduler-service** should run as a **single instance** to prevent duplicate cron job executions (or use BullMQ's built-in job ID deduplication).
- **MongoDB** can be scaled by moving high-traffic tenant databases to dedicated MongoDB Atlas clusters.
- **Redis** can be scaled with Redis Cluster or Redis Sentinel for HA.

### Monitoring host — residual single point of failure

`MonitoringInstance` in `cloudformation/hrms-deploy.yaml` runs Prometheus,
Grafana, and Alertmanager co-located on one `t3.micro`, deliberately outside
the auto-scaling group it monitors. Two mitigations are in place:

- **Auto-recovery** (`MonitoringInstanceRecoveryAlarm`): if the instance
  fails its EC2 system status check for 5 consecutive minutes, AWS
  automatically recovers it on the same host. This self-heals a hardware
  fault in a few minutes without a human noticing first — but it can't help
  with an AZ-wide outage, since the instance and its EBS volume stay pinned
  to their current AZ.
- **Daily EBS snapshots** (`MonitoringBackupPolicy`, via AWS DLM, 14-day
  retention): if the instance or its volume is lost outright, 90 days of
  Prometheus history and every Grafana dashboard aren't gone with it —
  restorable from the most recent snapshot instead.

Neither mitigation eliminates the SPOF — during any outage of this instance
(recovery included), alerting and dashboards are unavailable, which is
precisely when they're needed most. Actually eliminating it means one of:

- A **warm-standby instance** in a second AZ behind Route 53 health-check
  failover — straightforward to add, but Prometheus's local TSDB isn't
  natively clusterable, so the standby would start with an empty history on
  failover unless it's also restoring from the DLM snapshots above.
- Migrating to a **managed/clustered backend** (Grafana Cloud, or
  self-hosted Thanos/Cortex/Mimir in front of Prometheus) for real HA and
  cross-AZ durability — the correct long-term fix, but a real infrastructure
  and cost decision, not a one-line CloudFormation change, so it's
  deliberately not made unilaterally here.

---

## CI/CD

**Current state:** `.github/workflows/ci.yml` runs on every pull request and push to `main` — lint, backend typecheck (`turbo run build --filter=!web`), frontend typecheck (`pnpm ts:check`), the full test suite (`pnpm test`), and a `docker-compose.ci.yml build --parallel` smoke build of all 14 service images. This is a required gate, not just a local pre-commit hook (which remains in place as a faster first line of defense, but is bypassable — the CI workflow is what actually blocks a broken merge). Separately, `build-and-push.yml` builds and pushes production images on push to `main` or manual dispatch, and `deploy-ec2.yml` handles the EC2 rollout.

1. **On every PR / push to `main`:** the `ci.yml` gate above.
2. **On push to `main`, after the gate passes:**
   - Tag and push images to the container registry (`build-and-push.yml`)
   - Deploy to staging: `TAG_NAME=<sha> docker compose -f docker-compose.prod.yml up -d`
3. **After staging smoke tests:**
   - Promote to production

---

## Observability

| Signal  | Local stack          | Production          |
| ------- | -------------------- | ------------------- |
| Metrics | Prometheus + Grafana | AWS CloudWatch      |
| Logs    | Loki + Grafana       | AWS CloudWatch Logs |

Each service exposes a `/metrics` endpoint on `METRICS_PORT` (separate from the gRPC port) scraped by Prometheus. Structured JSON logs are written by `@hrms/logger` (Winston) and shipped to Loki or CloudWatch depending on `NODE_ENV`.

Key metrics to monitor:

- Gateway request rate, latency P50/P95/P99
- gRPC call duration per service
- Redis cache hit ratio (L1 and L2)
- BullMQ queue depth and job failure rate
- Active tenant connection pool size
