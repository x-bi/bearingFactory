import { http } from './http'

export interface ProcessItem {
  id: number
  code: string
  name: string
  sort: number
  executionMode: 'MACHINE' | 'AREA'
}

export interface WorkstationItem {
  id: number
  code: string
  name: string
  type: 'DEVICE' | 'AREA' | 'BUFFER'
  terminalKind: 'SHIPPED' | 'SURPLUS' | null
  processId: number | null
  process: ProcessItem | null
  x: number
  y: number
  width: number | null
  height: number | null
  sort: number
  displayStatus?: string
  surplusQuantity?: number
  activeTask?: {
    id: number
    orderId: number
    status: string
    model: string
    customer: string
    batchNo: string
  } | null
}

export interface WorkstationDetail extends WorkstationItem {
  enabled: boolean
  tasks: Array<{
    id: number
    processId: number
    status: string
    plannedQuantity: number
    completedQuantity: number
    scrappedQuantity: number
    assignedOutQuantity: number
    remainingToProcess: number
    transferredQuantity: number
    availableToTransfer: number
    displayStatus: string
    process: ProcessItem
    batch: {
      id: number
      batchNo: string
      order: {
        id: number
        orderNo: string
        model: string
        customer: string
      }
    }
  }>
}

export interface ProcessTaskItem {
  id: number
  batchId: number
  processId: number
  workstationId: number | null
  plannedQuantity: number
  completedQuantity: number
  scrappedQuantity: number
  assignedOutQuantity: number
  remainingToProcess: number
  transferredQuantity: number
  availableToTransfer: number
  status: string
  process: ProcessItem
  workstation: WorkstationItem | null
}

export interface ProductionOrderItem {
  id: number
  orderNo: string
  model: string
  customer: string
  quantity: number
  dueDate: string | null
  status: string
  remark: string | null
  batches: Array<{
    id: number
    batchNo: string
    quantity: number
    status: string
    startProcess: ProcessItem
    tasks: ProcessTaskItem[]
    transfers?: Array<{
      id: number
      quantity: number
      kind: 'NEXT_PROCESS' | 'ASSIGN' | 'REASSIGN' | 'TO_SURPLUS'
      remark: string | null
      createdAt: string
      fromTask: { process: ProcessItem }
      toTask: { process: ProcessItem; workstation: WorkstationItem | null }
      operator: { id: number; name: string }
    }>
    scrapRecords?: Array<{
      id: number
      quantity: number
      reason: string
      remark: string | null
      createdAt: string
      process: ProcessItem
      workstation: WorkstationItem | null
      operator: { id: number; name: string }
    }>
    quantitySummary?: {
      shippedQuantity: number
      surplusQuantity: number
      scrappedQuantity: number
      activeQuantity: number
    }
  }>
}

export interface CreateOrderPayload {
  model: string
  customer: string
  quantity: number
  batchNo: string
  dueDate?: string
  startProcessId: number
  startWorkstationId?: number
  remark?: string
}

export async function getProcesses() {
  return (await http.get<ProcessItem[]>('/processes')).data
}

export async function getWorkstations(processCode?: string) {
  return (
    await http.get<WorkstationItem[]>('/workstations', {
      params: processCode ? { processCode } : undefined,
    })
  ).data
}

export async function getWorkshopMap() {
  return (await http.get<WorkstationItem[]>('/workstations/map')).data
}

export async function getWorkstation(id: number) {
  return (await http.get<WorkstationDetail>(`/workstations/${id}`)).data
}

export async function getOrders(params?: Record<string, string | number>) {
  return (
    await http.get<{
      items: ProductionOrderItem[]
      total: number
      page: number
      pageSize: number
    }>('/production-orders', { params })
  ).data
}

export async function getOrder(id: number) {
  return (await http.get<ProductionOrderItem>(`/production-orders/${id}`)).data
}

export async function createOrder(payload: CreateOrderPayload) {
  return (await http.post<ProductionOrderItem>('/production-orders', payload))
    .data
}

export async function taskAction(
  taskId: number,
  action: 'start' | 'pause' | 'resume' | 'complete',
) {
  return (await http.post(`/process-tasks/${taskId}/${action}`)).data
}

export async function assignTask(
  taskId: number,
  payload: { requestId: string; workstationId: number; quantity: number },
) {
  return (await http.post(`/process-tasks/${taskId}/assign`, payload)).data
}

export async function reassignTask(
  taskId: number,
  payload: { requestId: string; targetWorkstationId: number; quantity: number },
) {
  return (await http.post(`/process-tasks/${taskId}/reassign`, payload)).data
}

export async function scrapTask(
  taskId: number,
  payload: {
    requestId: string
    quantity: number
    reason: string
    remark?: string
  },
) {
  return (await http.post(`/process-tasks/${taskId}/scrap`, payload)).data
}

export async function moveTaskToSurplus(
  taskId: number,
  payload: { requestId: string; quantity: number; remark?: string },
) {
  return (await http.post(`/process-tasks/${taskId}/to-surplus`, payload)).data
}

export async function updateCompleted(
  taskId: number,
  completedQuantity: number,
) {
  return (
    await http.post(`/process-tasks/${taskId}/update-completed`, {
      completedQuantity,
    })
  ).data
}

export async function transferTask(
  taskId: number,
  payload: {
    requestId: string
    quantity: number
    targetWorkstationId: number
  },
) {
  return (await http.post(`/process-tasks/${taskId}/transfer`, payload)).data
}

export interface SurplusItem {
  id: number
  taskId: number
  orderId: number
  orderNo: string
  model: string
  customer: string
  batchNo: string
  transferredQuantity: number
  currentQuantity: number
  scrappedQuantity: number
  remark: string | null
  transferredAt: string
  operator: { id: number; name: string }
}

export async function getSurplus(params?: Record<string, string | number>) {
  return (
    await http.get<{
      items: SurplusItem[]
      total: number
      page: number
      pageSize: number
      summaryQuantity: number
    }>('/surplus', { params })
  ).data
}

export interface MachineItem extends WorkstationItem {
  enabled: boolean
  sort: number
}

export async function getMachines() {
  return (await http.get<MachineItem[]>('/machines')).data
}

export async function createMachine(payload: {
  code: string
  name: string
  processId: number
}) {
  return (await http.post<MachineItem>('/machines', payload)).data
}

export async function updateMachine(
  id: number,
  payload: {
    name?: string
    enabled?: boolean
    sort?: number
  },
) {
  return (await http.patch<MachineItem>(`/machines/${id}`, payload)).data
}
