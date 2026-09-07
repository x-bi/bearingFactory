#!/usr/bin/env bash
set -Eeuo pipefail

# ==================== Basic configuration ====================

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/bearingFactory}"
BRANCH="${BRANCH:-main}"

LOG_FILE="${LOG_FILE:-/www/wwwlogs/bearing-factory-deploy.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/bearing-factory-deploy.lock}"
SUCCESS_COMMIT_FILE="${SUCCESS_COMMIT_FILE:-$PROJECT_DIR/.last-successful-deploy}"

# Build and start exactly one service at a time.
BUILD_SERVICES=(
  "server"
  "nginx"
)

RUNTIME_SERVICES=(
  "server"
  "nginx"
)

LOW_MEMORY_MODE="${LOW_MEMORY_MODE:-1}"
STOP_CONTAINERS_BEFORE_BUILD="${STOP_CONTAINERS_BEFORE_BUILD:-0}"
MIN_SWAP_MB="${MIN_SWAP_MB:-2048}"
MIN_BUILD_HEADROOM_MB="${MIN_BUILD_HEADROOM_MB:-2400}"
STARTUP_SETTLE_SECONDS="${STARTUP_SETTLE_SECONDS:-8}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-300}"

RUNNING_BEFORE_STOP=()
CAN_RESTORE_STOPPED_CONTAINERS=0

# Fixed environment for aaPanel scheduled tasks.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export DOCKER_CONFIG="/root/.docker"
export COMPOSE_PARALLEL_LIMIT=1

# Pass "force" to deploy again when the remote commit has not changed.
FORCE_DEPLOY="${1:-}"

# ==================== Initialization ====================

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

echo
echo "============================================================"
echo "Bearing Factory deploy started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

# ==================== Error handling ====================

restore_stopped_containers() {
  if [ "$CAN_RESTORE_STOPPED_CONTAINERS" -ne 1 ] ||
     [ "${#RUNNING_BEFORE_STOP[@]}" -eq 0 ]; then
    return 0
  fi

  echo
  echo "Build did not complete. Restarting previously running containers..."

  local restore_failed=0
  local service

  for service in "${RUNTIME_SERVICES[@]}"; do
    if printf '%s\n' "${RUNNING_BEFORE_STOP[@]}" | grep -Fxq "$service"; then
      echo "Restarting previous service: $service"
      docker compose start "$service" || restore_failed=1
      sleep 2
    fi
  done

  if [ "$restore_failed" -eq 0 ]; then
    echo "Previous containers were restarted."
    return 0
  fi

  echo "Warning: failed to restart one or more previous containers."
  docker compose ps --all || true
}

on_error() {
  local exit_code=$?
  local line_number="${1:-unknown}"

  trap - ERR INT TERM
  set +e

  echo
  echo "============================================================"
  echo "Bearing Factory deploy failed"
  echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Exit code: $exit_code"
  echo "Error line: $line_number"
  echo "============================================================"

  restore_stopped_containers
  exit "$exit_code"
}

trap 'on_error $LINENO' ERR

on_signal() {
  local signal_name="$1"

  trap - ERR INT TERM
  set +e

  echo
  echo "Deploy interrupted by signal: $signal_name"
  restore_stopped_containers
  exit 130
}

trap 'on_signal INT' INT
trap 'on_signal TERM' TERM

# ==================== Prevent duplicate runs ====================

exec 9>"$LOCK_FILE"

if ! flock -n 9; then
  echo "Another Bearing Factory deploy is running. Skipping this run."
  exit 0
fi

# ==================== Environment checks ====================

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project directory does not exist: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
  echo "Current directory is not a Git repository: $PROJECT_DIR"
  exit 1
fi

for command_name in git docker flock mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name"
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is unavailable."
  exit 1
fi

echo "User: $(whoami)"
echo "Project directory: $(pwd)"
echo "Current branch: $(git branch --show-current)"
echo "Docker version: $(docker --version)"
echo "Compose version: $(docker compose version)"
echo "Compose parallel limit: $COMPOSE_PARALLEL_LIMIT"
echo "Low memory mode: $LOW_MEMORY_MODE"
echo "Stop containers before build: $STOP_CONTAINERS_BEFORE_BUILD"

echo
echo "Current memory status:"
free -h || true

echo
echo "Current swap status:"
swapon --show || true

echo
echo "Current disk status:"
df -h / || true

echo
echo "Current Docker disk usage:"
docker system df || true

# ==================== Fetch remote code ====================

echo
echo "Fetching latest code from origin/$BRANCH..."

git fetch --prune origin "$BRANCH"

REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH")"
LOCAL_COMMIT="$(git rev-parse HEAD)"
LAST_SUCCESS_COMMIT=""

if [ -f "$SUCCESS_COMMIT_FILE" ]; then
  LAST_SUCCESS_COMMIT="$(tr -d '[:space:]' < "$SUCCESS_COMMIT_FILE")"
