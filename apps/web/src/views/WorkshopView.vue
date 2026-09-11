<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { getWorkshopMap, type WorkstationItem } from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'
import {
  centeredScrollOffset,
  clampZoom,
  exceedsDragThreshold,
  parseStoredCanvasPosition,
  parseStoredZoom,
} from '@/utils/canvas-zoom'

const CANVAS_WIDTH = 1000
const MIN_ZOOM = 0.3
const MAX_ZOOM = 2
const ZOOM_STORAGE_KEY = 'bearing-factory:workshop-map:zoom'
const POSITION_STORAGE_KEY = 'bearing-factory:workshop-map:position'

function readStoredZoom() {
  try {
    return parseStoredZoom(
      window.localStorage.getItem(ZOOM_STORAGE_KEY),
      MIN_ZOOM,
      MAX_ZOOM,
    )
  } catch {
    return null
  }
}

function persistZoom(value: number) {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(value))
  } catch {
    // 浏览器禁用本地存储时仍保留本次页面内的缩放功能。
  }
}

function readStoredPosition() {
  try {
    return parseStoredCanvasPosition(
      window.localStorage.getItem(POSITION_STORAGE_KEY),
    )
  } catch {
    return null
  }
}

type ProcessGroup = {
  id: number
  code: string
  name: string
  sort: number
  bufferStations: WorkstationItem[]
  workStations: WorkstationItem[]
}

const stations = ref<WorkstationItem[]>([])
const loading = ref(true)
const errorMessage = ref('')
const storedZoom = readStoredZoom()
const storedPosition = readStoredPosition()
const zoom = ref(storedZoom ?? 1)
const dragging = ref(false)
const viewport = ref<HTMLElement>()
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let positionPersistTimer: ReturnType<typeof setTimeout> | undefined
let dragPointerId: number | undefined
let dragStartX = 0
let dragStartY = 0
let dragScrollLeft = 0
let dragScrollTop = 0
let suppressClickUntil = 0
let lastWindowWidth = 0

const processGroups = computed<ProcessGroup[]>(() => {
  const groups = new Map<number, ProcessGroup>()

  for (const station of stations.value) {
    if (!station.process) continue
    const group = groups.get(station.process.id) ?? {
      id: station.process.id,
      code: station.process.code,
      name: station.process.name,
      sort: station.process.sort,
      bufferStations: [],
      workStations: [],
    }
    if (station.type === 'BUFFER') group.bufferStations.push(station)
    else group.workStations.push(station)
    groups.set(group.id, group)
  }

  return [...groups.values()]
    .sort((left, right) => left.sort - right.sort)
    .map((group) => ({
      ...group,
      bufferStations: group.bufferStations.sort((a, b) => a.id - b.id),
      workStations: group.workStations.sort(
        (a, b) => a.sort - b.sort || a.id - b.id,
      ),
    }))
})

const maximumMachineCount = computed(() =>
  Math.max(
    0,
    ...processGroups.value
      .filter((group) =>
        ['ROUGH_TURNING', 'FINISH_TURNING', 'BORING'].includes(group.code),
      )
      .map((group) => group.workStations.length),
  ),
)

const machineColumns = computed(() => {
  if (maximumMachineCount.value <= 6) return 2
  if (maximumMachineCount.value <= 12) return 3
  if (maximumMachineCount.value <= 20) return 4
  return 5
})

const topStageHeight = 300
const lowerStageY = 430
const canvasHeight = 700

const densityZoomFactor = computed(() => {
  if (maximumMachineCount.value <= 6) return 1
  if (maximumMachineCount.value <= 9) return 0.92
  if (maximumMachineCount.value <= 12) return 0.84
  return 0.75
})

const canvasWrapStyle = computed(() => ({
  width: `${CANVAS_WIDTH * zoom.value}px`,
  height: `${canvasHeight * zoom.value}px`,
}))

const canvasStyle = computed(() => ({
  width: `${CANVAS_WIDTH}px`,
  height: `${canvasHeight}px`,
  transform: `scale(${zoom.value})`,
}))

