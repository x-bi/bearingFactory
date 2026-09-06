import { BadRequestException, ConflictException } from '@nestjs/common'
import { FlowStateService } from '../flow/flow-state.service'
import { MachinesService } from '../machines/machines.service'
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
  const machines = new MachinesService(prisma)
  let adminId: number
  let roughProcessId: number
  let roughBufferId: number
  let roughStationId: number
  let roughStation2Id: number
  let finishBufferId: number
  let finishStationId: number
  let packagingProcessId: number
  let packagingBufferId: number
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
      roughStation2,
      finishBuffer,
      finishStation,
      packaging,
      packagingBuffer,
      packagingStation,
      shippingBuffer,
      shippingStation,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { username: 'admin' } }),
      prisma.process.findUniqueOrThrow({ where: { code: 'ROUGH_TURNING' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_BUFFER' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_01' } }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'ROUGH_02' } }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'FINISH_BUFFER' },
      }),
      prisma.workstation.findUniqueOrThrow({ where: { code: 'FINISH_01' } }),
      prisma.process.findUniqueOrThrow({ where: { code: 'PACKAGING' } }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'PACKAGING_BUFFER' },
      }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'PACKAGING_AREA' },
      }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'SHIPPING_BUFFER' },
      }),
      prisma.workstation.findUniqueOrThrow({
        where: { code: 'SHIPPING_AREA' },
      }),
    ])
    adminId = admin.id
    roughProcessId = rough.id
    roughBufferId = roughBuffer.id
    roughStationId = roughStation.id
    roughStation2Id = roughStation2.id
    finishBufferId = finishBuffer.id
    finishStationId = finishStation.id
    packagingProcessId = packaging.id
    packagingBufferId = packagingBuffer.id
    packagingStationId = packagingStation.id
    shippingBufferId = shippingBuffer.id
    shippingStationId = shippingStation.id
  })

  beforeEach(async () => {
    await prisma.operationLog.deleteMany()
    await prisma.scrapRecord.deleteMany()
    await prisma.transfer.deleteMany()
    await prisma.processTask.deleteMany()
    await prisma.batch.deleteMany()
    await prisma.productionOrder.deleteMany()
    await prisma.workstation.deleteMany({
      where: { code: { startsWith: 'AUTO_MACHINE_' } },
    })
  })

  afterAll(async () => {
    await prisma.workstation.deleteMany({
      where: { code: { startsWith: 'AUTO_MACHINE_' } },
    })
    await prisma.$disconnect()
  })

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

    const roughAssignment = await tasks.assign(
      roughTaskId,
      {
        requestId: 'assign-rough-001',
        workstationId: roughStationId,
        quantity: 2000,
      },
      adminId,
    )
    const roughMachineTaskId = roughAssignment.toTask.id
    await tasks.start(roughMachineTaskId, adminId)
    await tasks.updateCompleted(
      roughMachineTaskId,
      { completedQuantity: 1200 },
      adminId,
    )
    const request = {
      requestId: 'flow-test-request-001',
      quantity: 1200,
      targetWorkstationId: finishBufferId,
    }
    const first = await tasks.transfer(roughMachineTaskId, request, adminId)
    const repeated = await tasks.transfer(roughMachineTaskId, request, adminId)

    expect(first.idempotent).toBe(false)
    expect(repeated.idempotent).toBe(true)
    expect(
      await prisma.transfer.count({ where: { kind: 'NEXT_PROCESS' } }),
    ).toBe(1)

    const finishTask = await prisma.processTask.findUniqueOrThrow({
      where: { id: first.toTask.id },
      include: { process: true },
    })
    expect(finishTask.plannedQuantity).toBe(1200)
    const finishAssignment = await tasks.assign(
      finishTask.id,
      {
        requestId: 'assign-finish-001',
        workstationId: finishStationId,
        quantity: 1200,
      },
      adminId,
    )
    const finishMachineTaskId = finishAssignment.toTask.id
    await tasks.start(finishMachineTaskId, adminId)
    const startedFinishTask = await prisma.processTask.findUniqueOrThrow({
      where: { id: finishMachineTaskId },
      include: { process: true },
    })
    expect(await flowState.getDisplayStatus(startedFinishTask)).toBe(
      'CROSS_PROCESSING',
    )
    await tasks.updateCompleted(
      finishMachineTaskId,
      { completedQuantity: 300 },
      adminId,
    )
    const finishStation = await workstations.detail(finishStationId)
    expect(finishStation.displayStatus).toBe('CROSS_PROCESSING')
    expect(finishStation.tasks[0].availableToTransfer).toBe(300)

    await expect(
      tasks.transfer(
        roughMachineTaskId,
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
        startWorkstationId: packagingBufferId,
      },
      adminId,
    )
    const packagingTaskId = order.batches[0].tasks[0].id
    const packagingAssignment = await tasks.assign(
      packagingTaskId,
      {
        requestId: 'assign-packaging-001',
        workstationId: packagingStationId,
        quantity: 1000,
      },
      adminId,
    )
    const packagingAreaTaskId = packagingAssignment.toTask.id

    await tasks.start(packagingAreaTaskId, adminId)
    await tasks.updateCompleted(
      packagingAreaTaskId,
      { completedQuantity: 400 },
      adminId,
    )
    const firstTransfer = await tasks.transfer(
      packagingAreaTaskId,
      {
        requestId: 'shipping-partial-001',
        quantity: 400,
        targetWorkstationId: shippingBufferId,
      },
      adminId,
    )
    const firstShippingAssignment = await tasks.assign(
      firstTransfer.toTask.id,
      {
        requestId: 'assign-shipping-001',
        workstationId: shippingStationId,
        quantity: 400,
      },
      adminId,
    )
    const firstShippingTaskId = firstShippingAssignment.toTask.id
    await tasks.start(firstShippingTaskId, adminId)
    await tasks.updateCompleted(
      firstShippingTaskId,
      { completedQuantity: 400 },
      adminId,
    )
    await tasks.complete(firstShippingTaskId, adminId)

    expect(
      (
        await prisma.productionOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).not.toBe('COMPLETED')

    await tasks.updateCompleted(
      packagingAreaTaskId,
      { completedQuantity: 1000 },
      adminId,
    )
    await tasks.complete(packagingAreaTaskId, adminId)
    const secondTransfer = await tasks.transfer(
      packagingAreaTaskId,
      {
        requestId: 'shipping-partial-002',
        quantity: 600,
        targetWorkstationId: shippingBufferId,
      },
      adminId,
    )
    const secondShippingAssignment = await tasks.assign(
      secondTransfer.toTask.id,
      {
        requestId: 'assign-shipping-002',
        workstationId: shippingStationId,
        quantity: 600,
      },
      adminId,
    )
    const secondShippingTaskId = secondShippingAssignment.toTask.id
    await tasks.start(secondShippingTaskId, adminId)
    await tasks.updateCompleted(
      secondShippingTaskId,
      { completedQuantity: 600 },
      adminId,
    )
    await flowState.recalculate(prisma, order.batches[0].id)
    expect(
      (
        await prisma.productionOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).not.toBe('COMPLETED')

    await tasks.complete(secondShippingTaskId, adminId)

    expect(
      (
        await prisma.productionOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).toBe('COMPLETED')
  })

  it('releases a workstation while paused and blocks conflicting resume', async () => {
    const createOrder = (model: string, batchNo: string) =>
      orders.create(
        {
          model,
          customer: '位置切换测试客户',
          quantity: 100,
          batchNo,
          startProcessId: roughProcessId,
          startWorkstationId: roughBufferId,
        },
        adminId,
      )

    const first = await createOrder('FIRST', 'SWITCH-001')
    const second = await createOrder('SECOND', 'SWITCH-002')
    const third = await createOrder('THIRD', 'SWITCH-003')
    const assign = (taskId: number, requestId: string) =>
      tasks.assign(
        taskId,
        { requestId, workstationId: roughStationId, quantity: 100 },
        adminId,
      )
    const firstTaskId = (
      await assign(first.batches[0].tasks[0].id, 'assign-switch-001')
    ).toTask.id
    const secondTaskId = (
      await assign(second.batches[0].tasks[0].id, 'assign-switch-002')
    ).toTask.id
    const thirdTaskId = (
      await assign(third.batches[0].tasks[0].id, 'assign-switch-003')
    ).toTask.id

    await tasks.start(firstTaskId, adminId)
    await tasks.pause(firstTaskId, adminId)
    await tasks.start(secondTaskId, adminId)

    await expect(tasks.resume(firstTaskId, adminId)).rejects.toBeInstanceOf(
      ConflictException,
    )
    await expect(tasks.start(thirdTaskId, adminId)).rejects.toBeInstanceOf(
      ConflictException,
    )

    const occupiedStation = await workstations.detail(roughStationId)
    expect(occupiedStation.displayStatus).toBe('PROCESSING')
    expect(
      occupiedStation.tasks.find((task) => task.id === firstTaskId)?.status,
    ).toBe('PAUSED')

    await tasks.pause(secondTaskId, adminId)
    await tasks.resume(firstTaskId, adminId)

    expect(
      (
        await prisma.processTask.findUniqueOrThrow({
          where: { id: firstTaskId },
        })
      ).status,
    ).toBe('PROCESSING')
    expect(
      (
        await prisma.processTask.findUniqueOrThrow({
          where: { id: secondTaskId },
        })
      ).status,
    ).toBe('PAUSED')
  })

  it('splits a buffer task across machines, appends the same order and reassigns a paused remainder', async () => {
    const order = await orders.create(
      {
        model: 'SPLIT',
        customer: '拆分派单客户',
        quantity: 100,
        batchNo: 'SPLIT-001',
        startProcessId: roughProcessId,
        startWorkstationId: roughBufferId,
      },
      adminId,
    )
    const bufferTaskId = order.batches[0].tasks[0].id
    const first = await tasks.assign(
      bufferTaskId,
      {
        requestId: 'split-assign-001',
        workstationId: roughStationId,
        quantity: 40,
      },
      adminId,
    )
    const second = await tasks.assign(
      bufferTaskId,
      {
        requestId: 'split-assign-002',
        workstationId: roughStation2Id,
        quantity: 30,
      },
      adminId,
    )
    const appended = await tasks.assign(
      bufferTaskId,
      {
        requestId: 'split-assign-003',
        workstationId: roughStationId,
        quantity: 20,
      },
      adminId,
    )

    expect(appended.toTask.id).toBe(first.toTask.id)
    expect(
      (await workstations.detail(roughBufferId)).tasks[0].remainingToProcess,
    ).toBe(10)
    expect(
      (
        await prisma.processTask.findUniqueOrThrow({
          where: { id: first.toTask.id },
        })
      ).plannedQuantity,
    ).toBe(60)

    await tasks.start(first.toTask.id, adminId)
    await tasks.updateCompleted(
      first.toTask.id,
      { completedQuantity: 20 },
      adminId,
    )
    await tasks.pause(first.toTask.id, adminId)
    const reassigned = await tasks.reassign(
      first.toTask.id,
      {
        requestId: 'split-reassign-001',
        targetWorkstationId: roughStation2Id,
        quantity: 30,
      },
      adminId,
    )

    expect(reassigned.toTask.id).toBe(second.toTask.id)
    expect(
      (
        await prisma.processTask.findUniqueOrThrow({
          where: { id: second.toTask.id },
        })
      ).plannedQuantity,
    ).toBe(60)
    expect(
      (await workstations.detail(roughStationId)).tasks[0].remainingToProcess,
    ).toBe(10)
  })

  it('allows multiple production orders to process in the same area', async () => {
    const casting = await prisma.process.findUniqueOrThrow({
      where: { code: 'CASTING' },
    })
    const castingArea = await prisma.workstation.findUniqueOrThrow({
      where: { code: 'CASTING_AREA' },
    })
    const create = (model: string, batchNo: string) =>
      orders.create(
        {
          model,
          customer: '区域并发客户',
          quantity: 10,
          batchNo,
          startProcessId: casting.id,
          startWorkstationId: castingArea.id,
        },
        adminId,
      )
    const first = await create('AREA-A', 'AREA-001')
    const second = await create('AREA-B', 'AREA-002')

    await tasks.start(first.batches[0].tasks[0].id, adminId)
    await tasks.start(second.batches[0].tasks[0].id, adminId)

    const detail = await workstations.detail(castingArea.id)
    expect(
      detail.tasks.filter((task) => task.status === 'PROCESSING'),
    ).toHaveLength(2)
  })

  it('completes an order with shipping, surplus and scrap while preserving surplus records', async () => {
    const shippingProcess = await prisma.process.findUniqueOrThrow({
      where: { code: 'SHIPPING' },
    })
    const order = await orders.create(
      {
        model: 'FINAL',
        customer: '最终归集客户',
        quantity: 100,
        batchNo: 'FINAL-001',
        startProcessId: shippingProcess.id,
        startWorkstationId: shippingBufferId,
      },
      adminId,
    )
    const bufferTaskId = order.batches[0].tasks[0].id
    const scrapRequest = {
      requestId: 'final-scrap-001',
      quantity: 10,
      reason: '待发货检查报废',
    }
    const firstScrap = await tasks.scrap(bufferTaskId, scrapRequest, adminId)
    const repeatedScrap = await tasks.scrap(bufferTaskId, scrapRequest, adminId)
    expect(firstScrap.idempotent).toBe(false)
    expect(repeatedScrap.idempotent).toBe(true)

    await expect(
      tasks.scrap(
        bufferTaskId,
        {
          requestId: 'final-scrap-overflow',
          quantity: 91,
          reason: '超量报废',
        },
        adminId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
    const surplus = await tasks.toSurplus(
      bufferTaskId,
      {
        requestId: 'final-surplus-001',
        quantity: 30,
        remark: '客户少发部分转余品',
      },
      adminId,
    )
    const repeatedSurplus = await tasks.toSurplus(
      bufferTaskId,
      {
        requestId: 'final-surplus-001',
        quantity: 30,
        remark: '客户少发部分转余品',
      },
      adminId,
    )
    expect(surplus.idempotent).toBe(false)
    expect(repeatedSurplus.idempotent).toBe(true)
    const shipping = await tasks.assign(
      bufferTaskId,
      {
        requestId: 'final-shipping-assign-001',
        workstationId: shippingStationId,
        quantity: 60,
      },
      adminId,
    )
    await tasks.start(shipping.toTask.id, adminId)
    await tasks.updateCompleted(
      shipping.toTask.id,
      { completedQuantity: 60 },
      adminId,
    )
    await tasks.complete(shipping.toTask.id, adminId)

    expect(
      (
        await prisma.productionOrder.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
    ).toBe('COMPLETED')
    expect(
      await prisma.transfer.count({
        where: { batchId: order.batches[0].id, kind: 'TO_SURPLUS' },
      }),
    ).toBe(1)

    await tasks.scrap(
      surplus.toTask.id,
      {
        requestId: 'final-surplus-scrap-001',
        quantity: 5,
        reason: '余品区复检报废',
      },
      adminId,
    )
    const detail = await orders.detail(order.id)
    expect(detail.status).toBe('COMPLETED')
    expect(detail.batches[0].quantitySummary).toEqual({
      shippedQuantity: 60,
      surplusQuantity: 25,
      scrappedQuantity: 15,
      activeQuantity: 0,
    })
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
          startWorkstationId: packagingBufferId,
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

  it('creates machines without manual layout coordinates', async () => {
    const first = await machines.create(
      {
        code: 'AUTO_MACHINE_01',
        name: '自动排布粗车3',
        processId: roughProcessId,
      },
      adminId,
    )
    const second = await machines.create(
      {
        code: 'AUTO_MACHINE_02',
        name: '自动排布粗车4',
        processId: roughProcessId,
      },
      adminId,
    )

    expect(first.x).toBe(0)
    expect(first.y).toBe(0)
    expect(second.sort).toBeGreaterThan(first.sort)
  })
})
