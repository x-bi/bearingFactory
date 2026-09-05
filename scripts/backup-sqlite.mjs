import { mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error(
      'db:backup currently supports only a file: SQLite DATABASE_URL',
    )
  }
  const rawPath = databaseUrl.slice('file:'.length).split('?')[0]
  return rawPath.startsWith('./')
    ? resolve('apps/server/prisma', rawPath.slice(2))
    : resolve(rawPath)
}

const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
const sourcePath = resolveDatabasePath(databaseUrl)
const outputArgument = process.argv
  .slice(2)
  .find((argument) => argument !== '--')
const outputDirectory = resolve(outputArgument ?? 'backups')
const timestamp = new Date()
  .toISOString()
  .replaceAll(':', '-')
  .replaceAll('.', '-')
const outputPath = resolve(
  outputDirectory,
  `${basename(sourcePath, '.db')}-${timestamp}.db`,
)

mkdirSync(outputDirectory, { recursive: true })
const database = new DatabaseSync(sourcePath, { readOnly: true })

try {
  await backup(database, outputPath)
  console.info(`SQLite backup created: ${outputPath}`)
} finally {
  database.close()
}
