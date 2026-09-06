<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import {
  assignTask,
  getProcesses,
  getWorkstation,
  getWorkstations,
  taskAction,
  transferTask,
  updateCompleted,
  type ProcessItem,
  type WorkstationDetail,
  type WorkstationItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'
import { createRequestId } from '@/utils/request-id'
import { refreshPreservingScroll } from '@/utils/refresh-preserving-scroll'

const route = useRoute()
const station = ref<WorkstationDetail>()
const processes = ref<ProcessItem[]>([])
const workstations = ref<WorkstationItem[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const errorMessage = ref('')
const notice = ref('')
const assignStations = reactive<Record<number, number>>({})
const quantities = reactive<Record<number, number>>({})
const transfer = reactive({ taskId: 0, quantity: 0, targetWorkstationId: 0 })

const statusLabels: Record<string, string> = {
  EMPTY: '空闲',
  UNSCHEDULED: '未排产',
  PENDING: '待加工',
  PROCESSING: '加工中',
  CROSS_PROCESSING: '跨工序加工中',
  PAUSED: '暂停',
  COMPLETED: '已完成',
}

const activeTasks = computed(
  () =>
    station.value?.tasks.filter((task) =>
      ['PROCESSING', 'PAUSED'].includes(task.status),
    ) ?? [],
)
const queuedTasks = computed(
  () => station.value?.tasks.filter((task) => task.status === 'PENDING') ?? [],
)
const processStations = computed(() =>
  workstations.value.filter((item) => item.processId === station.value?.processId),
)
const transferTaskItem = computed(() =>
  station.value?.tasks.find((item) => item.id === transfer.taskId),
)
const nextProcess = computed(() => {
  const current = transferTaskItem.value?.process
  return current
    ? processes.value
        .filter((item) => item.sort > current.sort)
        .sort((left, right) => left.sort - right.sort)[0]
    : undefined
})
const targetStations = computed(() => {
  const stations = workstations.value.filter(
    (item) => item.processId === nextProcess.value?.id,
  )
  const buffers = stations.filter((item) => item.type === 'BUFFER')
  return buffers.length ? buffers : stations
})

function isShippingTask(task: WorkstationDetail['tasks'][number]) {
  return task.process.code === 'SHIPPING'
}

async function load(showLoading = true) {
  if (showLoading) loading.value = true
  errorMessage.value = ''
  try {
    ;[station.value, processes.value, workstations.value] = await Promise.all([
      getWorkstation(Number(route.params.id)),
      getProcesses(),
      getWorkstations(),
    ])
    for (const task of station.value.tasks) {
      assignStations[task.id] =
        processStations.value.find((item) => item.type !== 'BUFFER')?.id ?? 0
      quantities[task.id] = task.completedQuantity
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '工作位置详情加载失败')
  } finally {
    if (showLoading) loading.value = false
  }
}

async function run(message: string, action: () => Promise<unknown>) {
  if (actionLoading.value) return false
  actionLoading.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await action()
    notice.value = message
    await refreshPreservingScroll(() => load(false))
    return true
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error)
    return false
  } finally {
    actionLoading.value = false
  }
}

function openTransfer(task: WorkstationDetail['tasks'][number]) {
  transfer.taskId = task.id
  transfer.quantity = task.availableToTransfer
  transfer.targetWorkstationId = 0
}

async function submitTransfer() {
  const task = transferTaskItem.value
  if (!task || !transfer.targetWorkstationId) return
  const succeeded = await run('转序完成，下一工序已进入待加工区', () =>
    transferTask(task.id, {
      requestId: createRequestId(),
      quantity: Number(transfer.quantity),
      targetWorkstationId: Number(transfer.targetWorkstationId),
    }),
  )
  if (succeeded) transfer.taskId = 0
}

onMounted(load)
</script>

