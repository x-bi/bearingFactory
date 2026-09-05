import { http } from './http'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export async function login(username: string, password: string) {
  const response = await http.post<LoginResponse>('/auth/login', {
    username,
    password,
  })
  return response.data
}

export async function getMe() {
  const response = await http.get<AuthUser>('/auth/me')
  return response.data
}
