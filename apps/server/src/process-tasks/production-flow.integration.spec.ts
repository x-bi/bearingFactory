import { BadRequestException } from '@nestjs/common'
import { FlowStateService } from '../flow/flow-state.service'
import { PrismaService } from '../prisma/prisma.service'
import { ProductionOrdersService } from '../production-orders/production-orders.service'
import { WorkstationsService } from '../workstations/workstations.service'
import { ProcessTasksService } from './process-tasks.service'

describe('production flow integration', () => {
  const prisma = new PrismaService()
  const flowState = new FlowStateService(prisma)
  const orders = new ProductionOrdersService(prisma)
  const tasks = new ProcessTasksService(prisma, flowState)
  const workstations = new WorkstationsService(prisma, flowState)
  let adminId: number
  let roughProcessId: number
  let roughStationId: number
  let finishStationId: number

  beforeAll(async () => {
    await prisma.$connect()
    const [admin, rough, roughStation, finishStation] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'admin' } }),
      prisma.process.findUniqueOrThrow({ where: { code: 'ROUGH_TURNING' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_01' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'FINISH_01' } }),
    ])
    adminId = admin.id
    roughProcessId = rough.id
    roughStationId = roughStation.id
    finishStationId = finishStation.id
  })

  beforeEach(async () => {
    await prisma.operationLog.deleteMany()
    await prisma.transfer.deleteMany()
    await prisma.processTask.deleteMany()
    await prisma.batch.deleteMany()
    await prisma.productionOrder.deleteMany()
  })

  afterAll(() => prisma.$disconnect())

  it('supports partial transfer, idempotency and cross-process status', async () => {
    const order = await orders.create(
      {
        model: '6208',
        customer: '测试轴承厂',
        quantity: 2000,
        batchNo: 'FLOW-001',
        startProcessId: roughProcessId,
        startWorkstationId: roughStationId,
      },
      adminId,
    )
    const roughTaskId = order.batches[0].tasks[0].id

    await tasks.start(roughTaskId, adminId)
    await tasks.updateCompleted(
      roughTaskId,
      { completedQuantity: 1200 },
      adminId,
    )
    const request = {
      requestId: 'flow-test-request-001',
      quantity: 1200,
      targetWorkstationId: finishStationId,
    }
    const first = await tasks.transfer(roughTaskId, request, adminId)
    const repeated = await tasks.transfer(roughTaskId, request, adminId)

    expect(first.idempotent).toBe(false)
    expect(repeated.idempotent).toBe(true)
    expect(await prisma.transfer.count()).toBe(1)

    const finishTask = await prisma.processTask.findUniqueOrThrow({
      where: { id: first.toTask.id },
      include: { process: true },
    })
    expect(finishTask.plannedQuantity).toBe(1200)
    await tasks.start(finishTask.id, adminId)
    const startedFinishTask = await prisma.processTask.findUniqueOrThrow({
      where: { id: finishTask.id },
      include: { process: true },
    })
    expect(await flowState.getDisplayStatus(startedFinishTask)).toBe(
      'CROSS_PROCESSING',
    )
    const finishStation = await workstations.detail(finishStationId)
    expect(finishStation.displayStatus).toBe('CROSS_PROCESSING')

    await expect(
      tasks.transfer(
        roughTaskId,
        {
          requestId: 'flow-test-over-transfer',
          quantity: 1,
          targetWorkstationId: finishStationId,
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
