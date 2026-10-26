import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProductionOrderDto } from './dto/create-production-order.dto'
import { ListProductionOrdersDto } from './dto/list-production-orders.dto'

@Injectable()
export class ProductionOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductionOrdersDto) {
    const where: Prisma.ProductionOrderWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { orderNo: { contains: query.keyword } },
              { model: { contains: query.keyword } },
              { customer: { contains: query.keyword } },
              {
                batches: {
                  some: {
                    deletedAt: null,
                    batchNo: { contains: query.keyword },
                  },
                },
              },
            ],
          }
        : {}),
    }
    return this.prisma.$transaction(async (tx) => {
      const rankedOrders = await tx.productionOrder.findMany({
        where,
        select: {
          id: true,
          status: true,
          dueDate: true,
          createdAt: true,
        },
      })
      rankedOrders.sort((left, right) => {
        const completedOrder =
          Number(left.status === 'COMPLETED') -
          Number(right.status === 'COMPLETED')
        if (completedOrder !== 0) return completedOrder

        const leftDueDate = left.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
        const rightDueDate =
          right.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
        if (leftDueDate !== rightDueDate) return leftDueDate - rightDueDate

        const createdOrder =
          left.createdAt.getTime() - right.createdAt.getTime()
        return createdOrder !== 0 ? createdOrder : left.id - right.id
      })

      const pageIds = rankedOrders
        .slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
        .map((item) => item.id)
      const unorderedItems = await tx.productionOrder.findMany({
        where: { id: { in: pageIds }, deletedAt: null },
        include: {
          batches: {
            where: { deletedAt: null },
            include: {
              tasks: {
                where: { deletedAt: null },
                include: { process: true },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      })
      const itemsById = new Map(unorderedItems.map((item) => [item.id, item]))
      const items = pageIds.flatMap((id) => {
        const item = itemsById.get(id)
        return item ? [item] : []
      })

      return {
        items,
        total: rankedOrders.length,
        page: query.page,
        pageSize: query.pageSize,
      }
    })
  }

  async create(dto: CreateProductionOrderDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const process = await tx.process.findFirst({
        where: { id: dto.startProcessId, enabled: true },
      })
      if (!process) throw new BadRequestException('起始工序无效')

      const processBuffer = await tx.workstation.findFirst({
        where: {
          processId: process.id,
          enabled: true,
          type: 'BUFFER',
        },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      })
      let workstation = processBuffer
      if (dto.startWorkstationId) {
        workstation = await tx.workstation.findFirst({
          where: {
            id: dto.startWorkstationId,
            processId: process.id,
            enabled: true,
          },
        })
        if (!workstation) throw new BadRequestException('起始工作位置无效')
        if (processBuffer && workstation.type !== 'BUFFER') {
          throw new BadRequestException('起始工序必须先进入待加工区')
        }
      }

      const today = new Date()
      const datePart = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('')
      const todayCount = await tx.productionOrder.count({
        where: { orderNo: { startsWith: `PO${datePart}` } },
      })
      const orderNo = `PO${datePart}${String(todayCount + 1).padStart(4, '0')}`
      const initialStatus = workstation ? 'PENDING' : 'UNSCHEDULED'

      const order = await tx.productionOrder.create({
        data: {
          orderNo,
          model: dto.model.trim(),
          customer: dto.customer.trim(),
          quantity: dto.quantity,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: initialStatus,
          remark: dto.remark?.trim() || null,
          createdById: userId,
          batches: {
            create: {
              batchNo: dto.batchNo.trim(),
              quantity: dto.quantity,
              status: initialStatus,
              startProcessId: process.id,
              tasks: {
                create: {
                  processId: process.id,
                  workstationId: workstation?.id,
                  plannedQuantity: dto.quantity,
                  status: initialStatus,
                },
              },
            },
          },
        },
        include: { batches: { include: { tasks: true } } },
      })
      await tx.operationLog.create({
        data: {
          userId,
          action: 'CREATE_ORDER',
          entityType: 'ProductionOrder',
          entityId: order.id,
          payload: JSON.stringify({ orderNo, batchNo: dto.batchNo }),
        },
      })
      return order
    })
  }

  async detail(id: number) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: { select: { id: true, name: true, username: true } },
        batches: {
          where: { deletedAt: null },
          include: {
            startProcess: true,
            tasks: {
              where: { deletedAt: null },
              orderBy: [{ process: { sort: 'asc' } }, { createdAt: 'asc' }],
              include: {
                process: true,
                workstation: true,
                outgoingTransfers: { where: { deletedAt: null } },
              },
            },
            transfers: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              include: {
                fromTask: { include: { process: true } },
                toTask: { include: { process: true, workstation: true } },
                operator: { select: { id: true, name: true } },
              },
            },
            scrapRecords: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              include: {
                process: true,
                workstation: true,
                operator: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    })
    if (!order) throw new NotFoundException('生产单不存在')

    return {
      ...order,
      batches: order.batches.map((batch) => {
        const tasks = batch.tasks.map((task) => {
          const transferredQuantity = task.outgoingTransfers
            .filter((transfer) => transfer.kind === 'NEXT_PROCESS')
            .reduce((sum, transfer) => sum + transfer.quantity, 0)
          const assignedOutQuantity = task.outgoingTransfers
            .filter((transfer) =>
              ['ASSIGN', 'REASSIGN', 'TO_SURPLUS'].includes(transfer.kind),
            )
            .reduce((sum, transfer) => sum + transfer.quantity, 0)
          return {
            ...task,
            transferredQuantity,
            assignedOutQuantity,
            availableToTransfer: task.completedQuantity - transferredQuantity,
            remainingToProcess:
              task.plannedQuantity -
              task.completedQuantity -
              task.scrappedQuantity -
              assignedOutQuantity,
          }
        })
        const shippedQuantity = tasks
          .filter(
            (task) =>
              task.workstation?.terminalKind === 'SHIPPED' &&
              task.status === 'COMPLETED',
          )
          .reduce((sum, task) => sum + task.completedQuantity, 0)
        const surplusQuantity = tasks
          .filter((task) => task.workstation?.terminalKind === 'SURPLUS')
          .reduce((sum, task) => sum + task.completedQuantity, 0)
        const scrappedQuantity = tasks.reduce(
          (sum, task) => sum + task.scrappedQuantity,
          0,
        )
        return {
          ...batch,
          tasks,
          quantitySummary: {
            shippedQuantity,
            surplusQuantity,
            scrappedQuantity,
            activeQuantity: Math.max(
              0,
              batch.quantity -
                shippedQuantity -
                surplusQuantity -
                scrappedQuantity,
            ),
          },
        }
      }),
    }
  }

  private async deletionSummary(tx: Prisma.TransactionClient, id: number) {
    const order = await tx.productionOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        batches: {
          where: { deletedAt: null },
          include: {
            tasks: {
              where: { deletedAt: null },
              select: {
                status: true,
                completedQuantity: true,
                scrappedQuantity: true,
                startedAt: true,
                processId: true,
              },
            },
            transfers: { where: { deletedAt: null }, select: { id: true } },
            scrapRecords: { where: { deletedAt: null }, select: { id: true } },
          },
        },
      },
    })
    if (!order) throw new NotFoundException('生产单不存在')
    const tasks = order.batches.flatMap((batch) => batch.tasks)
    const otherProcessTasks = order.batches.reduce(
      (sum, batch) => sum + batch.tasks.filter((task) => task.processId !== batch.startProcessId).length,
      0,
    )
    const progressedTasks = tasks.filter((task) =>
      Boolean(task.startedAt) || task.completedQuantity > 0 ||
      task.scrappedQuantity > 0 ||
      ['PROCESSING', 'PAUSED', 'COMPLETED'].includes(task.status),
    ).length
    const transferCount = order.batches.reduce((sum, batch) => sum + batch.transfers.length, 0)
    const scrapCount = order.batches.reduce((sum, batch) => sum + batch.scrapRecords.length, 0)
    return {
      orderNo: order.orderNo,
      batchCount: order.batches.length,
      taskCount: tasks.length,
      progressedTasks,
      otherProcessTasks,
      transferCount,
      scrapCount,
      requiresConfirmation:
        order.status !== 'PENDING' && order.status !== 'UNSCHEDULED' ||
        progressedTasks > 0 || otherProcessTasks > 0 || transferCount > 0 ||
        scrapCount > 0 || tasks.length > order.batches.length,
    }
  }

  previewDeletion(id: number) {
    return this.prisma.$transaction((tx) => this.deletionSummary(tx, id))
  }

  remove(id: number, confirmRisk: boolean, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const summary = await this.deletionSummary(tx, id)
      if (summary.requiresConfirmation && !confirmRisk) {
        throw new ConflictException('生产单已有加工或关联记录，请确认高危删除')
      }
      const deletedAt = new Date()
      const batch = { orderId: id, deletedAt: null }
      await tx.scrapRecord.updateMany({ where: { batch, deletedAt: null }, data: { deletedAt } })
      await tx.transfer.updateMany({ where: { batch, deletedAt: null }, data: { deletedAt } })
      await tx.processTask.updateMany({ where: { batch, deletedAt: null }, data: { deletedAt } })
      await tx.batch.updateMany({ where: { orderId: id, deletedAt: null }, data: { deletedAt } })
      await tx.productionOrder.update({ where: { id }, data: { deletedAt } })
      await tx.operationLog.create({ data: {
        userId, action: 'DELETE_ORDER', entityType: 'ProductionOrder', entityId: id,
        payload: JSON.stringify(summary),
      } })
      return { id, deleted: true }
    })
  }
}
