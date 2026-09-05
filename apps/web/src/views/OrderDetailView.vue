<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import {
  assignTask,
  getOrder,
  getProcesses,
  getWorkstations,
  taskAction,
  transferTask,
  updateCompleted,
  type ProcessItem,
  type ProcessTaskItem,
  type ProductionOrderItem,
  type WorkstationItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const route = useRoute()
const order = ref<ProductionOrderItem>()
const processes = ref<ProcessItem[]>([])
const workstations = ref<WorkstationItem[]>([])
const loading = ref(true)
const actionLoading = ref(false)
const notice = ref('')
const errorMessage = ref('')
const quantities = reactive<Record<number, number>>({})
const assignStations = reactive<Record<number, number>>({})
const transfer = reactive({ taskId: 0, quantity: 0, targetWorkstationId: 0 })
const statusLabels: Record<string, string> = {
  UNSCHEDULED: '未排产',
  PENDING: '待加工',
  PROCESSING: '加工中',
  PAUSED: '暂停',
  COMPLETED: '已完成',
}
const tasks = computed(
  () => order.value?.batches.flatMap((batch) => batch.tasks) ?? [],
)
const transferTaskItem = computed(() =>
  tasks.value.find((item) => item.id === transfer.taskId),
)
const nextProcess = computed(() => {
  const current = transferTaskItem.value?.process
  return current
    ? processes.value
        .filter((item) => item.sort > current.sort)
        .sort((a, b) => a.sort - b.sort)[0]
    : undefined
})
const targetStations = computed(() =>
  workstations.value.filter((item) => item.processId === nextProcess.value?.id),
)

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const id = Number(route.params.id)
    ;[order.value, processes.value, workstations.value] = await Promise.all([
      getOrder(id),
      getProcesses(),
      getWorkstations(),
    ])
    for (const task of tasks.value) {
      quantities[task.id] = task.completedQuantity
      assignStations[task.id] =
        workstations.value.find(
          (station) =>
            station.processId === task.processId && station.type !== 'BUFFER',
        )?.id ?? 0
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '生产单详情加载失败')
  } finally {
    loading.value = false
  }
}

