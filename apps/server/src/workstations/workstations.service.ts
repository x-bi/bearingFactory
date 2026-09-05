import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FlowStateService } from '../flow/flow-state.service'

@Injectable()
export class WorkstationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowState: FlowStateService,
  ) {}

  async list(processCode?: string) {
    return this.prisma.workstation.findMany({
      where: {
        enabled: true,
        ...(processCode ? { process: { code: processCode } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: { process: { select: { id: true, code: true, name: true } } },
    })
  }

  async map() {
    const stations = await this.prisma.workstation.findMany({
      where: { enabled: true, layout: { isActive: true } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        process: true,
        tasks: {
          where: { status: { in: ['PROCESSING', 'PAUSED', 'PENDING'] } },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          include: {
            process: true,
            batch: { include: { order: true } },
          },
        },
      },
    })

    return Promise.all(
      stations.map(async (station) => {
        const activeTask =
          station.tasks.find((task) =>
            ['PROCESSING', 'PAUSED'].includes(task.status),
          ) ?? station.tasks[0]
        const displayStatus = activeTask
          ? await this.flowState.getDisplayStatus(activeTask)
          : 'EMPTY'

        return {
          id: station.id,
          code: station.code,
          name: station.name,
          type: station.type,
          process: station.process,
          x: station.x,
          y: station.y,
          width: station.width,
          height: station.height,
          displayStatus,
          activeTask: activeTask
            ? {
                id: activeTask.id,
                orderId: activeTask.batch.order.id,
                status: activeTask.status,
                model: activeTask.batch.order.model,
                customer: activeTask.batch.order.customer,
                batchNo: activeTask.batch.batchNo,
              }
            : null,
        }
      }),
    )
  }

  async detail(id: number) {
    const station = await this.prisma.workstation.findUnique({
      where: { id },
      include: {
        process: true,
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          include: {
            process: true,
            batch: { include: { order: true } },
            outgoingTransfers: { select: { quantity: true } },
          },
        },
      },
    })
    if (!station) throw new NotFoundException('工作位置不存在')

    const tasks = await Promise.all(
      station.tasks.map(async (task) => ({
        ...task,
        transferredQuantity: task.outgoingTransfers.reduce(
          (sum, transfer) => sum + transfer.quantity,
          0,
        ),
        displayStatus: await this.flowState.getDisplayStatus(task),
      })),
    )
    const activeTask =
      tasks.find((task) => ['PROCESSING', 'PAUSED'].includes(task.status)) ??
      tasks[0]
    return {
      ...station,
      displayStatus: activeTask?.displayStatus ?? 'EMPTY',
      tasks,
    }
  }
}
