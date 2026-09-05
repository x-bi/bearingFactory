<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import {
  assignTask,
  getWorkstation,
  getWorkstations,
  taskAction,
  type WorkstationDetail,
  type WorkstationItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const route = useRoute()
const station = ref<WorkstationDetail>()
const processStations = ref<WorkstationItem[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const errorMessage = ref('')
const notice = ref('')
const assignStations = reactive<Record<number, number>>({})

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

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    station.value = await getWorkstation(Number(route.params.id))
    processStations.value = station.value.process?.code
      ? await getWorkstations(station.value.process.code)
      : []
    for (const task of station.value.tasks) {
      assignStations[task.id] =
        processStations.value.find((item) => item.type !== 'BUFFER')?.id ?? 0
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '工作位置详情加载失败')
  } finally {
    loading.value = false
  }
}

async function run(message: string, action: () => Promise<unknown>) {
  if (actionLoading.value) return
  actionLoading.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await action()
    notice.value = message
    await load()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error)
  } finally {
    actionLoading.value = false
  }
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
          <button type="button" :disabled="loading" @click="load">刷新</button>
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
            <span>已转 {{ task.transferredQuantity }}</span>
          </div>
          <div class="task-actions">
            <button
              v-if="task.status === 'PENDING' && station.type !== 'BUFFER'"
              type="button"
              :disabled="actionLoading"
              @click="run('任务已开始', () => taskAction(task.id, 'start'))"
            >
              开始加工
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
            <RouterLink :to="`/orders/${task.batch.order.id}`"
              >进入生产单</RouterLink
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
.task-actions a {
  background: var(--color-bg-inverse);
}
.assign-row {
  display: flex;
  margin-top: 10px;
}
.assign-row select {
  min-width: 0;
  height: 42px;
  flex: 1;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px 0 0 4px;
  background: #fafbfc;
}
.assign-row button {
  min-width: 84px;
  border: 0;
  border-radius: 0 4px 4px 0;
  background: var(--color-success);
  color: white;
  font-size: 11px;
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
