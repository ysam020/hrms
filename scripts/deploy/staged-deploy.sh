#!/bin/bash
# Staged rollout for the production compose stack, one stage at a time.
#
# The instance's own /opt/hrms/deploy.sh (cloudformation/hrms-deploy.yaml,
# also run at boot by hrms.service) recreates EVERY service at once. This
# script is the operator-driven alternative used for the tenant-isolation
# rollout: same preamble (strict mode, image tag from SSM, compose file from
# S3, ECR login), but it recreates one stage at a time and waits for each
# container's Docker health check before returning. It does not change
# deploy.sh, the launch template or the boot-time behaviour.
#
# Usage (on the instance, e.g. via SSM: bash /opt/hrms/staged-deploy.sh <cmd>):
#   staged-deploy.sh prepare            fetch compose from S3, ECR login, pull images
#   staged-deploy.sh notification       notification-service only
#   staged-deploy.sh scheduler          scheduler-service only
#   staged-deploy.sh grpc               the ten gRPC services, one at a time
#   staged-deploy.sh service <name>     one compose service
#   staged-deploy.sh gateway            api-gateway (last)
#   staged-deploy.sh reconcile          final `up -d --remove-orphans` (what deploy.sh does)
#   staged-deploy.sh status             container states, health and images
#
# From an operator workstation (repo checkout), before `prepare`:
#   DEPLOY_ARTIFACTS_BUCKET=<bucket> scripts/deploy/staged-deploy.sh upload
# uploads the reviewed docker-compose.prod.yml and this script to the same S3
# location deploy.sh reads. deploy.sh downloads the compose file on every run,
# so a compose file copied only to the host would be overwritten.
#
# DRY_RUN=1 prints every command instead of running it.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HRMS_DIR="${HRMS_DIR:-/opt/hrms}"
HEALTH_TIMEOUT_S="${HEALTH_TIMEOUT_S:-120}"
GRPC_SERVICES=(
  auth-service user-service employee-service attendance-service leave-service
  recruitment-service hrm-service salary-service analytics-service
  performance-review-service
)
KNOWN_SERVICES=(notification-service scheduler-service api-gateway "${GRPC_SERVICES[@]}")

run() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "+ $*"
  else
    "$@"
  fi
}

die() {
  echo "staged-deploy: $*" >&2
  exit 1
}

# The same environment deploy.sh derives, so compose resolves the same images.
load_env() {
  : "${AWS_REGION:?set AWS_REGION}"
  : "${ECR_REGISTRY:?set ECR_REGISTRY (<account>.dkr.ecr.<region>.amazonaws.com)}"
  : "${ECR_REPOSITORY_PREFIX:?set ECR_REPOSITORY_PREFIX}"
  if [ -z "${TAG_NAME:-}" ] && [ "${DRY_RUN:-}" = "1" ]; then
    echo "+ aws ssm get-parameter --name /hrms/prod/image-tag"
    TAG_NAME="<from-ssm>"
  elif [ -z "${TAG_NAME:-}" ]; then
    TAG_NAME=$(aws ssm get-parameter --name /hrms/prod/image-tag \
      --region "$AWS_REGION" --query 'Parameter.Value' --output text)
  fi
  [ -n "$TAG_NAME" ] || die "no image tag (TAG_NAME or /hrms/prod/image-tag)"
  export AWS_REGION ECR_REGISTRY ECR_REPOSITORY_PREFIX TAG_NAME
  echo "staged-deploy: image tag $TAG_NAME"
}

compose() {
  run docker compose -f "$HRMS_DIR/$COMPOSE_FILE" "$@"
}

container_of() {
  echo "hrms-prod-$1"
}

# Waits for the container's Docker health check (every backend service has
# one, on /health of its METRICS_PORT) to report healthy.
wait_healthy() {
  local service=$1 container deadline state
  container=$(container_of "$service")
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "+ wait for $container to be healthy (up to ${HEALTH_TIMEOUT_S}s)"
    return 0
  fi
  deadline=$((SECONDS + HEALTH_TIMEOUT_S))
  while :; do
    state=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)
    [ "$state" = "healthy" ] && { echo "staged-deploy: $service healthy"; return 0; }
    [ "$SECONDS" -ge "$deadline" ] && die "$service not healthy after ${HEALTH_TIMEOUT_S}s (state: $state) — stopping here; nothing further was changed"
    sleep 3
  done
}

deploy_service() {
  local service=$1
  printf '%s\n' "${KNOWN_SERVICES[@]}" | grep -qx "$service" || die "unknown service: $service"
  echo "staged-deploy: recreating $service"
  # --no-deps: never let compose also recreate this service's dependencies.
  compose up -d --no-deps "$service"
  wait_healthy "$service"
}

cmd=${1:-}
case "$cmd" in
  upload)
    : "${DEPLOY_ARTIFACTS_BUCKET:?set DEPLOY_ARTIFACTS_BUCKET}"
    here=$(cd "$(dirname "$0")" && pwd)
    repo=$(cd "$here/../.." && pwd)
    run aws s3 cp "$repo/docker-compose.prod.yml" "s3://$DEPLOY_ARTIFACTS_BUCKET/docker-compose.prod.yml"
    run aws s3 cp "$here/staged-deploy.sh" "s3://$DEPLOY_ARTIFACTS_BUCKET/staged-deploy.sh"
    ;;
  prepare)
    load_env
    : "${DEPLOY_ARTIFACTS_BUCKET:?set DEPLOY_ARTIFACTS_BUCKET}"
    run aws s3 cp "s3://$DEPLOY_ARTIFACTS_BUCKET/docker-compose.prod.yml" "$HRMS_DIR/$COMPOSE_FILE" --region "$AWS_REGION"
    # Certificates are created by deploy.sh on first boot; refuse to guess here.
    [ "${DRY_RUN:-}" = "1" ] || [ -f "$HRMS_DIR/packages/certificates/cert.pem" ] \
      || die "missing $HRMS_DIR/packages/certificates/cert.pem — run deploy.sh's certificate setup first"
    if [ "${DRY_RUN:-}" = "1" ]; then
      echo "+ aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY"
    else
      aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
    fi
    compose pull --quiet
    ;;
  notification) load_env; deploy_service notification-service ;;
  scheduler) load_env; deploy_service scheduler-service ;;
  grpc)
    load_env
    for service in "${GRPC_SERVICES[@]}"; do deploy_service "$service"; done
    ;;
  service)
    [ -n "${2:-}" ] || die "usage: $0 service <compose-service>"
    load_env
    deploy_service "$2"
    ;;
  gateway) load_env; deploy_service api-gateway ;;
  reconcile)
    load_env
    compose up -d --remove-orphans
    ;;
  status)
    compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Image}}'
    ;;
  *)
    sed -n '2,30p' "$0"
    exit 2
    ;;
esac
