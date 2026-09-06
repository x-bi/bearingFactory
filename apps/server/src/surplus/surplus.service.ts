import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ListSurplusDto } from './dto/list-surplus.dto'

@Injectable()
export class SurplusService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSurplusDto) {
    const where: Prisma.TransferWhereInput = {
      kind: 'TO_SURPLUS',
      ...(query.keyword
        ? {
            batch: {
              is: {
                OR: [
                  { batchNo: { contains: query.keyword } },
                  { order: { orderNo: { contains: query.keyword } } },
                  { order: { model: { contains: query.keyword } } },
                ],
              },
            },
          }
        : {}),
    }
    const [records, total, aggregate] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          batch: { include: { order: true } },
          toTask: { include: { workstation: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.transfer.count({ where }),
      this.prisma.processTask.aggregate({
        where: {
          workstation: { terminalKind: 'SURPLUS' },
          incomingTransfers: { some: where },
        },
        _sum: { completedQuantity: true },
      }),
    ])

    return {
      items: records.map((record) => ({
        id: record.id,
        taskId: record.toTaskId,
        orderId: record.batch.orderId,
        orderNo: record.batch.order.orderNo,
        model: record.batch.order.model,
        customer: record.batch.order.customer,
        batchNo: record.batch.batchNo,
        transferredQuantity: record.quantity,
        currentQuantity: record.toTask.completedQuantity,
        scrappedQuantity: record.toTask.scrappedQuantity,
        remark: record.remark,
        transferredAt: record.createdAt,
        operator: record.operator,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      summaryQuantity: aggregate._sum.completedQuantity ?? 0,
    }
  }
}