fi

echo "Local commit:           $LOCAL_COMMIT"
echo "Remote commit:          $REMOTE_COMMIT"
echo "Last successful commit: ${LAST_SUCCESS_COMMIT:-none}"

if [ "$FORCE_DEPLOY" != "force" ] &&
   [ -n "$LAST_SUCCESS_COMMIT" ] &&
   [ "$LAST_SUCCESS_COMMIT" = "$REMOTE_COMMIT" ]; then
  echo
  echo "Remote commit has already been deployed successfully."
  echo "No deployment is required."
  exit 0
fi

if [ "$FORCE_DEPLOY" = "force" ]; then
  echo
  echo "Force deployment enabled."
fi

# ==================== Synchronize code ====================

echo
echo "Synchronizing local code with origin/$BRANCH..."

git reset --hard "origin/$BRANCH"

CURRENT_COMMIT="$(git rev-parse HEAD)"

echo "Code synchronized successfully."
echo "Current commit: $CURRENT_COMMIT"
echo "Commit message: $(git log -1 --pretty=%s)"

# ==================== Validate Docker Compose ====================

echo
echo "Validating Docker Compose configuration..."

docker compose config --quiet
AVAILABLE_SERVICES="$(docker compose config --services)"

echo
echo "Available Docker Compose services:"
printf '%s\n' "$AVAILABLE_SERVICES"

for service in "${RUNTIME_SERVICES[@]}"; do
  if ! printf '%s\n' "$AVAILABLE_SERVICES" | grep -Fxq "$service"; then
    echo "Docker Compose service does not exist: $service"
    exit 1
  fi
done

# ==================== Low-memory preparation ====================

meminfo_mb() {
  local field="$1"
  awk -v field="$field" \
    '$1 == field ":" { print int($2 / 1024); found=1 } END { if (!found) print 0 }' \
    /proc/meminfo
}

if [ "$LOW_MEMORY_MODE" != "0" ] && [ "$LOW_MEMORY_MODE" != "1" ]; then
  echo "LOW_MEMORY_MODE must be 0 or 1."
  exit 1
fi

if [ "$STOP_CONTAINERS_BEFORE_BUILD" != "0" ] &&
   [ "$STOP_CONTAINERS_BEFORE_BUILD" != "1" ]; then
  echo "STOP_CONTAINERS_BEFORE_BUILD must be 0 or 1."
  exit 1
fi

for numeric_setting in \
  MIN_SWAP_MB \
  MIN_BUILD_HEADROOM_MB \
  STARTUP_SETTLE_SECONDS \
  HEALTH_TIMEOUT_SECONDS; do
  numeric_value="${!numeric_setting}"

  if ! [[ "$numeric_value" =~ ^[1-9][0-9]*$ ]]; then
    echo "$numeric_setting must be a positive integer."
    exit 1
  fi
done

if [ "$LOW_MEMORY_MODE" -eq 1 ]; then
  TOTAL_RAM_MB="$(meminfo_mb MemTotal)"
  TOTAL_SWAP_MB="$(meminfo_mb SwapTotal)"

  echo
  echo "Low-memory preflight: RAM=${TOTAL_RAM_MB}MB, swap=${TOTAL_SWAP_MB}MB"

  if [ "$TOTAL_RAM_MB" -lt 3072 ] && [ "$TOTAL_SWAP_MB" -lt "$MIN_SWAP_MB" ]; then
    echo "Deployment stopped before containers were changed."
    echo "Required swap: at least ${MIN_SWAP_MB}MB; current: ${TOTAL_SWAP_MB}MB."
    exit 1
  fi

  if [ "$STOP_CONTAINERS_BEFORE_BUILD" -eq 1 ]; then
    mapfile -t RUNNING_BEFORE_STOP < <(docker compose ps --status running --services)

    if [ "${#RUNNING_BEFORE_STOP[@]}" -gt 0 ]; then
      echo
      echo "Stopping running containers one by one before building..."
      CAN_RESTORE_STOPPED_CONTAINERS=1

      # Stop the public proxy first, then the application server.
      for service in "nginx" "server"; do
        if printf '%s\n' "${RUNNING_BEFORE_STOP[@]}" | grep -Fxq "$service"; then
          echo "Stopping service: $service"
          docker compose stop --timeout 30 "$service"
        fi
      done
    else
      echo "No running Bearing Factory containers need to be stopped."
    fi
  else
    echo
    echo "Keeping current containers running while new images are built."
  fi

  AVAILABLE_RAM_MB="$(meminfo_mb MemAvailable)"
  FREE_SWAP_MB="$(meminfo_mb SwapFree)"
  BUILD_HEADROOM_MB="$((AVAILABLE_RAM_MB + FREE_SWAP_MB))"

  echo
  echo "Memory available for Docker builds:"
  free -h || true
  echo "Build headroom: ${BUILD_HEADROOM_MB}MB (RAM available + swap free)"

  if [ "$BUILD_HEADROOM_MB" -lt "$MIN_BUILD_HEADROOM_MB" ]; then
    echo "Insufficient memory headroom for a safe Docker build."
    if [ "$STOP_CONTAINERS_BEFORE_BUILD" -eq 1 ]; then
      echo "Previously running containers will now be restarted."
    else
      echo "Existing containers were left unchanged."
    fi
    echo "Required: ${MIN_BUILD_HEADROOM_MB}MB; current: ${BUILD_HEADROOM_MB}MB."
    echo "Increase swap or explicitly set STOP_CONTAINERS_BEFORE_BUILD=1 to use the maintenance-window mode."
    false
  fi
