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
  let roughBufferId: number
  let roughStationId: number
  let finishBufferId: number
  let finishStationId: number
  let packagingProcessId: number
  let packagingStationId: number
  let shippingBufferId: number
  let shippingStationId: number

  beforeAll(async () => {
    await prisma.$connect()
    const [
      admin,
      rough,
      roughBuffer,
      roughStation,
      finishBuffer,
      finishStation,
      packaging,
      packagingStation,
      shippingBuffer,
      shippingStation,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'admin' } }),
      prisma.process.findUniqueOrThrow({ where: { code: 'ROUGH_TURNING' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_BUFFER' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_01' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'FINISH_BUFFER' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'FINISH_01' } }),
      prisma.process.findUniqueOrThrow({ where: { code: 'PACKAGING' } }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'PACKAGING_AREA' },
      }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'SHIPPING_BUFFER' },
      }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'SHIPPING_AREA' } }),
    ])
    adminId = admin.id
    roughProcessId = rough.id
    roughBufferId = roughBuffer.id
    roughStationId = roughStation.id
    finishBufferId = finishBuffer.id
    finishStationId = finishStation.id
    packagingProcessId = packaging.id
    packagingStationId = packagingStation.id
    shippingBufferId = shippingBuffer.id
    shippingStationId = shippingStation.id
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
        startWorkstationId: roughBufferId,
      },
      adminId,
    )
    const roughTaskId = order.batches[0].tasks[0].id

    await tasks.assign(roughTaskId, { workstationId: roughStationId }, adminId)
    await tasks.start(roughTaskId, adminId)
    await tasks.updateCompleted(
      roughTaskId,
      { completedQuantity: 1200 },
      adminId,
    )
    const request = {
      requestId: 'flow-test-request-001',
      quantity: 1200,
      targetWorkstationId: finishBufferId,
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
    await tasks.assign(finishTask.id, { workstationId: finishStationId }, adminId)
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

  it('keeps an order open until every partial shipment is completed', async () => {
    const order = await orders.create(
      {
        model: '6310',
        customer: '分批发货客户',
        quantity: 1000,
        batchNo: 'SHIP-001',
        startProcessId: packagingProcessId,
        startWorkstationId: packagingStationId,
      },
      adminId,
    )
    const packagingTaskId = order.batches[0].tasks[0].id

    await tasks.start(packagingTaskId, adminId)
    await tasks.updateCompleted(
      packagingTaskId,
      { completedQuantity: 400 },
      adminId,
    )
    const firstTransfer = await tasks.transfer(
      packagingTaskId,
      {
        requestId: 'shipping-partial-001',
        quantity: 400,
        targetWorkstationId: shippingBufferId,
      },
      adminId,
    )
    await tasks.assign(
      firstTransfer.toTask.id,
      { workstationId: shippingStationId },
      adminId,
    )
    await tasks.start(firstTransfer.toTask.id, adminId)
    await tasks.updateCompleted(
      firstTransfer.toTask.id,
      { completedQuantity: 400 },
      adminId,
    )
    await tasks.complete(firstTransfer.toTask.id, adminId)

    expect(
      (await prisma.productionOrder.findUniqueOrThrow({
        where: { id: order.id },
      })).status,
    ).not.toBe('COMPLETED')

    await tasks.updateCompleted(
      packagingTaskId,
      { completedQuantity: 1000 },
      adminId,
    )
    await tasks.complete(packagingTaskId, adminId)
    const secondTransfer = await tasks.transfer(
      packagingTaskId,
      {
        requestId: 'shipping-partial-002',
        quantity: 600,
        targetWorkstationId: shippingBufferId,
      },
      adminId,
    )
    await tasks.assign(
      secondTransfer.toTask.id,
      { workstationId: shippingStationId },
      adminId,
    )
    await tasks.start(secondTransfer.toTask.id, adminId)
    await tasks.updateCompleted(
      secondTransfer.toTask.id,
      { completedQuantity: 600 },
      adminId,
    )
    await flowState.recalculate(prisma, order.batches[0].id)
    expect(
      (await prisma.productionOrder.findUniqueOrThrow({
        where: { id: order.id },
      })).status,
    ).not.toBe('COMPLETED')

    await tasks.complete(secondTransfer.toTask.id, adminId)

    expect(
      (await prisma.productionOrder.findUniqueOrThrow({
        where: { id: order.id },
      })).status,
    ).toBe('COMPLETED')
  })

  it('orders active production orders by due date and moves completed orders last', async () => {
    const createOrder = (model: string, batchNo: string, dueDate: string) =>
      orders.create(
        {
          model,
          customer: '排序测试客户',
          quantity: 100,
          batchNo,
          dueDate,
          startProcessId: packagingProcessId,
          startWorkstationId: packagingStationId,
        },
        adminId,
      )

    const later = await createOrder('LATER', 'SORT-001', '2026-09-20')
    const urgent = await createOrder('URGENT', 'SORT-002', '2026-09-10')
    const completed = await createOrder('DONE', 'SORT-003', '2026-09-01')
    await prisma.productionOrder.update({
      where: { id: completed.id },
      data: { status: 'COMPLETED' },
    })

    const result = await orders.list({ page: 1, pageSize: 20 })
    expect(result.items.map((item) => item.id)).toEqual([
      urgent.id,
      later.id,
      completed.id,
    ])
  })
})
