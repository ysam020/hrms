#!/bin/bash
# Exercises staged-deploy.sh against stub `aws` and `docker` binaries (no
# real AWS, Docker or network). Run: bash scripts/deploy/staged-deploy.test.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/opt/packages/certificates"
touch "$work/opt/packages/certificates/cert.pem"
log="$work/calls.log"

cat > "$work/bin/aws" <<STUB
#!/bin/bash
echo "aws \$*" >> "$log"
case "\$1 \$2" in
  "ssm get-parameter") echo "tag-from-ssm" ;;
  "ecr get-login-password") echo "pw" ;;
esac
STUB
cat > "$work/bin/docker" <<STUB
#!/bin/bash
echo "docker \$*" >> "$log"
if [ "\$1" = "inspect" ]; then
  name="\${@: -1}"
  if [ -n "\${UNHEALTHY:-}" ] && [ "\$name" = "\$UNHEALTHY" ]; then echo unhealthy; else echo healthy; fi
fi
STUB
chmod +x "$work/bin/aws" "$work/bin/docker"

export PATH="$work/bin:$PATH" HRMS_DIR="$work/opt" AWS_REGION=ap-south-1 \
  ECR_REGISTRY=123.dkr.ecr.ap-south-1.amazonaws.com ECR_REPOSITORY_PREFIX=prod \
  DEPLOY_ARTIFACTS_BUCKET=bucket
fail() { echo "FAIL: $*"; cat "$log"; exit 1; }
script="$here/staged-deploy.sh"

: > "$log"; bash "$script" prepare >/dev/null
grep -q "aws s3 cp s3://bucket/docker-compose.prod.yml $work/opt/docker-compose.prod.yml" "$log" || fail "prepare downloads compose from S3"
grep -q "docker compose -f $work/opt/docker-compose.prod.yml pull --quiet" "$log" || fail "prepare pulls"
grep -q "aws ssm get-parameter --name /hrms/prod/image-tag" "$log" || fail "tag read from SSM"

: > "$log"; bash "$script" notification >/dev/null
[ "$(grep -c "compose .* up -d" "$log")" = 1 ] || fail "notification stage recreates exactly one service"
grep -q "up -d --no-deps notification-service" "$log" || fail "notification-service with --no-deps"
grep -q "docker inspect .* hrms-prod-notification-service" "$log" || fail "waits for health"

: > "$log"; bash "$script" grpc >/dev/null
[ "$(grep -c "up -d --no-deps" "$log")" = 10 ] || fail "grpc stage recreates the ten gRPC services"
grep -q "up -d --no-deps api-gateway" "$log" && fail "grpc stage must not touch the gateway"

: > "$log"
if UNHEALTHY=hrms-prod-employee-service HEALTH_TIMEOUT_S=1 bash "$script" grpc >/dev/null 2>&1; then
  fail "an unhealthy service must fail the stage"
fi
grep -q "up -d --no-deps employee-service" "$log" || fail "reached employee-service"
grep -q "up -d --no-deps attendance-service" "$log" && fail "must stop at the first unhealthy service"

: > "$log"; bash "$script" gateway >/dev/null
grep -q "up -d --no-deps api-gateway" "$log" || fail "gateway stage"

: > "$log"; bash "$script" reconcile >/dev/null
grep -q "up -d --remove-orphans" "$log" || fail "reconcile = deploy.sh's full up"

: > "$log"
if bash "$script" service not-a-service >/dev/null 2>&1; then fail "unknown service rejected"; fi

: > "$log"; DRY_RUN=1 bash "$script" grpc >/dev/null
[ ! -s "$log" ] || fail "DRY_RUN runs nothing"

echo "staged-deploy.test.sh: all checks passed"