const flowLines = computed(() => {
  const topMiddle = 60 + topStageHeight / 2
  const topBottom = 60 + topStageHeight
  const lowerMiddle = lowerStageY + 120
  return [
    `200,${topMiddle} 220,${topMiddle}`,
    `450,${topMiddle} 470,${topMiddle}`,
    `700,${topMiddle} 720,${topMiddle}`,
    `835,${topBottom} 835,${lowerStageY}`,
    `720,${lowerMiddle} 700,${lowerMiddle}`,
    `470,${lowerMiddle} 430,${lowerMiddle}`,
  ]
})

const statusLabels: Record<string, string> = {
  EMPTY: '空闲',
  PENDING: '待加工',
  PROCESSING: '加工中',
  CROSS_PROCESSING: '跨工序',
  PAUSED: '暂停',
}

function stageStyle(group: ProcessGroup) {
  const positions: Record<
    string,
    { x: number; y: number; width: number; height: number }
  > = {
    CASTING: { x: 20, y: 60, width: 180, height: topStageHeight },
    ROUGH_TURNING: { x: 220, y: 60, width: 230, height: topStageHeight },
    FINISH_TURNING: { x: 470, y: 60, width: 230, height: topStageHeight },
    BORING: { x: 720, y: 60, width: 230, height: topStageHeight },
    DEBURRING: { x: 720, y: lowerStageY, width: 230, height: 240 },
    PACKAGING: { x: 470, y: lowerStageY, width: 230, height: 240 },
    SHIPPING: { x: 50, y: lowerStageY, width: 380, height: 240 },
  }
  const position = positions[group.code] ?? {
    x: 20,
    y: lowerStageY,
    width: 180,
    height: 240,
  }
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
  }
}

function workGridStyle(group: ProcessGroup) {
  const isMachine = ['ROUGH_TURNING', 'FINISH_TURNING', 'BORING'].includes(
    group.code,
  )
  const columns = isMachine
    ? Math.min(machineColumns.value, Math.max(1, group.workStations.length))
    : group.code === 'SHIPPING'
      ? 2
      : 1
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
}

function stationClass(station: WorkstationItem) {
  return `is-${station.displayStatus?.toLowerCase() ?? 'empty'}`
}

async function load(shouldFit = false, shouldRestorePosition = false) {
  loading.value = true
  errorMessage.value = ''
  try {
    stations.value = await getWorkshopMap()
    await nextTick()
    if (shouldFit) fitCanvas()
    else if (shouldRestorePosition) restorePosition()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '车间状态加载失败')
  } finally {
    loading.value = false
  }
}

function persistPosition() {
  const container = viewport.value
  if (!container) return
  try {
    window.localStorage.setItem(
      POSITION_STORAGE_KEY,
      JSON.stringify({
        left: container.scrollLeft,
        top: container.scrollTop,
      }),
    )
  } catch {
    // 浏览器禁用本地存储时仍保留本次页面内的拖动功能。
  }
}

function schedulePositionPersist() {
  if (positionPersistTimer) clearTimeout(positionPersistTimer)
  positionPersistTimer = setTimeout(persistPosition, 80)
}

function restorePosition() {
  const container = viewport.value
  if (!container || !storedPosition) return
  container.scrollLeft = storedPosition.left
  container.scrollTop = storedPosition.top
}

function fitCanvas() {
  const availableWidth = viewport.value?.clientWidth ?? CANVAS_WIDTH
  const availableHeight = viewport.value?.clientHeight ?? 520
  zoom.value = Math.min(
    1,
    Math.max(
      MIN_ZOOM,
      Number(
        (
          Math.min(
            (availableWidth - 2) / CANVAS_WIDTH,
            availableHeight / canvasHeight,
          ) * densityZoomFactor.value
        ).toFixed(2),
      ),
    ),
  )
  persistZoom(zoom.value)
  if (viewport.value) {
    viewport.value.scrollLeft = 0
    viewport.value.scrollTop = 0
    persistPosition()
  }
}

async function changeZoom(step: number) {
  const container = viewport.value
  const previousZoom = zoom.value
  const nextZoom = clampZoom(previousZoom + step, MIN_ZOOM, MAX_ZOOM)
  if (nextZoom === previousZoom) return

  const nextLeft = container
    ? centeredScrollOffset(
        container.scrollLeft,
        container.clientWidth,
        previousZoom,
        nextZoom,
      )
    : 0
  const nextTop = container
    ? centeredScrollOffset(
        container.scrollTop,
        container.clientHeight,
        previousZoom,
        nextZoom,
      )
    : 0

  zoom.value = nextZoom
  persistZoom(nextZoom)
  await nextTick()
  if (container) {
    container.scrollLeft = nextLeft
    container.scrollTop = nextTop
    persistPosition()
  }
}

