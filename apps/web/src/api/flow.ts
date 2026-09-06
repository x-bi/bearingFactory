import { http } from './http'

export interface ProcessItem {
  id: number
  code: string
  name: string
  sort: number
}

export interface WorkstationItem {
  id: number
  code: string
  name: string
  type: 'DEVICE' | 'AREA' | 'BUFFER'
  processId: number | null
  process: ProcessItem | null
  x: number
  y: number
  width: number | null
  height: number | null
  displayStatus?: string
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
      createdAt: string
      fromTask: { process: ProcessItem }
      toTask: { process: ProcessItem; workstation: WorkstationItem | null }
      operator: { id: number; name: string }
    }>
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

export async function assignTask(taskId: number, workstationId: number) {
  return (await http.post(`/process-tasks/${taskId}/assign`, { workstationId }))
    .data
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
