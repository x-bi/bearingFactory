<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import {
  assignTask,
  getOrder,
  getProcesses,
  getWorkstations,
  moveTaskToSurplus,
  reassignTask,
  scrapTask,
  taskAction,
  transferTask,
  updateCompleted,
  type ProcessItem,
  type ProcessTaskItem,
  type ProductionOrderItem,
  type WorkstationItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'
import { createRequestId } from '@/utils/request-id'
import { refreshPreservingScroll } from '@/utils/refresh-preserving-scroll'

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
const assignQuantities = reactive<Record<number, number>>({})
const transfer = reactive({ taskId: 0, quantity: 0, targetWorkstationId: 0 })
const reassign = reactive({ taskId: 0, quantity: 0, targetWorkstationId: 0 })
const scrap = reactive({ taskId: 0, quantity: 0, reason: '', remark: '' })
const surplus = reactive({ taskId: 0, quantity: 0, remark: '' })
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
const reassignTaskItem = computed(() =>
  tasks.value.find((item) => item.id === reassign.taskId),
)
const scrapTaskItem = computed(() =>
  tasks.value.find((item) => item.id === scrap.taskId),
)
const surplusTaskItem = computed(() =>
  tasks.value.find((item) => item.id === surplus.taskId),
)
const quantitySummary = computed(() => order.value?.batches[0]?.quantitySummary)
const reassignStations = computed(() => {
  const task = reassignTaskItem.value
  return task
    ? workstations.value.filter(
        (item) =>
          item.type === 'DEVICE' &&
          item.processId === task.processId &&
          item.id !== task.workstationId,
      )
    : []
})
const nextProcess = computed(() => {
  const current = transferTaskItem.value?.process
  return current
    ? processes.value
        .filter((item) => item.sort > current.sort)
        .sort((a, b) => a.sort - b.sort)[0]
    : undefined
})
const targetStations = computed(() => {
  const stations = workstations.value.filter(
    (item) => item.processId === nextProcess.value?.id,
  )
  const buffers = stations.filter((item) => item.type === 'BUFFER')
  return buffers.length ? buffers : stations
})

function isShippingTask(task: ProcessTaskItem) {
  return task.process.code === 'SHIPPING'
}

function transferLabel(kind: string) {
  return (
    {
      NEXT_PROCESS: '转下一工序',
      ASSIGN: '分配工作位置',
      REASSIGN: '改派机器',
      TO_SURPLUS: '转入余品区',
    }[kind] ?? kind
  )
}

async function load(showLoading = true) {
  if (showLoading) loading.value = true
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
            station.processId === task.processId &&
            station.type !== 'BUFFER' &&
            station.terminalKind !== 'SURPLUS',
        )?.id ?? 0
      assignQuantities[task.id] = Math.max(1, task.remainingToProcess)
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '生产单详情加载失败')
  } finally {
    if (showLoading) loading.value = false
  }
}

