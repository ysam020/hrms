#!/usr/bin/env bash
set -euo pipefail

AWS_ACCOUNT_ID=721908763803
AWS_REGION=ap-south-1
ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
ECR_REPOSITORY_PREFIX=dev
TAG=${1:-latest}

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

docker buildx create --use --name hrms-builder 2>/dev/null || docker buildx use hrms-builder

declare -A SERVICES=(
  ["api-gateway"]="--build-arg APP_DIR=api-gateway --build-arg PROJECT=api-gateway-service --build-arg PORT=9002"
  ["auth-service"]="--build-arg APP_DIR=auth-service --build-arg PROJECT=auth-service --build-arg PORT=50051"
  ["user-service"]="--build-arg APP_DIR=user-service --build-arg PROJECT=user-service --build-arg PORT=50052"
  ["employee-service"]="--build-arg APP_DIR=employee-service --build-arg PROJECT=employee-service --build-arg PORT=50053"
  ["attendance-service"]="--build-arg APP_DIR=attendance-service --build-arg PROJECT=attendance-service --build-arg PORT=50054"
  ["leave-service"]="--build-arg APP_DIR=leave-service --build-arg PROJECT=leave-service --build-arg PORT=50055"
  ["recruitment-service"]="--build-arg APP_DIR=recruitment-service --build-arg PROJECT=recruitment-service --build-arg PORT=50056"
  ["hrm-service"]="--build-arg APP_DIR=hrm-service --build-arg PROJECT=hrm-service --build-arg PORT=50057"
  ["salary-service"]="--build-arg APP_DIR=salary-service --build-arg PROJECT=salary-service --build-arg PORT=50058"
  ["analytics-service"]="--build-arg APP_DIR=analytics-service --build-arg PROJECT=analytics-service --build-arg PORT=50059"
  ["notification-service"]="--build-arg APP_DIR=notification-service --build-arg PROJECT=notification-service --build-arg PORT=50060"
  ["scheduler-service"]="--build-arg APP_DIR=scheduler-service --build-arg PROJECT=scheduler-service"
)

for svc in "${!SERVICES[@]}"; do
  echo "=== $svc ==="
  aws ecr describe-repositories --repository-names "${ECR_REPOSITORY_PREFIX}/${svc}" --region $AWS_REGION >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "${ECR_REPOSITORY_PREFIX}/${svc}" \
         --image-scanning-configuration scanOnPush=true \
         --encryption-configuration encryptionType=AES256 \
         --region $AWS_REGION >/dev/null

  docker buildx build --push --platform linux/amd64,linux/arm64 \
    --file docker/base.Dockerfile ${SERVICES[$svc]} \
    -t ${ECR_REGISTRY}/${ECR_REPOSITORY_PREFIX}/${svc}:${TAG} \
    -t ${ECR_REGISTRY}/${ECR_REPOSITORY_PREFIX}/${svc}:latest \
    .
done

echo "=== web ==="
aws ecr describe-repositories --repository-names "${ECR_REPOSITORY_PREFIX}/web" --region $AWS_REGION >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPOSITORY_PREFIX}/web" \
       --image-scanning-configuration scanOnPush=true \
       --encryption-configuration encryptionType=AES256 \
       --region $AWS_REGION >/dev/null

docker buildx build --push --platform linux/amd64,linux/arm64 \
  --file docker/web.Dockerfile \
  -t ${ECR_REGISTRY}/${ECR_REPOSITORY_PREFIX}/web:${TAG} \
  -t ${ECR_REGISTRY}/${ECR_REPOSITORY_PREFIX}/web:latest \
  .

echo "Done."
