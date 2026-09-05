import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  const prisma = new PrismaService()
  const service = new AuthService(
    prisma,
    new JwtService({ secret: 'auth-regression-test-secret' }),
  )

  beforeAll(() => prisma.$connect())
  afterAll(() => prisma.$disconnect())

  it('logs in with the seeded local administrator account', async () => {
    const result = await service.login('admin', 'admin123')

    expect(result.accessToken).toEqual(expect.any(String))
    expect(result.user).toMatchObject({ username: 'admin', role: 'ADMIN' })
  })
})