async function run(message: string, action: () => Promise<unknown>) {
  if (actionLoading.value) return false
  actionLoading.value = true
  notice.value = ''
  errorMessage.value = ''
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

function openTransfer(task: ProcessTaskItem) {
  transfer.taskId = task.id
  transfer.quantity = task.availableToTransfer
  transfer.targetWorkstationId = 0
}
async function submitTransfer() {
  const task = transferTaskItem.value
  if (!task || !transfer.targetWorkstationId) return
  const succeeded = await run('转序完成，下一工序已生成待加工任务', () =>
    transferTask(task.id, {
      requestId: createRequestId(),
      quantity: Number(transfer.quantity),
      targetWorkstationId: Number(transfer.targetWorkstationId),
    }),
  )
  if (succeeded) transfer.taskId = 0
}

async function submitAssignment(task: ProcessTaskItem) {
  const workstationId = Number(assignStations[task.id])
  const quantity = Number(assignQuantities[task.id])
  if (!workstationId || quantity < 1) return
  await run('任务已分批分配', () =>
    assignTask(task.id, {
      requestId: createRequestId(),
      workstationId,
      quantity,
    }),
  )
}

function openReassign(task: ProcessTaskItem) {
  reassign.taskId = task.id
  reassign.quantity = task.remainingToProcess
  reassign.targetWorkstationId = 0
}

async function submitReassign() {
  if (!reassignTaskItem.value || !reassign.targetWorkstationId) return
  const succeeded = await run('任务已改派到同工序机器', () =>
    reassignTask(reassign.taskId, {
      requestId: createRequestId(),
      targetWorkstationId: Number(reassign.targetWorkstationId),
      quantity: Number(reassign.quantity),
    }),
  )
  if (succeeded) reassign.taskId = 0
}

function scrapAvailable(task: ProcessTaskItem) {
  return task.workstation?.terminalKind === 'SURPLUS'
    ? task.completedQuantity
    : task.workstation?.terminalKind === 'SHIPPED' &&
        task.status === 'COMPLETED'
      ? 0
      : task.remainingToProcess + task.availableToTransfer
}

function hasReassignTarget(task: ProcessTaskItem) {
  return workstations.value.some(
    (item) =>
      item.type === 'DEVICE' &&
      item.processId === task.processId &&
      item.id !== task.workstationId,
  )
}

function openScrap(task: ProcessTaskItem) {
  scrap.taskId = task.id
  scrap.quantity = scrapAvailable(task)
  scrap.reason = ''
  scrap.remark = ''
}

async function submitScrap() {
  if (!scrapTaskItem.value || !scrap.reason.trim()) return
  const succeeded = await run('报废数量已登记', () =>
    scrapTask(scrap.taskId, {
      requestId: createRequestId(),
      quantity: Number(scrap.quantity),
      reason: scrap.reason.trim(),
      remark: scrap.remark.trim() || undefined,
    }),
  )
  if (succeeded) scrap.taskId = 0
}

function openSurplus(task: ProcessTaskItem) {
  surplus.taskId = task.id
  surplus.quantity = task.remainingToProcess
  surplus.remark = ''
}

async function submitSurplus() {
  if (!surplusTaskItem.value) return
  const succeeded = await run('已转入余品区', () =>
    moveTaskToSurplus(surplus.taskId, {
      requestId: createRequestId(),
      quantity: Number(surplus.quantity),
      remark: surplus.remark.trim() || undefined,
    }),
  )
  if (succeeded) surplus.taskId = 0
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
      <dl v-if="quantitySummary" class="flow-facts">
        <div>
          <dt>在制</dt>
          <dd>{{ quantitySummary.activeQuantity }}</dd>
        </div>
        <div>
          <dt>已发货</dt>
          <dd>{{ quantitySummary.shippedQuantity }}</dd>
        </div>
        <div>
          <dt>余品</dt>
          <dd>{{ quantitySummary.surplusQuantity }}</dd>
        </div>
        <div>
          <dt>报废</dt>
          <dd>{{ quantitySummary.scrappedQuantity }}</dd>
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
              >进入 <b>{{ task.plannedQuantity }}</b></span
            >
            <span
              >合格 <b>{{ task.completedQuantity }}</b></span
            >
            <span
              >报废 <b>{{ task.scrappedQuantity }}</b></span
            >
            <span
              >待处理 <b>{{ task.remainingToProcess }}</b></span
            >
            <span
              >可转 <b>{{ task.availableToTransfer }}</b></span
            >
          </div>
          <div class="quantity-progress">
            <i
              :style="{
                width: `${Math.min(100, ((task.completedQuantity + task.scrappedQuantity + task.assignedOutQuantity) / task.plannedQuantity) * 100)}%`,
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
                    item.processId === task.processId &&
                    item.type !== 'BUFFER' &&
                    item.terminalKind !== 'SURPLUS',
                )"
                :key="station.id"
                :value="station.id"
              >
                {{ station.name }}
              </option></select
            ><input
              v-model.number="assignQuantities[task.id]"
              type="number"
              min="1"
              :max="task.remainingToProcess"
              inputmode="numeric"
              aria-label="分配数量"
            /><button
              type="button"
              :disabled="
                actionLoading ||
                !assignStations[task.id] ||
                assignQuantities[task.id] < 1 ||
                assignQuantities[task.id] > task.remainingToProcess
              "
              @click="submitAssignment(task)"
            >
              分批分配
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
                run(
                  isShippingTask(task) ? '发货数量已更新' : '完成数量已更新',
                  () => updateCompleted(task.id, Number(quantities[task.id])),
                )
              "
            >
              {{ isShippingTask(task) ? '更新发货量' : '更新完成量' }}
            </button>
          </div>
          <div class="action-grid">
            <button
              v-if="
                task.status === 'PENDING' && task.workstation?.type !== 'BUFFER'
              "
              type="button"
              :disabled="actionLoading"
              @click="
                run(isShippingTask(task) ? '发货已开始' : '任务已开始', () =>
                  taskAction(task.id, 'start'),
                )
              "
            >
              {{ isShippingTask(task) ? '开始发货' : '开始加工' }}
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
                task.status === 'PAUSED' &&
                task.workstation?.type === 'DEVICE' &&
                task.remainingToProcess > 0
              "
              class="secondary"
              type="button"
              :disabled="actionLoading || !hasReassignTarget(task)"
              @click="openReassign(task)"
            >
              改派机器
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
                task.remainingToProcess === 0
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
            <button
              v-if="scrapAvailable(task) > 0"
              class="danger-button"
              type="button"
              :disabled="actionLoading"
              @click="openScrap(task)"
            >
              报废
            </button>
            <button
              v-if="
                task.workstation?.code === 'SHIPPING_BUFFER' &&
                task.status === 'PENDING' &&
                task.remainingToProcess > 0
              "
              class="surplus-button"
              type="button"
              :disabled="actionLoading"
              @click="openSurplus(task)"
            >
              转余品区
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

      <section v-if="reassignTaskItem" class="transfer-panel">
        <header>
          <div>
            <p>REASSIGN</p>
            <h2>同工序改派机器</h2>
          </div>
          <button
            type="button"
            aria-label="关闭改派"
            @click="reassign.taskId = 0"
          >
            ×
          </button>
        </header>
        <label
          ><span>改派数量 · 最多 {{ reassignTaskItem.remainingToProcess }}</span
          ><input
            v-model.number="reassign.quantity"
            type="number"
            min="1"
            :max="reassignTaskItem.remainingToProcess"
            inputmode="numeric"
        /></label>
        <label
          ><span>目标机器</span
          ><select v-model.number="reassign.targetWorkstationId">
            <option :value="0">请选择</option>
            <option
              v-for="station in reassignStations"
              :key="station.id"
              :value="station.id"
            >
              {{ station.name }}
            </option>
          </select></label
        >
        <button
          class="confirm-transfer"
          type="button"
          :disabled="
            actionLoading ||
            !reassign.targetWorkstationId ||
            reassign.quantity < 1 ||
            reassign.quantity > reassignTaskItem.remainingToProcess
          "
          @click="submitReassign"
        >
          确认改派
        </button>
      </section>

      <section v-if="scrapTaskItem" class="transfer-panel">
        <header>
          <div>
            <p>SCRAP</p>
            <h2>登记报废</h2>
          </div>
          <button type="button" aria-label="关闭报废" @click="scrap.taskId = 0">
            ×
          </button>
        </header>
        <label
          ><span>报废数量 · 最多 {{ scrapAvailable(scrapTaskItem) }}</span
          ><input
            v-model.number="scrap.quantity"
            type="number"
            min="1"
            :max="scrapAvailable(scrapTaskItem)"
            inputmode="numeric"
        /></label>
        <label
          ><span>报废原因</span
          ><input
            v-model.trim="scrap.reason"
            type="text"
            maxlength="200"
            placeholder="请输入报废原因"
        /></label>
        <label
          ><span>备注（选填）</span
          ><input v-model.trim="scrap.remark" type="text" maxlength="500"
        /></label>
        <button
          class="confirm-transfer danger-button"
          type="button"
          :disabled="
            actionLoading ||
            !scrap.reason ||
            scrap.quantity < 1 ||
            scrap.quantity > scrapAvailable(scrapTaskItem)
          "
          @click="submitScrap"
        >
          确认报废
        </button>
      </section>

      <section v-if="surplusTaskItem" class="transfer-panel">
        <header>
          <div>
            <p>SURPLUS</p>
            <h2>转入余品区</h2>
          </div>
          <button
            type="button"
            aria-label="关闭转余品"
            @click="surplus.taskId = 0"
          >
            ×
          </button>
        </header>
        <label
          ><span>转入数量 · 最多 {{ surplusTaskItem.remainingToProcess }}</span
          ><input
            v-model.number="surplus.quantity"
            type="number"
            min="1"
            :max="surplusTaskItem.remainingToProcess"
            inputmode="numeric"
        /></label>
        <label
          ><span>备注（选填）</span
          ><input v-model.trim="surplus.remark" type="text" maxlength="500"
        /></label>
        <button
          class="confirm-transfer surplus-button"
          type="button"
          :disabled="
            actionLoading ||
            surplus.quantity < 1 ||
            surplus.quantity > surplusTaskItem.remainingToProcess
          "
          @click="submitSurplus"
        >
          确认转入余品区
        </button>
      </section>

      <section v-if="order.batches[0]?.transfers?.length" class="history">
        <p>TRANSFER HISTORY</p>
        <h2>转序记录</h2>
        <ul>
          <li v-for="item in order.batches[0].transfers" :key="item.id">
            <span
              >{{ transferLabel(item.kind) }} ·
              {{ item.fromTask.process.name }} →
              {{
                item.toTask.workstation?.name ?? item.toTask.process.name
              }}</span
            ><strong>{{ item.quantity }}</strong
            ><small>{{ item.operator.name }}</small>
          </li>
        </ul>
      </section>
      <section v-if="order.batches[0]?.scrapRecords?.length" class="history">
        <p>SCRAP HISTORY</p>
        <h2>报废记录</h2>
        <ul>
          <li v-for="item in order.batches[0].scrapRecords" :key="item.id">
            <span
              >{{ item.process.name }} ·
              {{ item.workstation?.name ?? '未分配位置' }} ·
              {{ item.reason }}</span
            ><strong>{{ item.quantity }}</strong
            ><small>{{ item.operator.name }}</small>
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
.flow-facts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
}
.flow-facts div {
  padding: 10px;
  border-right: 1px solid var(--color-border);
}
.flow-facts div:last-child {
  border: 0;
}
.flow-facts dt {
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.flow-facts dd {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 800;
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
  flex-wrap: wrap;
  gap: 6px 14px;
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
.action-grid button.danger-button,
.transfer-panel button.danger-button {
  background: var(--color-danger);
}
.action-grid button.surplus-button,
.transfer-panel button.surplus-button {
  background: var(--color-warning);
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
