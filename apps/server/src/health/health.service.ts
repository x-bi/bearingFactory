import { Injectable } from '@nestjs/common'

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now()

  getHealth() {
    return {
      status: 'ok' as const,
      service: 'bearing-factory-server',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    }
  }
}
