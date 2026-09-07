#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/bearingFactory}"
LOCK_FILE="${LOCK_FILE:-/tmp/bearing-factory-deploy.lock}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-180}"
CONFIRMATION_FLAG="--confirm-clear-business-data"

print_scope() {
  cat <<'EOF'
This script permanently clears Bearing Factory business/test data:
  ProductionOrder, Batch, ProcessTask, Transfer, ScrapRecord, OperationLog

It keeps:
  User, Process, WorkshopLayout, Workstation, _prisma_migrations

Before clearing, it stops the server container and creates a SQLite backup in:
  backups/production-before-clear-<timestamp>.db
EOF
}

if [ "${1:-}" != "$CONFIRMATION_FLAG" ]; then
  print_scope
  echo
  echo "Nothing was changed. To continue, run:"
  echo "bash scripts/clear-production-data.sh $CONFIRMATION_FLAG"
  exit 2
fi

for command_name in docker flock; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name"
    exit 1
  fi
done

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "A deployment or data-clear operation is already running. Try again later."
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project directory does not exist: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"
PROJECT_DIR="$(pwd -P)"

if [ ! -f "docker-compose.yml" ]; then
  echo "docker-compose.yml was not found in: $PROJECT_DIR"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is unavailable."
  exit 1
fi

docker compose config --quiet

if ! docker compose config --services | grep -Fxq "server"; then
  echo "Docker Compose service does not exist: server"
  exit 1
fi

DATA_DIR="$PROJECT_DIR/data"
DATABASE_FILE="$DATA_DIR/production.db"
BACKUP_DIR="$PROJECT_DIR/backups"

if [ ! -d "$DATA_DIR" ]; then
  echo "Database directory does not exist: $DATA_DIR"
  exit 1
fi

RESOLVED_DATA_DIR="$(cd "$DATA_DIR" && pwd -P)"
if [ "$RESOLVED_DATA_DIR" != "$DATA_DIR" ]; then
  echo "Refusing to use a data directory that resolves outside the expected path."
  echo "Expected: $DATA_DIR"
  echo "Resolved: $RESOLVED_DATA_DIR"
  exit 1
fi

if [ ! -f "$DATABASE_FILE" ]; then
  echo "Production database does not exist: $DATABASE_FILE"
  exit 1
fi

