import { randomBytes, scryptSync } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

process.env.DATABASE_URL ??= 'file:./dev.db'
const prisma = new PrismaClient()

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

const processes = [
  ['CASTING', '浇铸', 10],
  ['ROUGH_TURNING', '粗车', 20],
  ['FINISH_TURNING', '精车', 30],
  ['BORING', '镗孔', 40],
  ['DEBURRING', '去毛刺', 50],
  ['PACKAGING', '包装', 60],
  ['SHIPPING', '发货', 70],
] as const

export async function seedDatabase() {
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { name: '系统管理员', isActive: true, role: 'ADMIN' },
    create: {
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      name: '系统管理员',
      role: 'ADMIN',
    },
  })

  for (const [code, name, sort] of processes) {
    await prisma.process.upsert({
      where: { code },
      update: { name, sort, enabled: true },
      create: { code, name, sort },
    })
  }

  const layout = await prisma.workshopLayout.upsert({
    where: { id: 1 },
    update: { isActive: true },
    create: {
      id: 1,
      name: '轴承车间占位布局',
      imagePath: '/workshop-layout-placeholder.svg',
      originalWidth: 1000,
      originalHeight: 700,
    },
  })

  const processByCode = new Map(
    (await prisma.process.findMany()).map((process) => [process.code, process]),
  )
  const stations = [
    ['CASTING_AREA', '浇铸区', 'AREA', 'CASTING', 72, 10, 22, 34],
    ['ROUGH_01', '粗车1', 'DEVICE', 'ROUGH_TURNING', 52, 28, 10, 12],
    ['ROUGH_02', '粗车2', 'DEVICE', 'ROUGH_TURNING', 39, 28, 10, 12],
    ['FINISH_01', '精车1', 'DEVICE', 'FINISH_TURNING', 26, 28, 10, 12],
    ['FINISH_02', '精车2', 'DEVICE', 'FINISH_TURNING', 13, 28, 10, 12],
    ['BORING_01', '镗床1', 'DEVICE', 'BORING', 13, 48, 10, 12],
    ['BORING_BUFFER', '待镗区', 'BUFFER', 'BORING', 35, 48, 22, 16],
    ['DEBURRING_AREA', '去毛刺区', 'AREA', 'DEBURRING', 8, 70, 24, 22],
    ['PACKAGING_AREA', '包装区', 'AREA', 'PACKAGING', 38, 70, 24, 22],
    ['SHIPPING_BUFFER', '待发货区', 'BUFFER', 'SHIPPING', 68, 70, 24, 22],
  ] as const

  for (const [code, name, type, processCode, x, y, width, height] of stations) {
    const process = processByCode.get(processCode)
    if (!process) throw new Error(`Missing process ${processCode}`)
    await prisma.workstation.upsert({
      where: { code },
      update: { name, type, processId: process.id, x, y, width, height },
      create: {
        layoutId: layout.id,
        processId: process.id,
        code,
        name,
        type,
        x,
        y,
        width,
        height,
      },
    })
  }

  console.info(`Seed complete. Admin user: ${admin.username}`)
}

if (require.main === module) {
  seedDatabase()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
