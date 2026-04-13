#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# gen-grpc-certs.sh
#
# Generates a self-signed internal CA plus TLS certificates for all gRPC
# services and the api-gateway client (for mTLS).
#
# Output directory: packages/certificates/grpc/
#
#   ca.crt          — shared CA cert (loaded by the api-gateway to verify services)
#   server.crt/key  — server cert covering all gRPC service hostnames (one cert,
#                     SANs for every service) + private key
#   client.crt/key  — client cert used by the api-gateway for mTLS
#
# Usage:
#   bash scripts/gen-grpc-certs.sh          # generates into packages/certificates/grpc/
#   DAYS=730 bash scripts/gen-grpc-certs.sh # custom validity period
#
# After running, set these env vars (see docker-compose.dev.yml):
#   GRPC_TLS_ENABLED=true
#   GRPC_CA_CERT=/app/packages/certificates/grpc/ca.crt
#   GRPC_SERVER_CERT=/app/packages/certificates/grpc/server.crt
#   GRPC_SERVER_KEY=/app/packages/certificates/grpc/server.key
#   GRPC_CLIENT_CERT=/app/packages/certificates/grpc/client.crt
#   GRPC_CLIENT_KEY=/app/packages/certificates/grpc/client.key
# ---------------------------------------------------------------------------
set -euo pipefail

DAYS="${DAYS:-365}"
OUT="packages/certificates/grpc"
mkdir -p "$OUT"

echo "▶ Generating gRPC TLS certificates in $OUT/ (validity: ${DAYS} days)"

# ── 1. Internal CA ────────────────────────────────────────────────────────────
echo "  [1/4] Generating CA key and self-signed certificate..."
openssl genrsa -out "$OUT/ca.key" 4096 2>/dev/null
openssl req -x509 -new -nodes \
  -key "$OUT/ca.key" \
  -sha256 \
  -days "$DAYS" \
  -out "$OUT/ca.crt" \
  -subj "/CN=hrms-grpc-ca/O=HRMS Internal CA"

# ── 2. Server certificate (covers all gRPC service DNS names) ─────────────────
echo "  [2/4] Generating server key and CSR..."
openssl genrsa -out "$OUT/server.key" 4096 2>/dev/null

# SAN extension: one cert for all internal service hostnames.
# Docker Compose DNS names must match these exactly.
cat > "$OUT/server_ext.cnf" <<EOF
[req]
req_extensions = v3_req
distinguished_name = dn
[dn]
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1  = auth-service
DNS.2  = user-service
DNS.3  = employee-service
DNS.4  = attendance-service
DNS.5  = leave-service
DNS.6  = recruitment-service
DNS.7  = hrm-service
DNS.8  = salary-service
DNS.9  = analytics-service
DNS.10 = notification-service
DNS.11 = scheduler-service
DNS.12 = localhost
IP.1   = 127.0.0.1
EOF

openssl req -new \
  -key "$OUT/server.key" \
  -out "$OUT/server.csr" \
  -subj "/CN=hrms-grpc-server/O=HRMS" \
  -config "$OUT/server_ext.cnf"

echo "  [3/4] Signing server certificate with the CA..."
openssl x509 -req \
  -in "$OUT/server.csr" \
  -CA "$OUT/ca.crt" \
  -CAkey "$OUT/ca.key" \
  -CAcreateserial \
  -out "$OUT/server.crt" \
  -days "$DAYS" \
  -sha256 \
  -extensions v3_req \
  -extfile "$OUT/server_ext.cnf"

# ── 3. Client certificate (api-gateway for mTLS) ──────────────────────────────
echo "  [4/4] Generating client key and certificate (api-gateway)..."
openssl genrsa -out "$OUT/client.key" 4096 2>/dev/null

openssl req -new \
  -key "$OUT/client.key" \
  -out "$OUT/client.csr" \
  -subj "/CN=api-gateway/O=HRMS"

openssl x509 -req \
  -in "$OUT/client.csr" \
  -CA "$OUT/ca.crt" \
  -CAkey "$OUT/ca.key" \
  -CAcreateserial \
  -out "$OUT/client.crt" \
  -days "$DAYS" \
  -sha256

# ── Cleanup intermediate files ────────────────────────────────────────────────
rm -f "$OUT/ca.key" "$OUT/ca.srl" \
      "$OUT/server.csr" "$OUT/server_ext.cnf" \
      "$OUT/client.csr"

echo ""
echo "✓ Certificates written to $OUT/"
echo ""
echo "  ca.crt      — CA (load on api-gateway to verify services)"
echo "  server.crt  — gRPC server cert (load on every service)"
echo "  server.key  — gRPC server private key"
echo "  client.crt  — api-gateway client cert (mTLS)"
echo "  client.key  — api-gateway client private key"
echo ""
echo "Add to your .env:"
echo "  GRPC_TLS_ENABLED=true"
echo "  GRPC_CA_CERT=packages/certificates/grpc/ca.crt"
echo "  GRPC_SERVER_CERT=packages/certificates/grpc/server.crt"
echo "  GRPC_SERVER_KEY=packages/certificates/grpc/server.key"
echo "  GRPC_CLIENT_CERT=packages/certificates/grpc/client.crt"
echo "  GRPC_CLIENT_KEY=packages/certificates/grpc/client.key"
