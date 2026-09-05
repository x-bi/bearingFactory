import { HealthService } from './health.service'

describe('HealthService', () => {
  it('returns a stable service identity and a usable health payload', () => {
    const result = new HealthService().getHealth()

    expect(result.status).toBe('ok')
    expect(result.service).toBe('bearing-factory-server')
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false)
  })
})
