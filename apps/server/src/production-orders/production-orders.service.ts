import {
  BadRequestException,
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
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { orderNo: { contains: query.keyword } },
              { model: { contains: query.keyword } },
              { customer: { contains: query.keyword } },
              { batches: { some: { batchNo: { contains: query.keyword } } } },
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
        .slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        )
        .map((item) => item.id)
      const unorderedItems = await tx.productionOrder.findMany({
        where: { id: { in: pageIds } },
        include: {
          batches: {
            include: {
              tasks: {
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
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, username: true } },
        batches: {
          include: {
            startProcess: true,
            tasks: {
              orderBy: [{ process: { sort: 'asc' } }, { createdAt: 'asc' }],
              include: {
                process: true,
                workstation: true,
                outgoingTransfers: { select: { quantity: true } },
              },
            },
            transfers: {
              orderBy: { createdAt: 'desc' },
              include: {
                fromTask: { include: { process: true } },
                toTask: { include: { process: true, workstation: true } },
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
      batches: order.batches.map((batch) => ({
        ...batch,
        tasks: batch.tasks.map((task) => {
          const transferredQuantity = task.outgoingTransfers.reduce(
            (sum, transfer) => sum + transfer.quantity,
            0,
          )
          return {
            ...task,
            transferredQuantity,
            availableToTransfer: task.completedQuantity - transferredQuantity,
          }
        }),
      })),
    }
  }
}