<template>
  <AppShell title="工作位置详情" back>
    <p v-if="loading" class="message">正在读取现场状态…</p>
    <p v-else-if="!station" class="message is-error">{{ errorMessage }}</p>
    <template v-else>
      <section
        class="station-identity"
        :class="`is-${station.displayStatus?.toLowerCase()}`"
      >
        <div>
          <p>{{ station.code }}</p>
          <h2>{{ station.name }}</h2>
          <span
            >{{ station.process?.name ?? '公共流转区域' }} ·
            {{ station.type }}</span
          >
        </div>
        <strong>{{ statusLabels[station.displayStatus ?? 'EMPTY'] }}</strong>
      </section>

      <dl class="station-facts">
        <div>
          <dt>在制</dt>
          <dd>{{ activeTasks.length }}</dd>
        </div>
        <div>
          <dt>待加工</dt>
          <dd>{{ queuedTasks.length }}</dd>
        </div>
        <div>
          <dt>全部任务</dt>
          <dd>{{ station.tasks.length }}</dd>
        </div>
      </dl>

      <p v-if="notice" class="message is-success">{{ notice }}</p>
      <p v-if="errorMessage" class="message is-error">{{ errorMessage }}</p>

      <section class="queue-panel">
        <header>
          <div>
            <p>WORK QUEUE</p>
            <h2>现场任务队列</h2>
          </div>
          <button type="button" :disabled="loading" @click="load()">
            刷新
          </button>
        </header>
        <p v-if="!station.tasks.length" class="empty-state">
          当前没有待处理任务
        </p>
        <article
          v-for="task in station.tasks"
          :key="task.id"
          class="queue-item"
        >
          <div class="task-heading">
            <div>
              <small
                >{{ task.batch.order.orderNo }} ·
                {{ task.batch.batchNo }}</small
              >
              <h3>{{ task.batch.order.model }}</h3>
              <span>{{ task.batch.order.customer }}</span>
            </div>
            <strong :class="`is-${task.displayStatus.toLowerCase()}`">
              {{ statusLabels[task.displayStatus] ?? task.displayStatus }}
            </strong>
          </div>
          <div class="quantity-line">
            <span
              >完成 {{ task.completedQuantity }} /
              {{ task.plannedQuantity }}</span
            >
            <span>可转 {{ task.availableToTransfer }}</span>
          </div>
          <div
            v-if="['PROCESSING', 'PAUSED'].includes(task.status)"
            class="update-row"
          >
            <input
              v-model.number="quantities[task.id]"
              type="number"
              min="0"
              :max="task.plannedQuantity"
              inputmode="numeric"
            />
            <button
              type="button"
              :disabled="actionLoading"
              @click="
                run(
                  isShippingTask(task) ? '发货数量已更新' : '完成数量已更新',
                  () => updateCompleted(task.id, Number(quantities[task.id])),
                )
              "
            >
              {{ isShippingTask(task) ? '更新发货量' : '更新完成量' }}
            </button>
          </div>
          <div class="task-actions">
            <button
              v-if="task.status === 'PENDING' && station.type !== 'BUFFER'"
              type="button"
              :disabled="actionLoading"
              @click="
                run(
                  station.process?.code === 'SHIPPING'
                    ? '发货已开始'
                    : '任务已开始',
                  () => taskAction(task.id, 'start'),
                )
              "
            >
              {{
                station.process?.code === 'SHIPPING' ? '开始发货' : '开始加工'
              }}
            </button>
            <button
              v-if="task.status === 'PROCESSING'"
              class="secondary"
              type="button"
              :disabled="actionLoading"
              @click="run('任务已暂停', () => taskAction(task.id, 'pause'))"
            >
              暂停
            </button>
            <button
              v-if="task.status === 'PAUSED'"
              type="button"
              :disabled="actionLoading"
              @click="run('任务已恢复', () => taskAction(task.id, 'resume'))"
            >
              恢复
            </button>
            <button
              v-if="
                task.availableToTransfer > 0 &&
                task.process.code !== 'SHIPPING'
              "
              class="transfer-button"
              type="button"
              :disabled="actionLoading"
              @click="openTransfer(task)"
            >
              转下一工序
            </button>
            <button
              v-if="
                ['PROCESSING', 'PAUSED'].includes(task.status) &&
                task.completedQuantity === task.plannedQuantity
              "
              class="complete-button"
              type="button"
              :disabled="actionLoading"
              @click="
                run(
                  isShippingTask(task) ? '本批发货已确认' : '本工序已完成',
                  () => taskAction(task.id, 'complete'),
                )
              "
            >
              {{ isShippingTask(task) ? '确认本批发货' : '完成本工序' }}
            </button>
            <RouterLink :to="`/orders/${task.batch.order.id}`"
              >查看完整生产单</RouterLink
            >
          </div>
          <div
            v-if="station.type === 'BUFFER' && task.status === 'PENDING'"
            class="assign-row"
          >
            <select v-model.number="assignStations[task.id]">
              <option :value="0">选择加工位置</option>
              <option
                v-for="item in processStations.filter(
                  (entry) => entry.type !== 'BUFFER',
                )"
                :key="item.id"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select>
            <button
              type="button"
              :disabled="actionLoading || !assignStations[task.id]"
              @click="
                run('任务已从缓冲区分配', () =>
                  assignTask(task.id, assignStations[task.id]),
                )
              "
            >
              分配
            </button>
          </div>
        </article>
      </section>

      <section v-if="transferTaskItem" class="transfer-panel">
        <header>
          <div>
            <p>TRANSFER</p>
            <h2>
              {{ transferTaskItem.process.name }} → {{ nextProcess?.name }}
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭转序"
            @click="transfer.taskId = 0"
          >
            ×
          </button>
        </header>
        <label>
          <span>转序数量 · 最多 {{ transferTaskItem.availableToTransfer }}</span>
          <input
            v-model.number="transfer.quantity"
            type="number"
            min="1"
            :max="transferTaskItem.availableToTransfer"
            inputmode="numeric"
          />
        </label>
        <label>
          <span>目标工作位置</span>
          <select v-model.number="transfer.targetWorkstationId">
            <option :value="0">请选择</option>
            <option
              v-for="item in targetStations"
              :key="item.id"
              :value="item.id"
            >
              {{ item.name }} · {{ item.type }}
            </option>
          </select>
        </label>
        <button
          class="confirm-transfer"
          type="button"
          :disabled="
            actionLoading ||
            !transfer.targetWorkstationId ||
            transfer.quantity < 1 ||
            transfer.quantity > transferTaskItem.availableToTransfer
          "
          @click="submitTransfer"
        >
          {{ actionLoading ? '正在转序…' : '确认转序' }}
        </button>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.station-identity {
  --state: var(--color-empty);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-left: 5px solid var(--state);
  border-radius: 7px;
  background: var(--color-bg-inverse);
  color: white;
}
.station-identity.is-processing {
  --state: var(--color-success);
}
.station-identity.is-cross_processing {
  --state: var(--color-info);
}
.station-identity.is-paused {
  --state: var(--color-warning);
}
.station-identity.is-pending {
  --state: var(--color-danger);
}
.station-identity p,
.station-identity h2,
.station-identity span {
  margin: 0;
}
.station-identity p {
  color: #8fa2b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.station-identity h2 {
  margin-top: 5px;
  font-size: 25px;
}
.station-identity span {
  display: block;
  margin-top: 7px;
  color: #b9c4d0;
  font-size: 11px;
}
.station-identity > strong {
  align-self: flex-start;
  padding: 6px 8px;
  border-radius: 3px;
  background: var(--state);
  font-size: 10px;
}
.station-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 12px 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
}
.station-facts div {
  padding: 12px;
  border-right: 1px solid var(--color-border);
}
.station-facts div:last-child {
  border: 0;
}
.station-facts dt {
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.station-facts dd {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 800;
}
.queue-panel {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  box-shadow: var(--shadow-card);
}
.queue-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}
.queue-panel header p,
.queue-panel header h2 {
  margin: 0;
}
.queue-panel header p {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.queue-panel header h2 {
  margin-top: 3px;
  font-size: 18px;
}
.queue-panel header button {
  border: 0;
  background: transparent;
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 800;
}
.queue-item {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}
.queue-item:last-child {
  border-bottom: 0;
}
.task-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.task-heading small,
.task-heading h3,
.task-heading span {
  margin: 0;
}
.task-heading small {
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.task-heading h3 {
  margin-top: 4px;
  font-size: 17px;
}
.task-heading span {
  display: block;
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.task-heading > strong {
  align-self: flex-start;
  padding: 5px 7px;
  border-radius: 3px;
  background: #eef1f4;
  color: var(--color-text-secondary);
  font-size: 9px;
}
.task-heading > strong.is-processing {
  background: #edf9f2;
  color: var(--color-success);
}
.task-heading > strong.is-cross_processing {
  background: var(--color-brand-soft);
  color: var(--color-info);
}
.task-heading > strong.is-paused {
  background: #fff4e6;
  color: var(--color-warning);
}
.task-heading > strong.is-pending {
  background: #fff5f5;
  color: var(--color-danger);
}
.quantity-line {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.task-actions button,
.task-actions a {
  min-height: 38px;
  flex: 1;
  display: grid;
  place-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
}
.task-actions button.secondary {
  border: 1px solid var(--color-border-strong);
  background: white;
  color: var(--color-text-primary);
}
.task-actions button.transfer-button {
  background: var(--color-bg-inverse);
}
.task-actions button.complete-button {
  background: var(--color-success);
}
.task-actions a {
  background: var(--color-bg-inverse);
}
.assign-row,
.update-row {
  display: flex;
  margin-top: 10px;
}
.assign-row select,
.update-row input,
.transfer-panel input,
.transfer-panel select {
  min-width: 0;
  height: 42px;
  flex: 1;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px 0 0 4px;
  background: #fafbfc;
}
.assign-row button,
.update-row button {
  min-width: 84px;
  border: 0;
  border-radius: 0 4px 4px 0;
  background: var(--color-success);
  color: white;
  font-size: 11px;
  font-weight: 800;
}
.transfer-panel {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  gap: 16px;
  padding: 20px 18px calc(20px + var(--safe-bottom));
  border-radius: 12px 12px 0 0;
  background: white;
  box-shadow: 0 -18px 60px rgb(23 32 43 / 28%);
}
.transfer-panel header {
  display: flex;
  justify-content: space-between;
}
.transfer-panel header p,
.transfer-panel header h2 {
  margin: 0;
}
.transfer-panel header p {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.transfer-panel header h2 {
  margin-top: 4px;
  font-size: 19px;
}
.transfer-panel header button {
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 26px;
}
.transfer-panel label span {
  display: block;
  margin-bottom: 7px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}
.transfer-panel input,
.transfer-panel select {
  width: 100%;
  border-radius: 4px;
}
.confirm-transfer {
  min-height: 48px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-weight: 800;
}
.message {
  padding: 11px 12px;
  border-left: 3px solid var(--color-border-strong);
  background: white;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
}
.message.is-success {
  border-color: var(--color-success);
  background: #edf9f2;
  color: var(--color-success);
}
.message.is-error {
  border-color: var(--color-danger);
  background: #fff5f5;
  color: var(--color-danger);
}
.empty-state {
  margin: 0;
  padding: 32px 18px;
  color: var(--color-text-tertiary);
  font-size: 12px;
  text-align: center;
}
button:disabled {
  opacity: 0.55;
}
</style>
