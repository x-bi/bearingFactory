import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FlowStateService } from '../flow/flow-state.service'

@Injectable()
export class WorkstationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowState: FlowStateService,
  ) {}

  private summarizeTask<
    T extends {
      plannedQuantity: number
      completedQuantity: number
      scrappedQuantity: number
      outgoingTransfers: Array<{ quantity: number; kind: string }>
    },
  >(task: T) {
    const transferredQuantity = task.outgoingTransfers
      .filter((item) => item.kind === 'NEXT_PROCESS')
      .reduce((sum, item) => sum + item.quantity, 0)
    const assignedOutQuantity = task.outgoingTransfers
      .filter((item) =>
        ['ASSIGN', 'REASSIGN', 'TO_SURPLUS'].includes(item.kind),
      )
      .reduce((sum, item) => sum + item.quantity, 0)
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
  }

  async list(processCode?: string) {
    return this.prisma.workstation.findMany({
      where: {
        enabled: true,
        ...(processCode ? { process: { code: processCode } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        process: {
          select: {
            id: true,
            code: true,
            name: true,
            sort: true,
            executionMode: true,
          },
        },
      },
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
          station.tasks.find((task) => task.status === 'PROCESSING') ??
          station.tasks.find((task) => task.status === 'PAUSED') ??
          station.tasks[0]
        const displayStatus = activeTask
          ? await this.flowState.getDisplayStatus(activeTask)
          : 'EMPTY'

        const surplusQuantity =
          station.terminalKind === 'SURPLUS'
            ? ((
                await this.prisma.processTask.aggregate({
                  where: { workstationId: station.id },
                  _sum: { completedQuantity: true },
                })
              )._sum.completedQuantity ?? 0)
            : undefined

        return {
          id: station.id,
          code: station.code,
          name: station.name,
          type: station.type,
          terminalKind: station.terminalKind,
          process: station.process,
          x: station.x,
          y: station.y,
          width: station.width,
          height: station.height,
          sort: station.sort,
          displayStatus,
          surplusQuantity,
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
      include: { process: true },
    })
    if (!station) throw new NotFoundException('工作位置不存在')

    const stationTasks = await this.prisma.processTask.findMany({
      where: {
        workstationId: id,
        ...(station.terminalKind === 'SURPLUS'
          ? {}
          : { status: { not: 'COMPLETED' } }),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        process: true,
        batch: { include: { order: true } },
        outgoingTransfers: true,
      },
    })

    const tasks = await Promise.all(
      stationTasks.map(async (task) => {
        return {
          ...this.summarizeTask(task),
          displayStatus: await this.flowState.getDisplayStatus(task),
        }
      }),
    )
    const activeTask =
      tasks.find((task) => task.status === 'PROCESSING') ??
      tasks.find((task) => task.status === 'PAUSED') ??
      tasks[0]
    return {
      ...station,
      displayStatus: activeTask?.displayStatus ?? 'EMPTY',
      tasks,
    }
  }
}
