import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, type ProcessTask } from '@prisma/client'
import { FlowStateService } from '../flow/flow-state.service'
import { PrismaService } from '../prisma/prisma.service'
import { AssignTaskDto } from './dto/assign-task.dto'
import { TransferTaskDto } from './dto/transfer-task.dto'
import { UpdateCompletedDto } from './dto/update-completed.dto'

const ACTIVE_STATUSES = ['PROCESSING', 'PAUSED']

@Injectable()
export class ProcessTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowState: FlowStateService,
  ) {}

  private async findTask(tx: Prisma.TransactionClient, id: number) {
    const task = await tx.processTask.findUnique({
      where: { id },
      include: {
        process: true,
        workstation: true,
        batch: { include: { order: true, startProcess: true } },
        outgoingTransfers: true,
      },
    })
    if (!task) throw new NotFoundException('加工任务不存在')
    return task
  }

  private async log(
    tx: Prisma.TransactionClient,
    userId: number,
    action: string,
    taskId: number,
    payload?: unknown,
  ) {
    await tx.operationLog.create({
      data: {
        userId,
        action,
        entityType: 'ProcessTask',
        entityId: taskId,
        payload: payload === undefined ? null : JSON.stringify(payload),
      },
    })
  }

  private withTransferSummary<
    T extends ProcessTask & { outgoingTransfers: { quantity: number }[] },
  >(task: T) {
    const transferredQuantity = task.outgoingTransfers.reduce(
      (sum, transfer) => sum + transfer.quantity,
      0,
    )
    return {
      ...task,
      transferredQuantity,
      availableToTransfer: task.completedQuantity - transferredQuantity,
    }
  }

  assign(id: number, dto: AssignTaskDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      const canAssign =
        task.status === 'UNSCHEDULED' ||
        (task.status === 'PENDING' && task.workstation?.type === 'BUFFER')
      if (!canAssign) throw new BadRequestException('当前任务状态不可分配')

      const target = await tx.workstation.findFirst({
        where: {
          id: dto.workstationId,
          processId: task.processId,
          enabled: true,
          type: { in: ['DEVICE', 'AREA'] },
        },
      })
      if (!target) throw new BadRequestException('目标工作位置不属于当前工序')

      const updated = await tx.processTask.update({
        where: { id },
        data: { workstationId: target.id, status: 'PENDING' },
      })
      await this.log(tx, userId, 'ASSIGN_TASK', id, {
        workstationId: target.id,
      })
      await this.flowState.recalculate(tx, task.batchId)
      return updated
    })
  }

  start(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (task.status !== 'PENDING') {
        throw new BadRequestException('只有待加工任务可以开始')
      }
      if (!task.workstation || task.workstation.type === 'BUFFER') {
        throw new BadRequestException('任务必须先分配到设备或加工区域')
      }

      const occupied = await tx.processTask.findFirst({
        where: {
          id: { not: id },
          workstationId: task.workstation.id,
          status: { in: ACTIVE_STATUSES },
        },
      })
      if (occupied) throw new ConflictException('该工作位置已有加工中的任务')

      const updated = await tx.processTask.update({
        where: { id },
        data: { status: 'PROCESSING', startedAt: new Date() },
      })
      await this.log(tx, userId, 'START_TASK', id)
      await this.flowState.recalculate(tx, task.batchId)
      return updated
    })
  }

  pause(id: number, userId: number) {
    return this.changeStatus(id, userId, 'PROCESSING', 'PAUSED', 'PAUSE_TASK')
  }

  resume(id: number, userId: number) {
    return this.changeStatus(id, userId, 'PAUSED', 'PROCESSING', 'RESUME_TASK')
  }

  private changeStatus(
    id: number,
    userId: number,
    from: string,
    to: string,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (task.status !== from) {
        throw new BadRequestException(`任务状态必须为 ${from}`)
      }
      const updated = await tx.processTask.update({
        where: { id },
        data: { status: to },
      })
      await this.log(tx, userId, action, id)
      await this.flowState.recalculate(tx, task.batchId)
      return updated
    })
  }

  updateCompleted(id: number, dto: UpdateCompletedDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (!ACTIVE_STATUSES.includes(task.status)) {
        throw new BadRequestException('只有加工中或暂停任务可以更新完成数量')
      }
      const transferred = task.outgoingTransfers.reduce(
        (sum, transfer) => sum + transfer.quantity,
        0,
      )
      if (
        dto.completedQuantity > task.plannedQuantity ||
        dto.completedQuantity < transferred
      ) {
        throw new BadRequestException(
          `完成数量必须在已转出数量 ${transferred} 与计划数量 ${task.plannedQuantity} 之间`,
        )
      }

      const updated = await tx.processTask.update({
        where: { id },
        data: { completedQuantity: dto.completedQuantity },
        include: { outgoingTransfers: { select: { quantity: true } } },
      })
      await this.log(tx, userId, 'UPDATE_COMPLETED', id, dto)
      return this.withTransferSummary(updated)
    })
  }

  complete(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (!ACTIVE_STATUSES.includes(task.status)) {
        throw new BadRequestException('只有加工中或暂停任务可以完成')
      }
      if (task.completedQuantity !== task.plannedQuantity) {
        throw new BadRequestException('完成数量必须等于计划数量')
      }

      const updated = await tx.processTask.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      await this.log(tx, userId, 'COMPLETE_TASK', id)
      await this.flowState.recalculate(tx, task.batchId)
      return updated
    })
  }

  async transfer(id: number, dto: TransferTaskDto, userId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.transfer.findUnique({
          where: { requestId: dto.requestId },
          include: { toTask: true },
        })
        if (existing) {
          if (
            existing.fromTaskId !== id ||
            existing.quantity !== dto.quantity ||
            existing.toTask.workstationId !== dto.targetWorkstationId
          ) {
            throw new ConflictException('requestId 已用于不同的转序请求')
          }
          return { ...existing, idempotent: true }
        }

        const task = await this.findTask(tx, id)
        if (!['PROCESSING', 'PAUSED', 'COMPLETED'].includes(task.status)) {
          throw new BadRequestException('当前任务状态不可转序')
        }
        const nextProcess = await tx.process.findFirst({
          where: { enabled: true, sort: { gt: task.process.sort } },
          orderBy: { sort: 'asc' },
        })
        if (!nextProcess) throw new BadRequestException('当前已是最后一道工序')

        const target = await tx.workstation.findFirst({
          where: {
            id: dto.targetWorkstationId,
            processId: nextProcess.id,
            enabled: true,
          },
        })
        if (!target) throw new BadRequestException('目标工作位置不属于下一工序')

        const transferred = task.outgoingTransfers.reduce(
          (sum, transfer) => sum + transfer.quantity,
          0,
        )
        const available = task.completedQuantity - transferred
        if (dto.quantity > available) {
          throw new BadRequestException(`当前最多可转 ${available}`)
        }

        const mergeTarget = await tx.processTask.findFirst({
          where: {
            batchId: task.batchId,
            processId: nextProcess.id,
            workstationId: target.id,
            status: { not: 'COMPLETED' },
          },
          orderBy: { createdAt: 'asc' },
        })
        const toTask = mergeTarget
          ? await tx.processTask.update({
              where: { id: mergeTarget.id },
              data: { plannedQuantity: { increment: dto.quantity } },
            })
          : await tx.processTask.create({
              data: {
                batchId: task.batchId,
                processId: nextProcess.id,
                workstationId: target.id,
                plannedQuantity: dto.quantity,
                status: 'PENDING',
              },
            })

        const transfer = await tx.transfer.create({
          data: {
            requestId: dto.requestId,
            batchId: task.batchId,
            fromTaskId: task.id,
            toTaskId: toTask.id,
            quantity: dto.quantity,
            operatorId: userId,
          },
        })
        await this.log(tx, userId, 'TRANSFER_TASK', id, {
          ...dto,
          nextProcessId: nextProcess.id,
          toTaskId: toTask.id,
        })
        await this.flowState.recalculate(tx, task.batchId)
        return { ...transfer, toTask, idempotent: false }
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('转序请求正在处理或已完成')
      }
      throw error
    }
  }
}
