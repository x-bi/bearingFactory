<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import {
  createOrder,
  getProcesses,
  getWorkstations,
  type ProcessItem,
  type WorkstationItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const router = useRouter()
const processes = ref<ProcessItem[]>([])
const workstations = ref<WorkstationItem[]>([])
const loading = ref(false)
const errorMessage = ref('')
const form = reactive({
  model: '',
  customer: '',
  quantity: 0,
  batchNo: '',
  dueDate: '',
  remark: '',
})
type InitialTask = {
  quantity: number
  startProcessId: number
  startWorkstationId: number
}
const initialTasks = ref<InitialTask[]>([])
const allocatedQuantity = computed(() =>
  initialTasks.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
)
const quantityMatches = computed(
  () =>
    Number(form.quantity) > 0 &&
    allocatedQuantity.value === Number(form.quantity),
)

function selectableWorkstations(task: InitialTask) {
  const process = processes.value.find(
    (item) => item.id === task.startProcessId,
  )
  return workstations.value.filter(
    (item) =>
      item.processId === task.startProcessId &&
      item.terminalKind !== 'SURPLUS' &&
      (item.type === 'BUFFER' ||
        (process?.executionMode === 'MACHINE' && item.type === 'DEVICE') ||
        (process?.executionMode === 'AREA' && item.type === 'AREA')),
  )
}

function resetTaskStation(task: InitialTask) {
  task.startWorkstationId =
    selectableWorkstations(task).find((item) => item.type === 'BUFFER')?.id ?? 0
}

function addTask() {
  const task: InitialTask = {
    quantity: 0,
    startProcessId:
      processes.value.find((item) => item.code === 'CASTING')?.id ??
      processes.value[0]?.id ??
      0,
    startWorkstationId: 0,
  }
  resetTaskStation(task)
  initialTasks.value.push(task)
}

async function submit() {
  if (loading.value) return
  if (!quantityMatches.value) {
    errorMessage.value = '各份起始数量之和必须等于生产单总数量'
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const order = await createOrder({
      model: form.model,
      customer: form.customer,
      quantity: Number(form.quantity),
      batchNo: form.batchNo.trim(),
      initialTasks: initialTasks.value.map((item) => ({
        quantity: Number(item.quantity),
        startProcessId: Number(item.startProcessId),
        ...(item.startWorkstationId
          ? { startWorkstationId: Number(item.startWorkstationId) }
          : {}),
      })),
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.remark ? { remark: form.remark } : {}),
    })
    await router.replace(`/orders/${order.id}`)
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '生产单创建失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    ;[processes.value, workstations.value] = await Promise.all([
      getProcesses(),
      getWorkstations(),
    ])
    form.batchNo = `B${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-01`
    addTask()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '起始工序和位置加载失败')
  }
})
</script>

