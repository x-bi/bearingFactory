import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FlowStateService } from '../flow/flow-state.service'
import { PrismaService } from '../prisma/prisma.service'
import { AssignTaskDto } from './dto/assign-task.dto'
import { ReassignTaskDto } from './dto/reassign-task.dto'
import { ScrapTaskDto } from './dto/scrap-task.dto'
import { ToSurplusDto } from './dto/to-surplus.dto'
import { TransferTaskDto } from './dto/transfer-task.dto'
import { UpdateCompletedDto } from './dto/update-completed.dto'

const ACTIVE_STATUSES = ['PROCESSING', 'PAUSED']
const ProcessExecutionMode = { MACHINE: 'MACHINE', AREA: 'AREA' } as const
const TerminalKind = { SHIPPED: 'SHIPPED', SURPLUS: 'SURPLUS' } as const
const TransferKind = {
  NEXT_PROCESS: 'NEXT_PROCESS',
  ASSIGN: 'ASSIGN',
  REASSIGN: 'REASSIGN',
  TO_SURPLUS: 'TO_SURPLUS',
} as const
const ALLOCATION_KINDS: string[] = [
  TransferKind.ASSIGN,
  TransferKind.REASSIGN,
  TransferKind.TO_SURPLUS,
]

type TaskForSummary = {
  plannedQuantity: number
  completedQuantity: number
  scrappedQuantity: number
  outgoingTransfers: Array<{ quantity: number; kind: string }>
}

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

  private summarizeTask<T extends TaskForSummary>(task: T) {
    const transferredQuantity = task.outgoingTransfers
      .filter((item) => item.kind === TransferKind.NEXT_PROCESS)
      .reduce((sum, item) => sum + item.quantity, 0)
    const assignedOutQuantity = task.outgoingTransfers
      .filter((item) => ALLOCATION_KINDS.includes(item.kind))
      .reduce((sum, item) => sum + item.quantity, 0)

    return {
      transferredQuantity,
      assignedOutQuantity,
      availableToTransfer: task.completedQuantity - transferredQuantity,
      remainingToProcess:
        task.plannedQuantity -
        task.completedQuantity -
        task.scrappedQuantity -
        assignedOutQuantity,
    }
  }

  private withTaskSummary<T extends TaskForSummary>(task: T) {
    return { ...task, ...this.summarizeTask(task) }
  }

  private async closeIfExhausted(tx: Prisma.TransactionClient, taskId: number) {
    const task = await this.findTask(tx, taskId)
    if (
      task.status !== 'COMPLETED' &&
      this.summarizeTask(task).remainingToProcess === 0
    ) {
      await tx.processTask.update({
        where: { id: taskId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
    }
  }

  private async ensureWorkstationAvailable(
    tx: Prisma.TransactionClient,
    taskId: number,
    workstationId: number,
  ) {
    const workstation = await tx.workstation.findUnique({
      where: { id: workstationId },
      select: { type: true },
    })
    if (workstation?.type !== 'DEVICE') return

    const occupied = await tx.processTask.findFirst({
      where: {
        id: { not: taskId },
        workstationId,
        status: 'PROCESSING',
      },
    })
    if (occupied)
      throw new ConflictException('该机器已有加工中的生产单，请先暂停')
  }

  private async upsertTargetTask(
    tx: Prisma.TransactionClient,
    source: Awaited<ReturnType<ProcessTasksService['findTask']>>,
    workstationId: number,
    quantity: number,
  ) {
    const mergeTarget = await tx.processTask.findFirst({
      where: {
        batchId: source.batchId,
        processId: source.processId,
        workstationId,
        status: { not: 'COMPLETED' },
      },
      orderBy: { createdAt: 'asc' },
    })
    return mergeTarget
      ? tx.processTask.update({
          where: { id: mergeTarget.id },
          data: { plannedQuantity: { increment: quantity } },
        })
      : tx.processTask.create({
          data: {
            batchId: source.batchId,
            processId: source.processId,
            workstationId,
            plannedQuantity: quantity,
            status: 'PENDING',
          },
        })
  }

  async assign(id: number, dto: AssignTaskDto, userId: number) {
    return this.runMovement(dto.requestId, async (tx) => {
      const existing = await tx.transfer.findUnique({
        where: { requestId: dto.requestId },
        include: { toTask: true },
      })
      if (existing) {
        if (
          existing.kind !== TransferKind.ASSIGN ||
          existing.fromTaskId !== id ||
          existing.quantity !== dto.quantity ||
          existing.toTask.workstationId !== dto.workstationId
        ) {
          throw new ConflictException('requestId 已用于不同的派单请求')
        }
        return { ...existing, idempotent: true }
      }

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
      if (!target || target.terminalKind === TerminalKind.SURPLUS) {
        throw new BadRequestException('目标工作位置不属于当前工序')
      }
      if (
        task.process.executionMode === ProcessExecutionMode.MACHINE &&
        target.type !== 'DEVICE'
      ) {
        throw new BadRequestException('机器工序必须分配到具体机器')
      }
      if (
        task.process.executionMode === ProcessExecutionMode.AREA &&
        target.type !== 'AREA'
      ) {
        throw new BadRequestException('区域工序必须分配到加工区域')
      }

      const available = this.summarizeTask(task).remainingToProcess
      if (dto.quantity > available) {
        throw new BadRequestException(`当前最多可分配 ${available}`)
      }

      const toTask = await this.upsertTargetTask(
        tx,
        task,
        target.id,
        dto.quantity,
      )
      const transfer = await tx.transfer.create({
        data: {
          requestId: dto.requestId,
          batchId: task.batchId,
          fromTaskId: task.id,
          toTaskId: toTask.id,
          quantity: dto.quantity,
          kind: TransferKind.ASSIGN,
          operatorId: userId,
        },
      })
      await this.closeIfExhausted(tx, task.id)
      await this.log(tx, userId, 'ASSIGN_TASK', id, dto)
      await this.flowState.recalculate(tx, task.batchId)
      return { ...transfer, toTask, idempotent: false }
    })
  }

  start(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (task.status !== 'PENDING') {
        throw new BadRequestException('只有待加工任务可以开始')
      }
      if (!task.workstation || task.workstation.type === 'BUFFER') {
        throw new BadRequestException('任务必须先分配到机器或加工区域')
      }
      await this.ensureWorkstationAvailable(tx, id, task.workstation.id)

      const updated = await tx.processTask.update({
        where: { id },
        data: { status: 'PROCESSING', startedAt: task.startedAt ?? new Date() },
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
      if (to === 'PROCESSING') {
        if (!task.workstation || task.workstation.type === 'BUFFER') {
          throw new BadRequestException('任务必须先分配到机器或加工区域')
        }
        await this.ensureWorkstationAvailable(tx, id, task.workstation.id)
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
      const summary = this.summarizeTask(task)
      const maximum =
        task.plannedQuantity -
        task.scrappedQuantity -
        summary.assignedOutQuantity
      if (
        dto.completedQuantity > maximum ||
        dto.completedQuantity < summary.transferredQuantity
      ) {
        throw new BadRequestException(
          `完成数量必须在已转出数量 ${summary.transferredQuantity} 与可完成数量 ${maximum} 之间`,
        )
      }

      const updated = await tx.processTask.update({
        where: { id },
        data: { completedQuantity: dto.completedQuantity },
        include: { outgoingTransfers: true },
      })
      await this.log(tx, userId, 'UPDATE_COMPLETED', id, dto)
      await this.flowState.recalculate(tx, task.batchId)
      return this.withTaskSummary(updated)
    })
  }

  complete(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.findTask(tx, id)
      if (!ACTIVE_STATUSES.includes(task.status)) {
        throw new BadRequestException('只有加工中或暂停任务可以完成')
      }
      if (this.summarizeTask(task).remainingToProcess !== 0) {
        throw new BadRequestException('任务仍有未完成、未报废或未改派的数量')
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

  async reassign(id: number, dto: ReassignTaskDto, userId: number) {
    return this.runMovement(dto.requestId, async (tx) => {
      const existing = await tx.transfer.findUnique({
        where: { requestId: dto.requestId },
        include: { toTask: true },
      })
      if (existing) {
        if (
          existing.kind !== TransferKind.REASSIGN ||
          existing.fromTaskId !== id ||
          existing.quantity !== dto.quantity ||
          existing.toTask.workstationId !== dto.targetWorkstationId
        ) {
          throw new ConflictException('requestId 已用于不同的改派请求')
        }
        return { ...existing, idempotent: true }
      }

      const task = await this.findTask(tx, id)
      if (task.status !== 'PAUSED' || task.workstation?.type !== 'DEVICE') {
        throw new BadRequestException('只有已暂停的机器任务可以改派')
      }
      const target = await tx.workstation.findFirst({
        where: {
          id: dto.targetWorkstationId,
          processId: task.processId,
          enabled: true,
          type: 'DEVICE',
        },
      })
      if (!target || target.id === task.workstationId) {
        throw new BadRequestException('请选择同工序的其他机器')
      }
      const available = this.summarizeTask(task).remainingToProcess
      if (dto.quantity > available) {
        throw new BadRequestException(`当前最多可改派 ${available}`)
      }

      const toTask = await this.upsertTargetTask(
        tx,
        task,
        target.id,
        dto.quantity,
      )
      const transfer = await tx.transfer.create({
        data: {
          requestId: dto.requestId,
          batchId: task.batchId,
          fromTaskId: task.id,
          toTaskId: toTask.id,
          quantity: dto.quantity,
          kind: TransferKind.REASSIGN,
          operatorId: userId,
        },
      })
      await this.closeIfExhausted(tx, task.id)
      await this.log(tx, userId, 'REASSIGN_TASK', id, dto)
      await this.flowState.recalculate(tx, task.batchId)
      return { ...transfer, toTask, idempotent: false }
    })
  }

  async scrap(id: number, dto: ScrapTaskDto, userId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.scrapRecord.findUnique({
          where: { requestId: dto.requestId },
        })
        if (existing) {
          if (existing.taskId !== id || existing.quantity !== dto.quantity) {
            throw new ConflictException('requestId 已用于不同的报废请求')
          }
          return { ...existing, idempotent: true }
        }

        const task = await this.findTask(tx, id)
        const surplusTask =
          task.workstation?.terminalKind === TerminalKind.SURPLUS
        const shippedTask =
          task.workstation?.terminalKind === TerminalKind.SHIPPED
        const summary = this.summarizeTask(task)
        if (task.status === 'COMPLETED' && shippedTask) {
          throw new BadRequestException('已完成任务不能再报废')
        }
        const available = surplusTask
          ? task.completedQuantity
          : summary.remainingToProcess + summary.availableToTransfer
        if (dto.quantity > available) {
          throw new BadRequestException(`当前最多可报废 ${available}`)
        }

        const completedToScrap = surplusTask
          ? dto.quantity
          : Math.max(0, dto.quantity - summary.remainingToProcess)

        await tx.processTask.update({
          where: { id },
          data: {
            ...(completedToScrap > 0
              ? { completedQuantity: { decrement: completedToScrap } }
              : {}),
            scrappedQuantity: { increment: dto.quantity },
          },
        })
        const record = await tx.scrapRecord.create({
          data: {
            requestId: dto.requestId,
            batchId: task.batchId,
            taskId: task.id,
            processId: task.processId,
            workstationId: task.workstationId,
            quantity: dto.quantity,
            reason: dto.reason.trim(),
            remark: dto.remark?.trim() || null,
            operatorId: userId,
          },
        })
        if (
          !surplusTask &&
          (task.workstation?.type === 'BUFFER' ||
            ['UNSCHEDULED', 'PENDING'].includes(task.status))
        ) {
          await this.closeIfExhausted(tx, task.id)
        }
        await this.log(tx, userId, 'SCRAP_TASK', id, dto)
        await this.flowState.recalculate(tx, task.batchId)
        return { ...record, idempotent: false }
      })
    } catch (error) {
      this.rethrowMovementConflict(error)
    }
  }

  async toSurplus(id: number, dto: ToSurplusDto, userId: number) {
    return this.runMovement(dto.requestId, async (tx) => {
      const existing = await tx.transfer.findUnique({
        where: { requestId: dto.requestId },
        include: { toTask: true },
      })
      if (existing) {
        if (
          existing.kind !== TransferKind.TO_SURPLUS ||
          existing.fromTaskId !== id ||
          existing.quantity !== dto.quantity
        ) {
          throw new ConflictException('requestId 已用于不同的转余品请求')
        }
        return { ...existing, idempotent: true }
      }

      const task = await this.findTask(tx, id)
      if (
        task.process.code !== 'SHIPPING' ||
        task.workstation?.type !== 'BUFFER' ||
        task.status !== 'PENDING'
      ) {
        throw new BadRequestException('只有待发货区的待处理数量可以转入余品区')
      }
      const available = this.summarizeTask(task).remainingToProcess
      if (dto.quantity > available) {
        throw new BadRequestException(`当前最多可转余品 ${available}`)
      }
      const surplusStation = await tx.workstation.findFirst({
        where: {
          processId: task.processId,
          terminalKind: TerminalKind.SURPLUS,
          enabled: true,
        },
      })
      if (!surplusStation) throw new BadRequestException('余品区尚未配置')

      const toTask = await tx.processTask.create({
        data: {
          batchId: task.batchId,
          processId: task.processId,
          workstationId: surplusStation.id,
          plannedQuantity: dto.quantity,
          completedQuantity: dto.quantity,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })
      const transfer = await tx.transfer.create({
        data: {
          requestId: dto.requestId,
          batchId: task.batchId,
          fromTaskId: task.id,
          toTaskId: toTask.id,
          quantity: dto.quantity,
          kind: TransferKind.TO_SURPLUS,
          remark: dto.remark?.trim() || null,
          operatorId: userId,
        },
      })
      await this.closeIfExhausted(tx, task.id)
      await this.log(tx, userId, 'MOVE_TO_SURPLUS', id, dto)
      await this.flowState.recalculate(tx, task.batchId)
      return { ...transfer, toTask, idempotent: false }
    })
  }

  async transfer(id: number, dto: TransferTaskDto, userId: number) {
    return this.runMovement(dto.requestId, async (tx) => {
      const existing = await tx.transfer.findUnique({
        where: { requestId: dto.requestId },
        include: { toTask: true },
      })
      if (existing) {
        if (
          existing.kind !== TransferKind.NEXT_PROCESS ||
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

      const nextProcessHasBuffer = await tx.workstation.count({
        where: { processId: nextProcess.id, enabled: true, type: 'BUFFER' },
      })
      const target = await tx.workstation.findFirst({
        where: {
          id: dto.targetWorkstationId,
          processId: nextProcess.id,
          enabled: true,
          ...(nextProcessHasBuffer > 0 ? { type: 'BUFFER' } : {}),
        },
      })
      if (!target) {
        throw new BadRequestException(
          nextProcessHasBuffer > 0
            ? '下一工序必须先转入待加工区'
            : '目标工作位置不属于下一工序',
        )
      }

      const available = this.summarizeTask(task).availableToTransfer
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
          kind: TransferKind.NEXT_PROCESS,
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
  }

  private async runMovement<T>(
    _requestId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(operation)
    } catch (error) {
      this.rethrowMovementConflict(error)
    }
  }

  private rethrowMovementConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('请求正在处理或已完成')
    }
    throw error
  }
}