async function run(message: string, action: () => Promise<unknown>) {
  if (actionLoading.value) return
  actionLoading.value = true
  notice.value = ''
  errorMessage.value = ''
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

function openTransfer(task: ProcessTaskItem) {
  transfer.taskId = task.id
  transfer.quantity = task.availableToTransfer
  transfer.targetWorkstationId = 0
}
async function submitTransfer() {
  const task = transferTaskItem.value
  if (!task || !transfer.targetWorkstationId) return
  await run('转序完成，下一工序已生成待加工任务', () =>
    transferTask(task.id, {
      requestId: crypto.randomUUID(),
      quantity: Number(transfer.quantity),
      targetWorkstationId: Number(transfer.targetWorkstationId),
    }),
  )
  transfer.taskId = 0
}

onMounted(load)
</script>

<template>
  <AppShell title="生产单详情" back>
    <p v-if="loading" class="message">正在读取生产数据…</p>
    <p v-else-if="!order" class="message error">{{ errorMessage }}</p>
    <template v-else>
      <section class="order-identity">
        <div>
          <p>{{ order.orderNo }}</p>
          <h2>{{ order.model }}</h2>
          <span>{{ order.customer }}</span>
        </div>
        <strong>{{ statusLabels[order.status] ?? order.status }}</strong>
      </section>
      <dl class="order-facts">
        <div>
          <dt>总数量</dt>
          <dd>{{ order.quantity }}</dd>
        </div>
        <div>
          <dt>批次</dt>
          <dd>{{ order.batches[0]?.batchNo }}</dd>
        </div>
        <div>
          <dt>交期</dt>
          <dd>{{ order.dueDate?.slice(0, 10) || '未设置' }}</dd>
        </div>
      </dl>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

      <section class="task-section">
        <header>
          <div>
            <p>PROCESS TASKS</p>
            <h2>工序任务</h2>
          </div>
          <span>{{ tasks.length }} 项</span>
        </header>
        <article v-for="task in tasks" :key="task.id" class="task-card">
          <div class="task-title">
            <span>{{ String(task.process.sort / 10).padStart(2, '0') }}</span>
            <div>
              <h3>{{ task.process.name }}</h3>
              <small>{{ task.workstation?.name ?? '尚未分配工作位置' }}</small>
            </div>
            <strong :class="`is-${task.status.toLowerCase()}`">{{
              statusLabels[task.status]
            }}</strong>
          </div>
          <div class="quantity-line">
            <span
              >完成 <b>{{ task.completedQuantity }}</b> /
              {{ task.plannedQuantity }}</span
            ><span
              >可转 <b>{{ task.availableToTransfer }}</b></span
            >
          </div>
          <div class="quantity-progress">
            <i
              :style="{
                width: `${Math.min(100, (task.completedQuantity / task.plannedQuantity) * 100)}%`,
              }"
            />
          </div>

          <div
            v-if="
              task.status === 'UNSCHEDULED' ||
              (task.status === 'PENDING' && task.workstation?.type === 'BUFFER')
            "
            class="inline-action"
          >
            <select v-model.number="assignStations[task.id]">
              <option :value="0">选择当前工序设备</option>
              <option
                v-for="station in workstations.filter(
                  (item) =>
                    item.processId === task.processId && item.type !== 'BUFFER',
                )"
                :key="station.id"
                :value="station.id"
              >
                {{ station.name }}
              </option></select
            ><button
              type="button"
              :disabled="actionLoading || !assignStations[task.id]"
              @click="
                run('任务已分配', () =>
                  assignTask(task.id, assignStations[task.id]),
                )
              "
            >
              分配
            </button>
          </div>
          <div
            v-if="['PROCESSING', 'PAUSED'].includes(task.status)"
            class="inline-action"
          >
            <input
              v-model.number="quantities[task.id]"
              type="number"
              min="0"
              :max="task.plannedQuantity"
              inputmode="numeric"
            /><button
              type="button"
              :disabled="actionLoading"
              @click="
                run('完成数量已更新', () =>
                  updateCompleted(task.id, Number(quantities[task.id])),
                )
              "
            >
              更新完成量
            </button>
          </div>
          <div class="action-grid">
            <button
              v-if="
                task.status === 'PENDING' && task.workstation?.type !== 'BUFFER'
              "
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
            <button
              v-if="
                task.availableToTransfer > 0 && task.process.code !== 'SHIPPING'
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
                run('本工序已完成', () => taskAction(task.id, 'complete'))
              "
            >
              完成本工序
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
        <label
          ><span
            >转序数量 · 最多 {{ transferTaskItem.availableToTransfer }}</span
          ><input
            v-model.number="transfer.quantity"
            type="number"
            min="1"
            :max="transferTaskItem.availableToTransfer"
            inputmode="numeric" /></label
        ><label
          ><span>目标工作位置</span
          ><select v-model.number="transfer.targetWorkstationId">
            <option :value="0">请选择</option>
            <option
              v-for="station in targetStations"
              :key="station.id"
              :value="station.id"
            >
              {{ station.name }} · {{ station.type }}
            </option>
          </select></label
        ><button
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

      <section v-if="order.batches[0]?.transfers?.length" class="history">
        <p>TRANSFER HISTORY</p>
        <h2>转序记录</h2>
        <ul>
          <li v-for="item in order.batches[0].transfers" :key="item.id">
            <span
              >{{ item.fromTask.process.name }} →
              {{ item.toTask.process.name }}</span
            ><strong>{{ item.quantity }}</strong
            ><small>{{ item.toTask.workstation?.name }}</small>
          </li>
        </ul>
      </section>
    </template>
  </AppShell>
