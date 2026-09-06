import { createHash, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function bootstrapDatabase(
  databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db',
) {
  const migrationsDirectory = resolve(process.cwd(), 'prisma', 'migrations')
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('SQLite bootstrap only supports a file: DATABASE_URL')
  }
  const rawPath = databaseUrl.slice('file:'.length).split('?')[0]
  const databasePath = rawPath.startsWith('./')
    ? resolve(process.cwd(), 'prisma', rawPath.slice(2))
    : resolve(rawPath)
  const database = new DatabaseSync(databasePath)

  try {
    database.exec('PRAGMA foreign_keys=ON;')
    database.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `)
    const migrationNames = readdirSync(migrationsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    for (const migrationName of migrationNames) {
      const migrationPath = resolve(
        migrationsDirectory,
        migrationName,
        'migration.sql',
      )
      const migrationSql = readFileSync(migrationPath, 'utf8')
      const recorded = database
        .prepare(
          'SELECT id FROM "_prisma_migrations" WHERE "migration_name" = ?',
        )
        .get(migrationName)
      if (recorded) continue

      database.exec(migrationSql)
      database
        .prepare(
          'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)',
        )
        .run(
          randomUUID(),
          createHash('sha256').update(migrationSql).digest('hex'),
          migrationName,
        )
    }
    console.info(`Database ready: ${databasePath}`)
  } finally {
    database.close()
  }
}

if (require.main === module) bootstrapDatabase()
