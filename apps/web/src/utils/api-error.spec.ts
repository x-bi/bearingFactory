import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './api-error'

describe('getApiErrorMessage', () => {
  it('joins validation messages returned by the API', () => {
    const error = {
      isAxiosError: true,
      response: { data: { message: ['型号不能为空', '数量必须大于 0'] } },
    }

    expect(getApiErrorMessage(error)).toBe('型号不能为空；数量必须大于 0')
  })

  it('uses the supplied fallback for non-API errors', () => {
    expect(getApiErrorMessage(new Error('network'), '网络连接失败')).toBe(
      '网络连接失败',
    )
  })
})
