import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10_000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('bearing-factory-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bearing-factory-token')
      localStorage.removeItem('bearing-factory-user')
    }
    return Promise.reject(error)
  },
)
