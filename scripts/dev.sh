#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.monitoring"
PIDS=()

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo "[monitoring] $*"; }
die()  { echo "[monitoring] ERROR: $*" >&2; exit 1; }

require_bin() {
  command -v "$1" &>/dev/null || die "'$1' not found. Run: brew install $2"
}

# ── Cleanup on exit / Ctrl+C ─────────────────────────────────────────────────
cleanup() {
  echo ""
  log "Shutting down monitoring stack..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait "${PIDS[@]}" 2>/dev/null || true
  log "Done."
}
trap cleanup EXIT INT TERM

# ── Preflight ────────────────────────────────────────────────────────────────
require_bin prometheus prometheus
require_bin loki       loki
require_bin grafana    grafana

BREW_PREFIX="$(brew --prefix)"
GRAFANA_HOME="$BREW_PREFIX/share/grafana"
[ -d "$GRAFANA_HOME" ] || die "Grafana home not found at $GRAFANA_HOME"

# ── Data directories ─────────────────────────────────────────────────────────
mkdir -p \
  "$DATA_DIR/prometheus" \
  "$DATA_DIR/loki/chunks" \
  "$DATA_DIR/loki/rules" \
  "$DATA_DIR/loki/index" \
  "$DATA_DIR/loki/index_cache" \
  "$DATA_DIR/grafana/data" \
  "$DATA_DIR/grafana/logs" \
  "$DATA_DIR/grafana/plugins"

# ── Loki config (written at runtime so paths are absolute) ───────────────────
LOKI_CFG="$DATA_DIR/loki-config.yml"
cat > "$LOKI_CFG" << LOKI_EOF
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: $DATA_DIR/loki
  storage:
    filesystem:
      chunks_directory: $DATA_DIR/loki/chunks
      rules_directory: $DATA_DIR/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: "2020-10-24"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  allow_structured_metadata: true
LOKI_EOF

# ── Grafana provisioning (written at runtime so paths are absolute) ───────────
GRAFANA_PROV_DIR="$DATA_DIR/grafana/provisioning"
mkdir -p "$GRAFANA_PROV_DIR/datasources" "$GRAFANA_PROV_DIR/dashboards"

cat > "$GRAFANA_PROV_DIR/datasources/datasources.yml" << EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: false
  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
    editable: false
    jsonData:
      maxLines: 1000
EOF

cat > "$GRAFANA_PROV_DIR/dashboards/dashboard.yml" << EOF
apiVersion: 1
providers:
  - name: HRMS
    orgId: 1
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: $ROOT_DIR/monitoring/grafana/dashboards
EOF

# ── Start Prometheus ─────────────────────────────────────────────────────────
log "Starting Prometheus on :9090..."
prometheus \
  --config.file="$ROOT_DIR/monitoring/prometheus-local.yml" \
  --storage.tsdb.path="$DATA_DIR/prometheus" \
  --storage.tsdb.retention.time=15d \
  --web.listen-address=":9090" \
  &>"$DATA_DIR/prometheus.log" &
PIDS+=($!)

# ── Start Loki ───────────────────────────────────────────────────────────────
log "Starting Loki on :3100..."
loki -config.file="$LOKI_CFG" \
  &>"$DATA_DIR/loki.log" &
PIDS+=($!)

# ── Start Grafana ─────────────────────────────────────────────────────────────
log "Starting Grafana on :3000..."
GF_PATHS_DATA="$DATA_DIR/grafana/data" \
GF_PATHS_LOGS="$DATA_DIR/grafana/logs" \
GF_PATHS_PLUGINS="$DATA_DIR/grafana/plugins" \
GF_PATHS_PROVISIONING="$GRAFANA_PROV_DIR" \
GF_SERVER_HTTP_PORT=3000 \
GF_SECURITY_ADMIN_USER=admin \
GF_SECURITY_ADMIN_PASSWORD=admin \
GF_USERS_ALLOW_SIGN_UP=false \
grafana server --homepath "$GRAFANA_HOME" \
  &>"$DATA_DIR/grafana.log" &
PIDS+=($!)

log "Prometheus  → http://localhost:9090"
log "Loki        → http://localhost:3100"
log "Grafana     → http://localhost:3000  (admin / admin)"
log ""

# ── Start application services ───────────────────────────────────────────────
LOKI_URL=http://localhost:3100 turbo run dev --concurrency=25
