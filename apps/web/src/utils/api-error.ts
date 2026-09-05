import axios from 'axios'

export function getApiErrorMessage(error: unknown, fallback = '操作失败') {
  if (!axios.isAxiosError(error)) return fallback
  const message = error.response?.data?.message
  return Array.isArray(message) ? message.join('；') : (message ?? fallback)
}
