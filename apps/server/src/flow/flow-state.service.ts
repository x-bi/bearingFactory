import { Injectable } from '@nestjs/common'
import { Prisma, type ProcessTask } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type DbClient = PrismaService | Prisma.TransactionClient

@Injectable()
export class FlowStateService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(client: DbClient, batchId: number) {
    const batch = await client.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { tasks: { include: { process: true } } },
    })

    const shippingTasks = batch.tasks.filter(
      (task) =>
        task.process.code === 'SHIPPING' && task.status === 'COMPLETED',
    )
    const shipped = shippingTasks.reduce(
      (sum, task) => sum + task.completedQuantity,
      0,
    )
    const taskStatuses = new Set(batch.tasks.map((task) => task.status))
    const status =
      shipped >= batch.quantity && shippingTasks.length > 0
        ? 'COMPLETED'
        : taskStatuses.has('PAUSED')
          ? 'PAUSED'
          : taskStatuses.has('PROCESSING')
            ? 'PROCESSING'
            : taskStatuses.has('PENDING')
              ? 'PENDING'
              : 'UNSCHEDULED'

    await client.batch.update({ where: { id: batchId }, data: { status } })

    const orderBatches = await client.batch.findMany({
      where: { orderId: batch.orderId },
      select: { status: true },
    })
    const orderStatuses = new Set(orderBatches.map((item) => item.status))
    const orderStatus = orderBatches.every(
      (item) => item.status === 'COMPLETED',
    )
      ? 'COMPLETED'
      : orderStatuses.has('PAUSED')
        ? 'PAUSED'
        : orderStatuses.has('PROCESSING')
          ? 'PROCESSING'
          : orderStatuses.has('PENDING')
            ? 'PENDING'
            : 'UNSCHEDULED'

    await client.productionOrder.update({
      where: { id: batch.orderId },
      data: { status: orderStatus },
    })
  }

  async getDisplayStatus(task: ProcessTask & { process: { sort: number } }) {
    if (task.status === 'PAUSED') return 'PAUSED'
    if (task.status !== 'PROCESSING') return task.status

    const batch = await this.prisma.batch.findUniqueOrThrow({
      where: { id: task.batchId },
      include: { startProcess: true },
    })
    const previous = await this.prisma.process.findFirst({
      where: {
        enabled: true,
        sort: { lt: task.process.sort, gte: batch.startProcess.sort },
      },
      orderBy: { sort: 'desc' },
    })
    if (!previous) return 'PROCESSING'

    const completed = await this.prisma.processTask.aggregate({
      where: { batchId: task.batchId, processId: previous.id },
      _sum: { completedQuantity: true },
    })
    return (completed._sum.completedQuantity ?? 0) < batch.quantity
      ? 'CROSS_PROCESSING'
      : 'PROCESSING'
  }
}
