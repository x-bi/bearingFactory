import { Controller, Get, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('processes')
@UseGuards(JwtAuthGuard)
export class ProcessesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.process.findMany({
      where: { enabled: true },
      orderBy: { sort: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        sort: true,
        executionMode: true,
      },
    })
  }
}
