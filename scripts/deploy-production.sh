#!/usr/bin/env bash
set -Eeuo pipefail

# Keep Docker Compose work strictly serial on small production servers.
export COMPOSE_PARALLEL_LIMIT=1

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/bearingFactory}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-300}"

cd "$PROJECT_DIR"

echo "[deploy] updating $DEPLOY_BRANCH"
git fetch origin "$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

wait_for_service() {
  local service="$1"
  local elapsed=0
  local container_id
  local state

  container_id="$(docker compose ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "[deploy] $service container was not created" >&2
    return 1
  fi

  while (( elapsed < HEALTH_TIMEOUT_SECONDS )); do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"

    case "$state" in
      healthy|running)
        echo "[deploy] $service is $state"
        return 0
        ;;
      unhealthy|exited|dead)
        echo "[deploy] $service entered state: $state" >&2
        docker compose logs --tail=150 "$service" >&2
        return 1
        ;;
    esac

    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "[deploy] timed out waiting for $service" >&2
  docker compose logs --tail=150 "$service" >&2
  return 1
}

echo "[deploy] building server"
docker compose build server

echo "[deploy] starting server"
docker compose up -d --no-deps server
wait_for_service server

echo "[deploy] building nginx"
docker compose build nginx

echo "[deploy] starting nginx"
docker compose up -d --no-deps nginx
wait_for_service nginx

echo "[deploy] deployment completed"
docker compose ps