<template>
  <AppShell title="新建生产单" back>
    <section class="form-intro">
      <p>CREATE ORDER</p>
      <h2>录入生产单与起始任务</h2>
      <span>一个批次码下可拆成多份起始任务，每份选择自己的工序和位置。</span>
    </section>
    <form class="order-form" @submit.prevent="submit">
      <div class="field-grid">
        <label
          ><span>型号 *</span
          ><input
            v-model.trim="form.model"
            required
            maxlength="64"
            placeholder="例如 6208"
        /></label>
        <label
          ><span>客户 *</span
          ><input
            v-model.trim="form.customer"
            required
            maxlength="120"
            placeholder="客户名称"
        /></label>
        <label
          ><span>总数量 *</span
          ><input
            v-model.number="form.quantity"
            required
            type="number"
            min="1"
            inputmode="numeric"
            placeholder="2000"
        /></label>
        <label
          ><span>批次号 *</span
          ><input v-model.trim="form.batchNo" required maxlength="64"
        /></label>
        <label
          ><span>交期</span><input v-model="form.dueDate" type="date"
        /></label>
      </div>
      <section class="batch-section">
        <header>
          <div>
            <h3>起始任务</h3>
            <p>
              已分配 {{ allocatedQuantity }} / {{ Number(form.quantity) || 0 }}
            </p>
          </div>
          <button type="button" @click="addTask">+ 拆分一份</button>
        </header>
        <article
          v-for="(task, index) in initialTasks"
          :key="index"
          class="batch-card"
        >
          <div class="batch-card-title">
            <strong>第 {{ index + 1 }} 份</strong>
            <button
              v-if="initialTasks.length > 1"
              type="button"
              @click="initialTasks.splice(index, 1)"
            >
              移除
            </button>
          </div>
          <div class="field-grid">
            <label
              ><span>数量 *</span
              ><input
                v-model.number="task.quantity"
                required
                type="number"
                min="1"
                inputmode="numeric"
            /></label>
            <label
              ><span>起始工序 *</span>
              <select
                v-model.number="task.startProcessId"
                required
                @change="resetTaskStation(task)"
              >
                <option
                  v-for="process in processes"
                  :key="process.id"
                  :value="process.id"
                >
                  {{ process.name }}
                </option>
              </select>
            </label>
            <label
              ><span>起始工作位置</span>
              <select v-model.number="task.startWorkstationId">
                <option :value="0">
                  {{
                    selectableWorkstations(task).some(
                      (item) => item.type === 'BUFFER',
                    )
                      ? '自动进入待加工区'
                      : '暂不分配'
                  }}
                </option>
                <option
                  v-for="station in selectableWorkstations(task)"
                  :key="station.id"
                  :value="station.id"
                >
                  {{ station.name }} · {{ station.type }}
                </option>
              </select>
            </label>
          </div>
        </article>
        <small
          >所有起始任务共用上方批次号；进入相同工序和位置时可按现有规则合并。</small
        >
      </section>
      <label
        ><span>备注</span
        ><textarea
          v-model.trim="form.remark"
          maxlength="500"
          rows="3"
          placeholder="可选，记录现场说明"
        />
      </label>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <button
        class="submit-button"
        type="submit"
        :disabled="loading || !initialTasks.length || !quantityMatches"
      >
        {{ loading ? '正在创建…' : '创建生产单' }}
      </button>
    </form>
  </AppShell>
</template>

<style scoped>
.form-intro {
  padding: 20px;
  border-radius: 7px;
  background: var(--color-bg-inverse);
  color: white;
}
.form-intro p,
.form-intro h2,
.form-intro span {
  margin: 0;
}
.form-intro p {
  color: #8fa2b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.form-intro h2 {
  margin-top: 5px;
  font-size: 22px;
}
.form-intro span {
  display: block;
  margin-top: 8px;
  color: #b9c4d0;
  font-size: 11px;
}
.order-form {
  display: grid;
  gap: 17px;
  margin-top: 14px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  box-shadow: var(--shadow-card);
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
}
.batch-section {
  display: grid;
  gap: 12px;
}
.batch-section header,
.batch-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.batch-section h3,
.batch-section p {
  margin: 0;
}
.batch-section p,
.batch-section > small {
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.batch-section button {
  padding: 7px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: white;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
}
.batch-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: #fafbfc;
}
label > span {
  display: block;
  margin-bottom: 7px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: #fafbfc;
  outline: none;
}
input,
select {
  height: 44px;
  padding: 0 11px;
}
textarea {
  padding: 10px 11px;
  resize: vertical;
}
input:focus,
select:focus,
textarea:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-soft);
}
label small {
  display: block;
  margin-top: 6px;
  color: var(--color-text-tertiary);
  font-size: 10px;
  line-height: 1.5;
}
.submit-button {
  min-height: 48px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-weight: 800;
}
.submit-button:disabled {
  opacity: 0.6;
}
.error-message {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--color-danger);
  background: #fff5f5;
  color: #a92e2e;
  font-size: 12px;
}
@media (max-width: 420px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
