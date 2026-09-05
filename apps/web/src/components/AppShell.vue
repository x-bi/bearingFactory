<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{ title: string; back?: boolean }>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

function logout() {
  auth.logout()
  void router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <header class="shell-header">
      <button
        v-if="back"
        class="icon-button"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >
        ‹
      </button>
      <div v-else class="shell-mark" aria-hidden="true"><i /><i /></div>
      <div class="shell-title">
        <p>BEARING FLOW</p>
        <h1>{{ title }}</h1>
      </div>
      <button class="account-button" type="button" @click="logout">
        <span>{{ auth.user?.name ?? '管理员' }}</span>
        <small>退出</small>
      </button>
    </header>

    <main class="shell-content"><slot /></main>

    <nav class="bottom-nav" aria-label="主要导航">
      <RouterLink
        class="nav-item"
        :class="{ 'is-active': route.path === '/workshop' }"
        to="/workshop"
        >车间</RouterLink
      >
      <RouterLink
        class="nav-item"
        :class="{ 'is-active': route.path.startsWith('/orders') }"
        to="/orders"
        >生产单</RouterLink
      >
      <span class="nav-item is-disabled">我的</span>
    </nav>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgb(23 32 43 / 3%) 1px, transparent 1px) 0 0 / 24px
      24px,
    var(--color-bg-primary);
}
.shell-header {
  position: sticky;
  z-index: 9;
  top: 0;
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 12px;
  align-items: center;
  min-height: 68px;
  padding: max(12px, env(safe-area-inset-top)) 16px 10px;
  border-bottom: 1px solid var(--color-border);
  background: rgb(255 255 255 / 96%);
  backdrop-filter: blur(12px);
}
.shell-mark {
  position: relative;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-bg-inverse);
}
.shell-mark::before,
.shell-mark i {
  position: absolute;
  top: 15px;
  left: 9px;
  width: 18px;
  height: 5px;
  border: 2px solid white;
  border-radius: 50%;
  content: '';
}
.shell-mark::before {
  transform: rotate(90deg);
}
.shell-mark i:first-child {
  transform: translateY(-7px);
}
.shell-mark i:last-child {
  transform: translateY(7px);
}
.shell-title p,
.shell-title h1 {
  margin: 0;
}
.shell-title p {
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.18em;
}
.shell-title h1 {
  margin-top: 2px;
  font-size: 19px;
  line-height: 1.2;
}
.icon-button {
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: white;
  font-size: 28px;
  line-height: 1;
}
.account-button {
  padding: 4px 0 4px 12px;
  border: 0;
  background: transparent;
  text-align: right;
}
.account-button span,
.account-button small {
  display: block;
}
.account-button span {
  max-width: 72px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-button small {
  margin-top: 2px;
  color: var(--color-brand);
  font-size: 10px;
}
.shell-content {
  width: min(100%, var(--content-max-width));
  min-height: calc(100vh - 68px);
  margin: 0 auto;
  padding: 16px 16px calc(92px + var(--safe-bottom));
}
.bottom-nav {
  position: fixed;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  min-height: 62px;
  padding-bottom: var(--safe-bottom);
  border-top: 1px solid var(--color-border);
  background: rgb(255 255 255 / 97%);
  box-shadow: 0 -8px 24px rgb(23 32 43 / 6%);
}
.nav-item {
  position: relative;
  display: grid;
  place-items: center;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 700;
  text-decoration: none;
}
.nav-item.is-active {
  color: var(--color-brand);
}
.nav-item.is-active::before {
  position: absolute;
  top: 0;
  width: 42px;
  height: 3px;
  background: currentColor;
  content: '';
}
.nav-item.is-disabled {
  opacity: 0.55;
}
</style>
