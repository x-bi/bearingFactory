import type { Request } from 'express'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: string
}

export type AuthenticatedRequest = Request & { user: AuthUser }
