import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMe, login as loginRequest, type AuthUser } from '@/api/auth'

const TOKEN_KEY = 'bearing-factory-token'
const USER_KEY = 'bearing-factory-user'

function readUser() {
  try {
    return JSON.parse(
      localStorage.getItem(USER_KEY) ?? 'null',
    ) as AuthUser | null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')
  const user = ref<AuthUser | null>(readUser())
  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(username: string, password: string) {
    const result = await loginRequest(username, password)
    token.value = result.accessToken
    user.value = result.user
    localStorage.setItem(TOKEN_KEY, result.accessToken)
    localStorage.setItem(USER_KEY, JSON.stringify(result.user))
  }

  async function restore() {
    if (!token.value) return false
    try {
      user.value = await getMe()
      localStorage.setItem(USER_KEY, JSON.stringify(user.value))
      return true
    } catch {
      logout()
      return false
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLoggedIn, login, restore, logout }
})