function startPan(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const container = viewport.value
  if (!container) return
  dragging.value = false
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragScrollLeft = container.scrollLeft
  dragScrollTop = container.scrollTop
}

function movePan(event: PointerEvent) {
  const container = viewport.value
  if (!container || event.pointerId !== dragPointerId) return
  const offsetX = event.clientX - dragStartX
  const offsetY = event.clientY - dragStartY

  if (!dragging.value) {
    if (
      !exceedsDragThreshold(
        dragStartX,
        dragStartY,
        event.clientX,
        event.clientY,
      )
    ) {
      return
    }
    dragging.value = true
    container.setPointerCapture(event.pointerId)
  }

  container.scrollLeft = dragScrollLeft - offsetX
  container.scrollTop = dragScrollTop - offsetY
  event.preventDefault()
}

function endPan(event: PointerEvent) {
  const container = viewport.value
  if (event.pointerId !== dragPointerId) return
  const didDrag = dragging.value
  dragging.value = false
  dragPointerId = undefined
  if (container?.hasPointerCapture(event.pointerId)) {
    container.releasePointerCapture(event.pointerId)
  }
  if (didDrag) {
    suppressClickUntil = Date.now() + 250
    persistPosition()
  }
}

function guardCanvasClick(event: MouseEvent) {
  if (Date.now() >= suppressClickUntil) return
  event.preventDefault()
  event.stopPropagation()
}

function handleWindowResize() {
  if (Math.abs(window.innerWidth - lastWindowWidth) < 2) return
  lastWindowWidth = window.innerWidth
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(fitCanvas, 120)
}

onMounted(() => {
  lastWindowWidth = window.innerWidth
  window.addEventListener('resize', handleWindowResize)
  void load(storedZoom === null, storedZoom !== null && storedPosition !== null)
})

