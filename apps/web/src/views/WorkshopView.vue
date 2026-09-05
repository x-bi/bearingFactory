<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { getWorkshopMap, type WorkstationItem } from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const stations = ref<WorkstationItem[]>([])
const loading = ref(true)
const errorMessage = ref('')
const zoom = ref(1)

const statusLabels: Record<string, string> = {
  EMPTY: '空闲',
  PENDING: '待加工',
  PROCESSING: '加工中',
  CROSS_PROCESSING: '跨工序',
  PAUSED: '暂停',
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    stations.value = await getWorkshopMap()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '车间状态加载失败')
  } finally {
    loading.value = false
  }
}

function changeZoom(step: number) {
  zoom.value = Math.min(2, Math.max(1, Number((zoom.value + step).toFixed(2))))
}

onMounted(load)
</script>

<template>
  <AppShell title="车间总览">
    <section class="dashboard-strip">
      <div>
        <p>PHASE 2</p>
        <h2>生产流转试运行</h2>
        <span>从建单到部分转序的第一条真实闭环</span>
      </div>
      <RouterLink to="/orders/new">+ 新建生产单</RouterLink>
    </section>

    <section class="legend" aria-label="状态图例">
      <span
        v-for="item in [
          'PENDING',
          'PROCESSING',
          'CROSS_PROCESSING',
          'PAUSED',
          'EMPTY',
        ]"
        :key="item"
        ><i :class="`is-${item.toLowerCase()}`" />{{ statusLabels[item] }}</span
      >
    </section>

    <section class="map-panel">
      <div class="panel-heading">
        <div>
          <p>WORKSHOP MAP</p>
          <h2>设备与区域</h2>
        </div>
        <div class="map-tools">
          <button
            type="button"
            :disabled="zoom <= 1"
            aria-label="缩小地图"
            @click="changeZoom(-0.25)"
          >
            −
          </button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button
            type="button"
            :disabled="zoom >= 2"
            aria-label="放大地图"
            @click="changeZoom(0.25)"
          >
            ＋
          </button>
          <button type="button" :disabled="loading" @click="load">
            {{ loading ? '加载中' : '刷新' }}
          </button>
        </div>
      </div>
      <p v-if="errorMessage" class="state-message is-error">
        {{ errorMessage }}
      </p>
      <div v-else class="map-viewport" aria-label="可缩放车间地图">
        <div
          class="workshop-map"
          aria-label="车间占位布局"
          :style="{ width: `${zoom * 100}%` }"
        >
          <RouterLink
            v-for="station in stations"
            :key="station.id"
            class="station"
            :class="`is-${station.displayStatus?.toLowerCase()}`"
            :style="{
              left: `${station.x}%`,
              top: `${station.y}%`,
              width: `${station.width ?? 11}%`,
              height: `${station.height ?? 11}%`,
            }"
            :to="`/workstations/${station.id}`"
          >
            <strong>{{ station.name }}</strong
            ><small>{{ statusLabels[station.displayStatus ?? 'EMPTY'] }}</small>
          </RouterLink>
          <div v-if="loading" class="map-loading">读取车间状态…</div>
        </div>
      </div>
      <p class="map-note">
        当前为可替换占位布局；真实车间图到位后仅校准坐标，不改变业务数据。
      </p>
    </section>
  </AppShell>
</template>

<style scoped>
.dashboard-strip {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 20px;
  border-radius: 8px;
  background: var(--color-bg-inverse);
  color: white;
  box-shadow: var(--shadow-float);
}
.dashboard-strip p,
.dashboard-strip h2,
.dashboard-strip span {
  margin: 0;
}
.dashboard-strip p,
.panel-heading p {
  color: #8fa2b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.dashboard-strip h2 {
  margin-top: 5px;
  font-size: 22px;
}
.dashboard-strip span {
  display: block;
  margin-top: 8px;
  color: #b9c4d0;
  font-size: 11px;
}
.dashboard-strip a {
  flex: 0 0 auto;
  padding: 11px 12px;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 14px 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-empty);
}
.is-pending {
  --state: var(--color-danger);
}
.is-processing {
  --state: var(--color-success);
}
.is-cross_processing {
  --state: var(--color-info);
}
.is-paused {
  --state: var(--color-warning);
}
.is-empty {
  --state: var(--color-empty);
}
.legend i {
  background: var(--state);
}
.map-panel {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: white;
  box-shadow: var(--shadow-card);
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}
.panel-heading p,
.panel-heading h2 {
  margin: 0;
}
.panel-heading p {
  color: var(--color-text-tertiary);
}
.panel-heading h2 {
  margin-top: 3px;
  font-size: 17px;
}
.panel-heading button {
  border: 0;
  background: transparent;
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 800;
}
.map-tools {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-tools span {
  min-width: 38px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
  text-align: center;
}
.map-tools button {
  min-width: 28px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: #f8fafb;
}
.map-tools button:last-child {
  min-width: 44px;
  border: 0;
  background: transparent;
}
.map-tools button:disabled {
  opacity: 0.45;
}
.map-viewport {
  aspect-ratio: 10 / 7;
  margin: 14px;
  overflow: auto;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  overscroll-behavior: contain;
}
.workshop-map {
  position: relative;
  aspect-ratio: 10 / 7;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgb(23 32 43 / 5%) 1px, transparent 1px) 0 0/20px
      20px,
    linear-gradient(rgb(23 32 43 / 5%) 1px, transparent 1px) 0 0/20px 20px,
    #f8fafb;
}
.station {
  position: absolute;
  display: grid;
  min-width: 50px;
  min-height: 38px;
  place-content: center;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--state) 55%, white);
  border-left: 4px solid var(--state);
  border-radius: 3px;
  background: color-mix(in srgb, var(--state) 10%, white);
  color: var(--color-text-primary);
  text-align: center;
  text-decoration: none;
}
.station strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.station small {
  margin-top: 2px;
  color: var(--state);
  font-size: 8px;
  font-weight: 800;
}
.map-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.map-note {
  margin: 0;
  padding: 0 18px 16px;
  color: var(--color-text-tertiary);
  font-size: 10px;
  line-height: 1.6;
}
.state-message {
  margin: 16px;
  padding: 12px;
  font-size: 12px;
}
.state-message.is-error {
  border-left: 3px solid var(--color-danger);
  background: #fff5f5;
  color: #a92e2e;
}
@media (max-width: 420px) {
  .dashboard-strip {
    align-items: flex-start;
    flex-direction: column;
  }
  .dashboard-strip a {
    align-self: stretch;
    text-align: center;
  }
}
</style>