</template>

<style scoped>
.order-identity {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: 7px;
  background: var(--color-bg-inverse);
  color: white;
}
.order-identity p,
.order-identity h2,
.order-identity span {
  margin: 0;
}
.order-identity p {
  color: #8fa2b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
}
.order-identity h2 {
  margin-top: 5px;
  font-size: 26px;
}
.order-identity span {
  display: block;
  margin-top: 6px;
  color: #b9c4d0;
  font-size: 12px;
}
.order-identity > strong {
  align-self: flex-start;
  padding: 6px 8px;
  border-radius: 3px;
  background: var(--color-brand);
  font-size: 10px;
}
.order-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 12px 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
}
.order-facts div {
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--color-border);
}
.order-facts div:last-child {
  border: 0;
}
.order-facts dt {
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.order-facts dd {
  overflow: hidden;
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-section,
.history {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  box-shadow: var(--shadow-card);
}
.task-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}
.task-section header p,
.task-section header h2,
.history > p,
.history > h2 {
  margin: 0;
}
.task-section header p,
.history > p {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.task-section header h2,
.history > h2 {
  margin-top: 3px;
  font-size: 18px;
}
.task-section > header > span {
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 800;
}
.task-card {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}
.task-card:last-child {
  border-bottom: 0;
}
.task-title {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
}
.task-title > span {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 800;
}
.task-title h3,
.task-title small {
  margin: 0;
}
.task-title h3 {
  font-size: 15px;
}
.task-title small {
  display: block;
  margin-top: 3px;
  color: var(--color-text-tertiary);
  font-size: 10px;
}
.task-title > strong {
  padding: 5px 7px;
  border-radius: 3px;
  background: #eef1f4;
  color: var(--color-text-secondary);
  font-size: 9px;
}
.task-title > strong.is-processing {
  background: #edf9f2;
  color: var(--color-success);
}
.task-title > strong.is-paused {
  background: #fff4e6;
  color: var(--color-warning);
}
.task-title > strong.is-pending {
  background: #fff5f5;
  color: var(--color-danger);
}
.task-title > strong.is-completed {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}
.quantity-line {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  color: var(--color-text-secondary);
  font-size: 10px;
}
.quantity-line b {
  color: var(--color-text-primary);
  font-size: 12px;
}
.quantity-progress {
  height: 4px;
  margin-top: 7px;
  overflow: hidden;
  background: #e7eaee;
}
.quantity-progress i {
  display: block;
  height: 100%;
  background: var(--color-brand);
}
.inline-action {
  display: flex;
  margin-top: 12px;
}
.inline-action input,
.inline-action select,
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
.inline-action button {
  min-width: 88px;
  border: 0;
  border-radius: 0 4px 4px 0;
  background: var(--color-bg-inverse);
  color: white;
  font-size: 11px;
  font-weight: 800;
}
.action-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.action-grid:empty {
  display: none;
}
.action-grid button {
  min-height: 38px;
  flex: 1;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-size: 11px;
  font-weight: 800;
}
.action-grid button.secondary {
  border: 1px solid var(--color-border-strong);
  background: white;
  color: var(--color-text-primary);
}
.action-grid button.transfer-button {
  background: var(--color-bg-inverse);
}
.action-grid button.complete-button {
  background: var(--color-success);
}
button:disabled {
  opacity: 0.55;
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
.history {
  margin-top: 12px;
  padding: 17px;
}
.history ul {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}
.history li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border);
  font-size: 11px;
}
.history li small {
  color: var(--color-text-tertiary);
}
.notice,
.message {
  padding: 11px 12px;
  border-left: 3px solid var(--color-success);
  background: #edf9f2;
  color: var(--color-success);
  font-size: 11px;
}
.message {
  text-align: center;
}
.message.error {
  border-color: var(--color-danger);
  background: #fff5f5;
  color: var(--color-danger);
}
</style>