fi

# ==================== Sequential image builds ====================

build_service() {
  local service="$1"
  local build_log

  build_log="$(mktemp "/tmp/bearing-factory-build-${service}.XXXXXX.log")"
  echo "Building with cache: $service"

  if COMPOSE_PARALLEL_LIMIT=1 \
     docker compose build --pull "$service" 2>&1 | tee "$build_log"; then
    rm -f -- "$build_log"
    return 0
  fi

  if ! grep -Eiq \
    'short read|unexpected EOF|failed to compute cache key' \
    "$build_log"; then
    echo "Build failed and is not a recognized cache-corruption error."
    rm -f -- "$build_log"
    return 1
  fi

  echo "Detected corrupted Docker/BuildKit cache for: $service"
  echo "Cleaning unused build cache and retrying once without cache..."

  docker builder prune -af

  if COMPOSE_PARALLEL_LIMIT=1 \
     docker compose build --pull --no-cache "$service"; then
    rm -f -- "$build_log"
    return 0
  fi

  rm -f -- "$build_log"
  return 1
}

echo
echo "Building Docker images sequentially..."
echo "Build order: ${BUILD_SERVICES[*]}"

for service in "${BUILD_SERVICES[@]}"; do
  echo
  echo "============================================================"
  echo "Building service: $service"
  echo "Started at: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "============================================================"

  build_service "$service"

  echo "Service image built successfully: $service"
  free -h || true
  swapon --show || true
done

echo
echo "All Docker images were built successfully."

# ==================== Sequential container startup ====================

wait_for_service() {
  local service="$1"
  local elapsed=0
  local container_id
  local container_state
  local health_state

  container_id="$(docker compose ps -q "$service")"

  if [ -z "$container_id" ]; then
    echo "No container was created for service: $service"
    return 1
  fi

  while [ "$elapsed" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    container_state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
    health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"

    echo "Service $service: state=${container_state:-unknown}, health=${health_state:-unknown}"

    if [ "$container_state" != "running" ]; then
      docker compose logs --tail=150 "$service" || true
      return 1
    fi

    if [ "$health_state" = "none" ] || [ "$health_state" = "healthy" ]; then
      return 0
    fi

    if [ "$health_state" = "unhealthy" ]; then
      docker compose logs --tail=150 "$service" || true
      return 1
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "Timed out waiting for service health: $service"
  docker compose logs --tail=150 "$service" || true
  return 1
}

echo
echo "Recreating containers sequentially with newly built images..."

CAN_RESTORE_STOPPED_CONTAINERS=0

# server must be ready before nginx is recreated.
for service in "${RUNTIME_SERVICES[@]}"; do
  echo
  echo "Starting service: $service"

  docker compose up \
    -d \
    --no-build \
    --no-deps \
    --force-recreate \
    --remove-orphans \
    "$service"

  sleep "$STARTUP_SETTLE_SECONDS"
  wait_for_service "$service"
done

# ==================== Final verification ====================

echo
echo "Waiting for containers to settle..."
sleep 10
docker compose ps

for service in "${RUNTIME_SERVICES[@]}"; do
  wait_for_service "$service"
done

# ==================== Mark successful deployment ====================

TEMP_SUCCESS_FILE="${SUCCESS_COMMIT_FILE}.tmp"
printf '%s\n' "$CURRENT_COMMIT" > "$TEMP_SUCCESS_FILE"
mv -f "$TEMP_SUCCESS_FILE" "$SUCCESS_COMMIT_FILE"

echo "Recorded successful deployment commit: $CURRENT_COMMIT"

# ==================== Cleanup and completion ====================

docker image prune -f

echo
echo "Final Docker Compose status:"
docker compose ps

echo
echo "Final memory status:"
free -h || true

echo
echo "Final swap status:"
swapon --show || true

echo
echo "Final Docker disk usage:"
docker system df || true

echo
echo "============================================================"
echo "Bearing Factory deploy finished successfully"
echo "Commit: $CURRENT_COMMIT"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"
