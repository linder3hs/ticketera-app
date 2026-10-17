#!/bin/bash
# Runs ON the EC2 instance (as root, via SSM Run Command from .github/workflows/deploy.yml).
# Usage: deploy.sh <image-tag>
# Pulls the image, runs migrations against RDS and swaps the container; restores the previous one if the new one is unhealthy.
set -euo pipefail
export HOME=/root AWS_DEFAULT_REGION=us-east-2  # SSM Run Command does not set them

TAG="${1:?usage: deploy.sh <image-tag>}"
REGION=us-east-2
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
IMAGE="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ticketera-app"
ENV_FILE=/opt/ticketera/.env
NAME=ticketera-app

mkdir -p /opt/ticketera

echo "==> Env from Parameter Store (/ticketera/*)"
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path /ticketera --with-decryption --output json \
  | python3 -c '
import json, sys
for p in json.load(sys.stdin)["Parameters"]:
    key = p["Name"].rsplit("/", 1)[1]
    if key != "db-password":  # only used to build DATABASE_URL
        print(key + "=" + p["Value"])
' > "$ENV_FILE"

echo "==> Pull $TAG"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker pull "$IMAGE:$TAG"
docker pull "$IMAGE:$TAG-migrate"

echo "==> Migrate"
docker run --rm --env-file "$ENV_FILE" "$IMAGE:$TAG-migrate" npx drizzle-kit migrate

PREVIOUS=$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)

run_app() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped -p 3000:3000 --env-file "$ENV_FILE" \
    --log-driver awslogs --log-opt awslogs-region="$REGION" --log-opt awslogs-group=/ticketera/app --log-opt awslogs-stream=app \
    "$1" >/dev/null
}

echo "==> Start $IMAGE:$TAG"
run_app "$IMAGE:$TAG"

for _ in $(seq 1 30); do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    echo "==> Healthy"
    docker image prune -af --filter "until=48h" >/dev/null || true
    exit 0
  fi
  sleep 2
done

echo "==> NOT healthy; container logs:"
docker logs --tail 40 "$NAME" 2>&1 || true
if [ -n "$PREVIOUS" ]; then
  echo "==> Restoring $PREVIOUS"
  run_app "$PREVIOUS"
fi
exit 1
