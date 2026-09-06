import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateMachineDto } from './dto/create-machine.dto'
import { UpdateMachineDto } from './dto/update-machine.dto'

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workstation.findMany({
      where: { type: 'DEVICE' },
      orderBy: [{ process: { sort: 'asc' } }, { sort: 'asc' }, { id: 'asc' }],
      include: { process: true },
    })
  }

  async create(dto: CreateMachineDto, userId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const process = await tx.process.findFirst({
          where: { id: dto.processId, enabled: true, executionMode: 'MACHINE' },
        })
        if (!process)
          throw new BadRequestException('只能为粗车、精车或镗加工增加机器')
        const layout = await tx.workshopLayout.findFirst({
          where: { isActive: true },
          orderBy: { id: 'asc' },
        })
        if (!layout) throw new BadRequestException('尚未配置车间布局')
        const lastMachine = await tx.workstation.findFirst({
          where: { processId: process.id, type: 'DEVICE' },
          orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        })
        const machine = await tx.workstation.create({
          data: {
            layoutId: layout.id,
            processId: process.id,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            type: 'DEVICE',
            sort: (lastMachine?.sort ?? 0) + 10,
            // 坐标字段仅为旧数据兼容；车间总览按工序顺序自动排版。
            x: 0,
            y: 0,
          },
          include: { process: true },
        })
        await tx.operationLog.create({
          data: {
            userId,
            action: 'CREATE_MACHINE',
            entityType: 'Workstation',
            entityId: machine.id,
            payload: JSON.stringify(dto),
          },
        })
        return machine
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('机器编码已存在')
      }
      throw error
    }
  }

  async update(id: number, dto: UpdateMachineDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const machine = await tx.workstation.findFirst({
        where: { id, type: 'DEVICE' },
      })
      if (!machine) throw new NotFoundException('机器不存在')
      if (dto.enabled === false) {
        const active = await tx.processTask.findFirst({
          where: { workstationId: id, status: 'PROCESSING' },
        })
        if (active)
          throw new ConflictException('机器仍有加工中的生产单，不能停用')
      }
      const updated = await tx.workstation.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        },
        include: { process: true },
      })
      await tx.operationLog.create({
        data: {
          userId,
          action: 'UPDATE_MACHINE',
          entityType: 'Workstation',
          entityId: id,
          payload: JSON.stringify(dto),
        },
      })
      return updated
    })
  }
}
