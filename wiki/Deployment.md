# Deployment

---

## Docker Images

### Backend services — `docker/base.Dockerfile`

A multi-stage build that uses Turborepo pruning to produce minimal images:

| Stage     | What happens                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `pruner`  | `turbo prune --scope=<service>` produces a minimal subtree containing only the files needed by that service |
| `builder` | Installs pruned dependencies, runs `pnpm proto:gen` and `pnpm db:generate`, compiles TypeScript             |
| `runner`  | Copies only the production build artifacts, drops all dev dependencies, runs as a non-root `nodejs` user    |

### Frontend — `docker/web.Dockerfile`

| Stage     | What happens                                                                   |
| --------- | ------------------------------------------------------------------------------ |
| `pruner`  | Turborepo prune for the `web` scope                                            |
| `builder` | Full Vite build pipeline (WASM → bundle → images → service worker → CSS purge) |
| `runner`  | Copies `dist/` into `nginx:alpine` — no Node.js at runtime                     |

---

## Compose Files

| File                       | Use case                                                |
| -------------------------- | ------------------------------------------------------- |
| `docker-compose.local.yml` | Full local stack including MongoDB and Redis containers |
| `docker-compose.dev.yml`   | Services only — connects to external/remote infra       |
| `docker-compose.ci.yml`    | Build and smoke-test images in CI                       |
| `docker-compose.prod.yml`  | Pull pre-built images from the container registry       |

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

| Variable                 | Required | Description                                    |
| ------------------------ | -------- | ---------------------------------------------- |
| `NODE_ENV`               | Yes      | `production` or `development`                  |
| `API_GATEWAY_PORT`       | Yes      | Port to bind (default `9002`)                  |
| `CLIENT_URL`             | Yes      | Allowed frontend origin(s), comma-separated    |
| `JWT_SECRET_ACCESS`      | Yes      | Access token signing key (≥ 32 random bytes)   |
| `JWT_SECRET_REFRESH`     | Yes      | Refresh token signing key (≥ 32 random bytes)  |
| `CSRF_SECRET`            | Yes      | CSRF double-cookie secret (≥ 32 random bytes)  |
| `GOOGLE_CLIENT_ID`       | Yes      | Google OAuth 2.0 client ID                     |
| `GOOGLE_CLIENT_SECRET`   | Yes      | Google OAuth 2.0 client secret                 |
| `GOOGLE_CALLBACK_URL`    | Yes      | OAuth redirect URI (must match Google Console) |
| `REDIS_HOST`             | Yes      | Redis hostname                                 |
| `REDIS_PORT`             | No       | Redis port (default `6379`)                    |
| `REDIS_PASSWORD`         | No       | Redis password (if auth enabled)               |
| `AUTH_SERVICE_PORT`      | No       | Default `50051`                                |
| `EMPLOYEE_SERVICE_PORT`  | No       | Default `50053`                                |
| _(etc for each service)_ |          |                                                |

### All backend services

| Variable                   | Required | Description                                |
| -------------------------- | -------- | ------------------------------------------ |
| `MONGO_URI`                | Yes      | MongoDB connection string                  |
| `NODE_ENV`                 | Yes      |                                            |
| `FIELD_ENCRYPTION_KEY`     | Yes      | AES-256 key for sensitive field encryption |
| `AWS_ACCESS_KEY_ID`        | Yes      | For S3 file uploads and Secrets Manager    |
| `AWS_SECRET_ACCESS_KEY`    | Yes      |                                            |
| `AWS_REGION`               | Yes      |                                            |
| `FIREBASE_SERVICE_ACCOUNT` | Yes      | Stringified FCM service account JSON       |
| `SMTP_HOST`                | Yes      | Email relay host                           |
| `SMTP_PORT`                | No       | Default `587`                              |
| `SMTP_USER`                | Yes      |                                            |
| `SMTP_PASS`                | Yes      |                                            |

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

**Production:** Use certificates from a trusted CA (Let's Encrypt, ACM, etc.) and mount them into the container or terminate TLS at the load balancer.

---

## Health Checks

Each gRPC service implements the standard `grpc.health.v1.Health` service (from `packages/proto-definitions/src/proto/health/health.proto`). The API gateway exposes:

```
GET /health   → 200 OK
```

Docker Compose healthchecks use this endpoint to determine when the gateway is ready.

---

## Scaling

- The API gateway is **stateless** (tokens verified from JWT secret, no local state) and can be scaled horizontally.
- Socket.IO uses the **Redis adapter** so multiple gateway instances share room memberships — no sticky sessions needed.
- gRPC services are stateless and scale independently.
- The scheduler-service should run as a **single instance** to avoid duplicate cron job executions (or use BullMQ's built-in deduplication).

---

## CI/CD

The recommended pipeline:

1. On push to `main`:
   - `pnpm lint`
   - `pnpm build`
   - `docker compose -f docker-compose.ci.yml build`
2. On success:
   - Tag and push images to the container registry
   - Deploy to staging: `TAG_NAME=<sha> docker compose -f docker-compose.prod.yml up -d`
3. After staging smoke tests:
   - Promote to production
