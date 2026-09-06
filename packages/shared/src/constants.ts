export const ProcessCode = {
  CASTING: 'CASTING',
  ROUGH_TURNING: 'ROUGH_TURNING',
  FINISH_TURNING: 'FINISH_TURNING',
  BORING: 'BORING',
  DEBURRING: 'DEBURRING',
  PACKAGING: 'PACKAGING',
  SHIPPING: 'SHIPPING',
} as const

export const WorkstationType = {
  DEVICE: 'DEVICE',
  AREA: 'AREA',
  BUFFER: 'BUFFER',
} as const

export const ProcessExecutionMode = {
  MACHINE: 'MACHINE',
  AREA: 'AREA',
} as const

export const TerminalKind = {
  SHIPPED: 'SHIPPED',
  SURPLUS: 'SURPLUS',
} as const

export const TransferKind = {
  NEXT_PROCESS: 'NEXT_PROCESS',
  ASSIGN: 'ASSIGN',
  REASSIGN: 'REASSIGN',
  TO_SURPLUS: 'TO_SURPLUS',
} as const

export const TaskStatus = {
  UNSCHEDULED: 'UNSCHEDULED',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const

export const DisplayStatus = {
  EMPTY: 'EMPTY',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  CROSS_PROCESSING: 'CROSS_PROCESSING',
  PAUSED: 'PAUSED',
} as const

export type ValueOf<T> = T[keyof T]
export type ProcessCodeValue = ValueOf<typeof ProcessCode>
export type WorkstationTypeValue = ValueOf<typeof WorkstationType>
export type ProcessExecutionModeValue = ValueOf<typeof ProcessExecutionMode>
export type TerminalKindValue = ValueOf<typeof TerminalKind>
export type TransferKindValue = ValueOf<typeof TransferKind>
export type TaskStatusValue = ValueOf<typeof TaskStatus>
export type DisplayStatusValue = ValueOf<typeof DisplayStatus>
