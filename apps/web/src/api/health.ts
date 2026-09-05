import { http } from './http'

export interface HealthResponse {
  status: 'ok'
  service: string
  timestamp: string
  uptimeSeconds: number
}

export async function getHealth() {
  const response = await http.get<HealthResponse>('/health')
  return response.data
}