onBeforeUnmount(() => {
  persistPosition()
  window.removeEventListener('resize', handleWindowResize)
  if (resizeTimer) clearTimeout(resizeTimer)
  if (positionPersistTimer) clearTimeout(positionPersistTimer)
})
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
            :disabled="zoom <= MIN_ZOOM"
            aria-label="缩小地图"
            @click="changeZoom(-0.1)"
          >
            −
          </button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button
            type="button"
            :disabled="zoom >= MAX_ZOOM"
            aria-label="放大地图"
            @click="changeZoom(0.1)"
          >
            ＋
          </button>
          <button type="button" aria-label="适应屏幕" @click="fitCanvas">
            适应
          </button>
          <button type="button" :disabled="loading" @click="load(false)">
            {{ loading ? '加载中' : '刷新' }}
          </button>
        </div>
      </div>
      <p v-if="errorMessage" class="state-message is-error">
        {{ errorMessage }}
      </p>
      <div
        v-else
        ref="viewport"
        class="map-viewport"
        :class="{ 'is-dragging': dragging }"
        aria-label="可缩放车间地图"
        @pointerdown="startPan"
        @pointermove="movePan"
        @pointerup="endPan"
        @pointercancel="endPan"
        @scroll.passive="schedulePositionPersist"
        @click.capture="guardCanvasClick"
      >
        <div class="canvas-wrap" :style="canvasWrapStyle">
          <div
            class="workshop-map"
            :style="canvasStyle"
            aria-label="车间流程画布"
          >
            <svg
              class="flow-arrows"
              :viewBox="`0 0 ${CANVAS_WIDTH} ${canvasHeight}`"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-arrow"
                  marker-width="8"
                  marker-height="8"
                  ref-x="7"
                  ref-y="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              <polyline
                v-for="points in flowLines"
                :key="points"
                :points="points"
                marker-end="url(#flow-arrow)"
              />
            </svg>

            <section
              v-for="(group, index) in processGroups"
              :key="group.id"
              class="process-stage"
              :class="{
                'is-machine-stage': [
                  'ROUGH_TURNING',
                  'FINISH_TURNING',
                  'BORING',
                ].includes(group.code),
                'is-dense': group.workStations.length > 6,
                'is-very-dense': group.workStations.length > 9,
              }"
              :style="stageStyle(group)"
            >
              <header>
                <span>STEP {{ index + 1 }}</span>
                <h3>{{ group.name }}</h3>
              </header>
              <div class="stage-content">
                <RouterLink
                  v-for="station in group.bufferStations"
                  :key="station.id"
                  class="station is-buffer"
                  :class="stationClass(station)"
                  :to="`/workstations/${station.id}`"
                >
                  <strong>{{ station.name }}</strong>
                  <small>{{
                    statusLabels[station.displayStatus ?? 'EMPTY']
                  }}</small>
                </RouterLink>
                <div class="work-grid" :style="workGridStyle(group)">
                  <RouterLink
                    v-for="station in group.workStations"
                    :key="station.id"
                    class="station"
                    :class="stationClass(station)"
                    :to="`/workstations/${station.id}`"
                  >
                    <strong>{{ station.name }}</strong>
                    <small>{{
                      statusLabels[station.displayStatus ?? 'EMPTY']
                    }}</small>
                  </RouterLink>
                </div>
              </div>
            </section>
            <div v-if="loading" class="map-loading">读取车间状态…</div>
          </div>
        </div>
      </div>
      <p class="map-note">
        区域位置固定，机器按工序自动进入预留槽位；机器较多时画布自动适应，也可以手动缩放查看。
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
  background: var(--state);
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
  gap: 10px;
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
  min-width: 30px;
  height: 32px;
  padding: 0 7px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: #f8fafb;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 800;
}
.map-tools button:disabled {
  opacity: 0.45;
}
.map-viewport {
  height: clamp(300px, 58vh, 520px);
  margin: 14px;
  overflow: auto;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: #f8fafb;
  overscroll-behavior: contain;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.map-viewport.is-dragging {
  cursor: grabbing;
}
.canvas-wrap {
  position: relative;
  min-width: 100%;
}
.workshop-map {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform-origin: top left;
  background:
    linear-gradient(90deg, rgb(23 32 43 / 5%) 1px, transparent 1px) 0 0/20px
      20px,
    linear-gradient(rgb(23 32 43 / 5%) 1px, transparent 1px) 0 0/20px 20px,
    #f8fafb;
}
.flow-arrows {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.flow-arrows polyline {
  fill: none;
  stroke: #9aa7b4;
  stroke-width: 3;
}
.flow-arrows path {
  fill: #9aa7b4;
}
.process-stage {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 3px 12px rgb(23 32 43 / 7%);
}
.process-stage header {
  flex: 0 0 auto;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--color-border);
}
.process-stage header span,
.process-stage header h3 {
  margin: 0;
}
.process-stage header span {
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.process-stage header h3 {
  margin-top: 3px;
  font-size: 14px;
}
.stage-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  padding-top: 10px;
}
.work-grid {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-auto-rows: minmax(44px, 1fr);
  gap: 8px;
}
.station {
  display: grid;
  min-width: 0;
  min-height: 44px;
  place-content: center;
  padding: 5px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--state) 55%, white);
  border-left: 4px solid var(--state);
  border-radius: 4px;
  background: color-mix(in srgb, var(--state) 10%, white);
  color: var(--color-text-primary);
  text-align: center;
  text-decoration: none;
}
.station.is-buffer {
  min-height: 52px;
  flex: 0 0 auto;
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
.process-stage.is-dense .work-grid {
  gap: 6px;
  grid-auto-rows: minmax(36px, 1fr);
}
.process-stage.is-dense .station {
  min-height: 36px;
  padding: 3px;
}
.process-stage.is-very-dense .station strong {
  font-size: 9px;
}
.process-stage.is-very-dense .work-grid {
  gap: 4px;
  grid-auto-rows: minmax(28px, 1fr);
}
.process-stage.is-very-dense .station {
  min-height: 28px;
  border-left-width: 3px;
}
.process-stage.is-very-dense .station small {
  font-size: 7px;
}
.map-loading {
  position: absolute;
  z-index: 4;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(248 250 251 / 72%);
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
@media (max-width: 540px) {
  .dashboard-strip {
    align-items: flex-start;
    flex-direction: column;
  }
  .dashboard-strip a {
    align-self: stretch;
    text-align: center;
  }
  .panel-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .map-tools {
    width: 100%;
  }
  .map-tools button:last-child {
    margin-left: auto;
  }
  .map-viewport {
    margin: 10px;
  }
}
</style>
