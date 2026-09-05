import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { verifyPassword } from './password'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } })
    if (!user?.isActive || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    const profile = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    }
    return {
      accessToken: await this.jwt.signAsync(profile),
      user: profile,
    }
  }

  async getProfile(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, isActive: true },
      select: { id: true, username: true, name: true, role: true },
    })
    if (!user) throw new UnauthorizedException('账号已失效')
    return user
  }
}
