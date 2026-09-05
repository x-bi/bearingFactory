export default async function globalSetup() {
  process.env.DATABASE_URL = 'file:./phase2-test.db'
  const { bootstrapDatabase } = await import('../prisma/bootstrap')
  bootstrapDatabase(process.env.DATABASE_URL)
  const { seedDatabase } = await import('../prisma/seed')
  await seedDatabase()
}
