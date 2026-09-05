<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getHealth, type HealthResponse } from '@/api/health'

const health = ref<HealthResponse>()
const errorMessage = ref('')
const loading = ref(true)

const healthLabel = computed(() => {
  if (loading.value) return '正在检测'
  if (health.value) return '运行正常'
  return '连接异常'
})

const checkedAt = computed(() => {
  if (!health.value) return '--:--:--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(health.value.timestamp))
})

const uptimeLabel = computed(() => {
  const seconds = health.value?.uptimeSeconds ?? 0
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
})

async function checkHealth() {
  loading.value = true
  errorMessage.value = ''

  try {
    health.value = await getHealth()
  } catch {
    health.value = undefined
    errorMessage.value = '未连接到 API，请确认后端已在 3000 端口启动。'
  } finally {
    loading.value = false
  }
}

onMounted(checkHealth)
</script>

<template>
  <div class="app-shell">
    <main class="commissioning-page">
      <header class="topbar">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <div>
            <p>轴承生产流转</p>
            <span>BEARING FLOW</span>
          </div>
        </div>
        <div class="phase-plate">
          <span>建设阶段</span>
          <strong>01</strong>
        </div>
      </header>

      <section class="command-panel" aria-labelledby="page-title">
        <div class="command-panel__index" aria-hidden="true">01</div>
        <div class="command-panel__copy">
          <p class="technical-label">FOUNDATION / 基础工程</p>
          <h1 id="page-title">生产系统调试台</h1>
          <p>前后端工程骨架已就位，正在为第一条生产流转闭环准备运行环境。</p>
        </div>
        <div class="route-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      <section class="status-console" aria-live="polite" :aria-busy="loading">
        <div class="section-heading">
          <div>
            <p class="technical-label">SYSTEM HEARTBEAT</p>
            <h2>系统连接</h2>
          </div>
          <span
            class="status-chip"
            :class="{
              'status-chip--ok': health,
              'status-chip--loading': loading,
            }"
          >
            <i aria-hidden="true" />{{ healthLabel }}
          </span>
        </div>

        <dl class="health-grid">
          <div>
            <dt>API 服务</dt>
            <dd>{{ health?.service ?? '等待响应' }}</dd>
          </div>
          <div>
            <dt>持续运行</dt>
            <dd>{{ health ? uptimeLabel : '--' }}</dd>
          </div>
          <div>
            <dt>最近检测</dt>
            <dd>{{ checkedAt }}</dd>
          </div>
        </dl>

        <p v-if="errorMessage" class="error-strip">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8v5m0 3.5v.5M4.5 19h15L12 5 4.5 19Z" />
          </svg>
          {{ errorMessage }}
        </p>

        <button
          class="inspect-button"
          type="button"
          :disabled="loading"
          @click="checkHealth"
        >
          <span
            class="inspect-button__icon"
            :class="{ 'is-spinning': loading }"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6v5h-5M4 18v-5h5" />
              <path d="M18.5 9A7 7 0 0 0 6 7M5.5 15A7 7 0 0 0 18 17" />
            </svg>
          </span>
          {{ loading ? '正在检测系统' : '重新检测系统' }}
        </button>
      </section>

      <section class="readiness-section" aria-labelledby="readiness-title">
        <div class="section-heading section-heading--line">
          <div>
            <p class="technical-label">COMMISSIONING LIST</p>
            <h2 id="readiness-title">投运准备</h2>
          </div>
          <strong class="completion-count">3 / 4</strong>
        </div>

        <ul class="readiness-list">
          <li>
            <span class="item-index">01</span>
            <span class="item-copy"
              ><strong>移动端工程</strong
              ><small>Vue 3 · Vite · TypeScript</small></span
            >
            <span class="item-state item-state--done">已就绪</span>
          </li>
          <li>
            <span class="item-index">02</span>
            <span class="item-copy"
              ><strong>服务端工程</strong><small>NestJS · 参数校验</small></span
            >
            <span class="item-state item-state--done">已就绪</span>
          </li>
          <li>
            <span class="item-index">03</span>
            <span class="item-copy"
              ><strong>数据连接</strong><small>Prisma · SQLite</small></span
            >
            <span class="item-state item-state--done">已接入</span>
          </li>
          <li>
            <span class="item-index">04</span>
            <span class="item-copy"
              ><strong>生产流转模型</strong
              ><small>下一阶段建立业务数据</small></span
            >
            <span class="item-state">待开发</span>
          </li>
        </ul>
      </section>

      <section class="next-route" aria-labelledby="next-title">
        <div class="next-route__heading">
          <div>
            <p class="technical-label">NEXT ROUTE</p>
            <h2 id="next-title">下一条开发路径</h2>
          </div>
          <span>Phase 2</span>
        </div>
        <div class="process-rail" aria-label="创建生产单到转入下一工序">
          <span class="process-node is-active"><i>1</i><em>建单</em></span>
          <span class="process-node"><i>2</i><em>分配</em></span>
          <span class="process-node"><i>3</i><em>加工</em></span>
          <span class="process-node"><i>4</i><em>完成</em></span>
          <span class="process-node"><i>5</i><em>转序</em></span>
        </div>
        <p>优先完成一条可操作、可验证的真实生产闭环。</p>
      </section>
    </main>

    <nav class="bottom-nav" aria-label="主要导航">
      <div class="bottom-nav__inner">
        <a class="nav-item is-active" href="/workshop" aria-current="page">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20V9l5 3V8l5 3V5l6 4v11H4Z" />
            <path d="M8 20v-4h4v4" />
          </svg>
          <span>车间</span>
        </a>
        <button class="nav-item" type="button" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3h10l3 3v15H4V3h3Zm0 0v5h10V3" />
            <path d="M8 13h8m-8 4h5" />
          </svg>
          <span>生产单</span>
        </button>
        <button class="nav-item" type="button" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21a7 7 0 0 1 14 0" />
          </svg>
          <span>我的</span>
        </button>
      </div>
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