if ! [[ "$HEALTH_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "HEALTH_TIMEOUT_SECONDS must be a positive integer."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
BACKUP_BASENAME="production-before-clear-$BACKUP_TIMESTAMP.db"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_BASENAME"

SERVER_WAS_RUNNING=0
SERVER_RESTARTED=0

if docker compose ps --status running --services | grep -Fxq "server"; then
  SERVER_WAS_RUNNING=1
fi

restart_server_if_needed() {
  if [ "$SERVER_WAS_RUNNING" -eq 1 ] && [ "$SERVER_RESTARTED" -eq 0 ]; then
    echo
    echo "Restarting the server container..."
    docker compose up -d --no-build --no-deps server
    SERVER_RESTARTED=1
  fi
}

on_exit() {
  local exit_code=$?
  trap - EXIT INT TERM
  set +e
  restart_server_if_needed
  exit "$exit_code"
}

trap on_exit EXIT
trap 'exit 130' INT TERM

print_scope
echo
echo "Project directory: $PROJECT_DIR"
echo "Database: $DATABASE_FILE"
echo "Backup: $BACKUP_FILE"

if [ "$SERVER_WAS_RUNNING" -eq 1 ]; then
  echo
  echo "Stopping the server container before backup and clearing..."
  docker compose stop --timeout 30 server
else
  echo "Server container is not running; it will remain stopped after clearing."
fi

echo
echo "Creating a consistent backup and clearing business data..."

docker compose run \
  --rm \
  --no-deps \
  -T \
  -v "$BACKUP_DIR:/backup" \
  server \
  node --input-type=module - "$BACKUP_BASENAME" <<'NODE'
import { chmodSync } from 'node:fs'
import { backup, DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

const databasePath = '/data/production.db'
const backupName = process.argv[2]

if (!backupName || backupName.includes('/') || backupName.includes('\\')) {
  throw new Error('Invalid backup filename')
}

const backupPath = resolve('/backup', backupName)
const database = new DatabaseSync(databasePath)

const retainedTables = [
  'User',
  'Process',
  'WorkshopLayout',
  'Workstation',
  '_prisma_migrations',
]
const clearedTables = [
  'OperationLog',
  'ScrapRecord',
  'Transfer',
  'ProcessTask',
  'Batch',
  'ProductionOrder',
]
const expectedTables = new Set([...retainedTables, ...clearedTables])

try {
  database.exec('PRAGMA foreign_keys = ON;')

  const actualTables = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map(({ name }) => name)

  const missingTables = [...expectedTables].filter(
    (name) => !actualTables.includes(name),
  )
  const unknownTables = actualTables.filter((name) => !expectedTables.has(name))

  if (missingTables.length > 0 || unknownTables.length > 0) {
    throw new Error(
      `Database schema does not match this clear script. ` +
        `Missing tables: ${missingTables.join(', ') || 'none'}. ` +
        `Unknown tables: ${unknownTables.join(', ') || 'none'}.`,
    )
  }

  const integrityResult = database.prepare('PRAGMA integrity_check').get()
  if (integrityResult.integrity_check !== 'ok') {
    throw new Error(`Database integrity check failed: ${JSON.stringify(integrityResult)}`)
  }

  await backup(database, backupPath)
  chmodSync(backupPath, 0o600)
  console.info(`SQLite backup created: ${backupPath}`)

  const beforeCounts = Object.fromEntries(
    clearedTables.map((table) => [
      table,
      database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count,
    ]),
  )

  database.exec('BEGIN IMMEDIATE;')
  try {
    for (const table of clearedTables) {
      database.exec(`DELETE FROM "${table}";`)
    }

    const placeholders = clearedTables.map(() => '?').join(', ')
    database
      .prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`)
      .run(...clearedTables)

    const violations = database.prepare('PRAGMA foreign_key_check').all()
    if (violations.length > 0) {
      throw new Error(
        `Foreign-key check failed: ${JSON.stringify(violations.slice(0, 10))}`,
      )
    }

    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }

  database.exec('VACUUM;')

  const afterCounts = Object.fromEntries(
    clearedTables.map((table) => [
      table,
      database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count,
    ]),
  )

  if (Object.values(afterCounts).some((count) => count !== 0)) {
    throw new Error(`Some business data remains: ${JSON.stringify(afterCounts)}`)
  }

  console.info(`Rows before clear: ${JSON.stringify(beforeCounts)}`)
  console.info(`Rows after clear: ${JSON.stringify(afterCounts)}`)
} finally {
  database.close()
}
NODE

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Backup file was not created or is empty: $BACKUP_FILE"
  exit 1
fi

chmod 600 "$BACKUP_FILE"

restart_server_if_needed

if [ "$SERVER_WAS_RUNNING" -eq 1 ]; then
  echo
  echo "Waiting for the server to become healthy..."
  elapsed=0
  while [ "$elapsed" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    container_id="$(docker compose ps -q server)"
    health_state="$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
        "$container_id" 2>/dev/null || true
    )"

    if [ "$health_state" = "healthy" ] || [ "$health_state" = "none" ]; then
      break
    fi

    if [ "$health_state" = "unhealthy" ]; then
      docker compose logs --tail=150 server || true
      echo "Server became unhealthy after clearing."
      exit 1
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  if [ "$elapsed" -ge "$HEALTH_TIMEOUT_SECONDS" ]; then
    docker compose logs --tail=150 server || true
    echo "Timed out waiting for server health."
    exit 1
  fi
fi

trap - EXIT INT TERM

echo
echo "Business/test data was cleared successfully."
echo "Backup retained at: $BACKUP_FILE"
echo "Accounts and workshop configuration were preserved."
