<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getApiErrorMessage } from '@/utils/api-error'

const router = useRouter()
const auth = useAuthStore()
const form = reactive({ username: 'admin', password: 'admin123' })
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!form.username || !form.password || loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await auth.login(form.username, form.password)
    await router.replace('/workshop')
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-plate">
      <div class="bearing-mark" aria-hidden="true"><i /><i /></div>
      <p class="technical-label">BEARING FLOW / V0.1</p>
      <h1>轴承生产流转</h1>
      <p class="intro">面向车间现场的轻量生产调度与工序流转工具</p>

      <form @submit.prevent="submit">
        <label>
          <span>用户名</span>
          <input
            v-model.trim="form.username"
            autocomplete="username"
            maxlength="64"
            required
          />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            maxlength="128"
            required
          />
        </label>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <button type="submit" :disabled="loading">
          {{ loading ? '正在进入系统…' : '进入生产系统' }}
        </button>
      </form>
      <div class="dev-account">
        <span>试运行账号</span><strong>admin / admin123</strong>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px 16px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 4%) 1px, transparent 1px) 0 0 /
      28px 28px,
    var(--color-bg-inverse);
}
.login-plate {
  width: min(100%, 420px);
  padding: 30px 24px 24px;
  border-top: 4px solid var(--color-brand);
  border-radius: 4px 4px 12px 12px;
  background: white;
  box-shadow: 0 24px 70px rgb(0 0 0 / 28%);
}
.bearing-mark {
  position: relative;
  width: 52px;
  height: 52px;
  margin-bottom: 24px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-bg-inverse);
}
.bearing-mark::before,
.bearing-mark i {
  position: absolute;
  top: 21px;
  left: 13px;
  width: 22px;
  height: 6px;
  border: 2px solid white;
  border-radius: 50%;
  content: '';
}
.bearing-mark::before {
  transform: rotate(90deg);
}
.bearing-mark i:first-child {
  transform: translateY(-9px);
}
.bearing-mark i:last-child {
  transform: translateY(9px);
}
.technical-label {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
h1 {
  margin: 7px 0 8px;
  font-size: 28px;
}
.intro {
  margin: 0 0 28px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
form {
  display: grid;
  gap: 16px;
}
label span {
  display: block;
  margin-bottom: 7px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
input {
  width: 100%;
  height: 48px;
  padding: 0 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: #f9fafb;
  outline: none;
}
input:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-soft);
}
button {
  min-height: 50px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-weight: 800;
}
button:disabled {
  opacity: 0.65;
}
.error-message {
  margin: -4px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--color-danger);
  background: #fff5f5;
  color: #a92e2e;
  font-size: 12px;
}
.dev-account {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.dev-account strong {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}
</style>