.commissioning-page {
  width: min(100%, var(--content-max-width));
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(var(--space-4) + env(safe-area-inset-top, 0px)) var(--space-4)
    calc(104px + var(--safe-bottom));
}

.topbar,
.brand-lockup,
.section-heading,
.phase-plate,
.next-route__heading {
  display: flex;
  align-items: center;
}

.topbar,
.section-heading,
.next-route__heading {
  justify-content: space-between;
}

.brand-lockup {
  gap: var(--space-3);
}

.brand-lockup p,
.brand-lockup span,
.technical-label,
h1,
h2,
.next-route p {
  margin: 0;
}

.brand-lockup p {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.brand-lockup span {
  display: block;
  margin-top: 2px;
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.brand-mark {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-bg-inverse);
}

.brand-mark::before,
.brand-mark i {
  position: absolute;
  width: 18px;
  height: 5px;
  border: 2px solid white;
  border-radius: 50%;
  content: '';
}

.brand-mark::before {
  transform: rotate(90deg);
}

.brand-mark i:first-child {
  transform: translateY(-7px);
}

.brand-mark i:last-child {
  transform: translateY(7px);
}

.phase-plate {
  min-height: 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
}

.phase-plate span {
  padding: 0 9px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 700;
}

.phase-plate strong {
  align-self: stretch;
  display: grid;
  min-width: 36px;
  place-items: center;
  background: var(--color-bg-inverse);
  color: white;
  font-size: 16px;
}

.command-panel {
  position: relative;
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: var(--space-4);
  overflow: hidden;
  margin-top: var(--space-5);
  padding: var(--space-6) var(--space-5) 58px;
  border-radius: var(--radius-md);
  background: var(--color-bg-inverse);
  color: white;
  box-shadow: var(--shadow-float);
}

.command-panel__index {
  color: #6f7d8d;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.technical-label {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.4;
}

.command-panel .technical-label {
  color: #8fa2b8;
}

.command-panel h1 {
  margin-top: 7px;
  font-size: clamp(25px, 7vw, 34px);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.command-panel__copy > p:last-child {
  max-width: 460px;
  margin: var(--space-3) 0 0;
  color: #b9c4d0;
  font-size: 13px;
  line-height: 1.75;
}

.route-mark {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: 30px;
  background: #212d3a;
}

.route-mark span {
  position: relative;
  border-right: 1px solid #3a4654;
}

.route-mark span::after {
  position: absolute;
  top: 12px;
  left: calc(50% - 3px);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #667585;
  content: '';
}

.route-mark span:first-child {
  background: var(--color-brand);
}

.route-mark span:first-child::after {
  background: white;
}

.status-console,
.readiness-section,
.next-route {
  margin-top: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  box-shadow: var(--shadow-card);
}

.status-console,
.next-route {
  padding: var(--space-5);
}

.section-heading {
  gap: var(--space-4);
}

.section-heading h2,
.next-route h2 {
  margin-top: 3px;
  font-size: 18px;
  line-height: 1.3;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  border: 1px solid #f2c6c6;
  border-radius: var(--radius-sm);
  background: #fff5f5;
  color: var(--color-danger);
  font-size: 11px;
  font-weight: 800;
}

.status-chip i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.status-chip--ok {
  border-color: #b9ddc9;
  background: #edf9f2;
  color: var(--color-success);
}

.status-chip--loading {
  border-color: #f4d8aa;
  background: #fff8ec;
  color: var(--color-warning);
}

.status-chip--loading i {
  animation: pulse 1s ease-in-out infinite;
}

.health-grid {
  display: grid;
  grid-template-columns: 1.45fr 0.8fr 0.8fr;
  margin: var(--space-5) 0;
  border-block: 1px solid var(--color-border);
}

.health-grid div {
  min-width: 0;
  padding: var(--space-3) var(--space-3);
  border-right: 1px solid var(--color-border);
}

.health-grid div:first-child {
  padding-left: 0;
}

.health-grid div:last-child {
  padding-right: 0;
  border-right: 0;
}

.health-grid dt {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
}

.health-grid dd {
  overflow: hidden;
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-strip {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: 10px 12px;
  border-left: 3px solid var(--color-danger);
  background: #fff5f5;
  color: #a92e2e;
  font-size: 12px;
  line-height: 1.55;
}

.error-strip svg,
.inspect-button svg,
.nav-item svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.error-strip svg {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
}

.inspect-button {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-brand);
  color: white;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition:
    background 160ms ease,
    transform 80ms ease;
}

.inspect-button:active:not(:disabled) {
  background: var(--color-brand-strong);
  transform: translateY(1px);
}

.inspect-button:focus-visible,
.nav-item:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-brand) 25%, transparent);
  outline-offset: 2px;
}

.inspect-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.inspect-button__icon,
.inspect-button__icon svg {
  display: block;
  width: 19px;
  height: 19px;
}

.inspect-button__icon.is-spinning {
  animation: spin 0.9s linear infinite;
}

.readiness-section {
  overflow: hidden;
}

.section-heading--line {
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.completion-count {
  color: var(--color-brand);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.readiness-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.readiness-list li {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: var(--space-3);
  align-items: center;
  min-height: 66px;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.readiness-list li:last-child {
  border-bottom: 0;
}

.item-index {
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.item-copy {
  min-width: 0;
}

.item-copy strong,
.item-copy small {
  display: block;
}

.item-copy strong {
  font-size: 14px;
}

.item-copy small {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-text-tertiary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-state {
  padding: 5px 7px;
  border-radius: var(--radius-sm);
  background: #fff4e6;
  color: var(--color-warning);
  font-size: 10px;
  font-weight: 800;
}

.item-state--done {
  background: #edf9f2;
  color: var(--color-success);
}

.next-route {
  margin-bottom: var(--space-4);
}

.next-route__heading > span {
  padding: 5px 8px;
  border: 1px solid #b9cff6;
  border-radius: var(--radius-sm);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: 10px;
  font-weight: 800;
}

.process-rail {
  position: relative;
  display: flex;
  justify-content: space-between;
  margin: var(--space-6) 0 var(--space-4);
}

.process-rail::before {
  position: absolute;
  top: 12px;
  right: 9%;
  left: 9%;
  height: 2px;
  background: var(--color-border);
  content: '';
}

.process-node {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 6px;
  justify-items: center;
}

.process-node i {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 2px solid var(--color-border-strong);
  border-radius: 50%;
  background: white;
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.process-node em {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}

.process-node.is-active i {
  border-color: var(--color-brand);
  background: var(--color-brand);
  color: white;
}

.process-node.is-active em {
  color: var(--color-brand);
}

.next-route > p {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.bottom-nav {
  position: fixed;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  border-top: 1px solid var(--color-border);
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 -8px 24px rgb(23 32 43 / 6%);
  backdrop-filter: blur(10px);
}

.bottom-nav__inner {
  display: grid;
  width: min(100%, var(--content-max-width));
  margin: 0 auto;
  grid-template-columns: repeat(3, 1fr);
  padding: 8px var(--space-3) calc(7px + var(--safe-bottom));
}

.nav-item {
  position: relative;
  display: grid;
  min-height: 52px;
  place-items: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 700;
  text-decoration: none;
}

.nav-item svg {
  width: 23px;
  height: 23px;
}

.nav-item.is-active {
  color: var(--color-brand);
}

.nav-item.is-active::before {
  position: absolute;
  top: -8px;
  width: 36px;
  height: 3px;
  background: var(--color-brand);
  content: '';
}

.nav-item:disabled {
  cursor: not-allowed;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

@media (min-width: 768px) {
  .commissioning-page {
    padding-top: 32px;
  }

  .command-panel {
    grid-template-columns: 64px 1fr;
    padding: 32px 32px 68px;
  }

  .status-console,
  .next-route {
    padding: var(--space-6);
  }

  .section-heading--line,
  .readiness-list li {
    padding-inline: var(--space-6);
  }
}

@media (max-width: 379px) {
  .health-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .health-grid div {
    padding: var(--space-3) 0;
  }

  .health-grid div:first-child {
    grid-column: 1 / -1;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .health-grid div:nth-child(2) {
    padding-right: var(--space-3);
  }

  .health-grid div:last-child {
    padding-left: var(--space-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-chip--loading i,
  .inspect-button__icon.is-spinning {
    animation: none;
  }
}
</style>
