<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
  startProcessId: 0,
  startWorkstationId: 0,
  remark: '',
})
const selectedProcess = computed(() =>
  processes.value.find((item) => item.id === form.startProcessId),
)

async function loadWorkstations() {
  form.startWorkstationId = 0
  workstations.value = selectedProcess.value
    ? await getWorkstations(selectedProcess.value.code)
    : []
}

async function submit() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const order = await createOrder({
      model: form.model,
      customer: form.customer,
      quantity: Number(form.quantity),
      batchNo: form.batchNo,
      startProcessId: Number(form.startProcessId),
      ...(form.startWorkstationId
        ? { startWorkstationId: Number(form.startWorkstationId) }
        : {}),
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

watch(() => form.startProcessId, loadWorkstations)
onMounted(async () => {
  processes.value = await getProcesses()
  const rough = processes.value.find((item) => item.code === 'ROUGH_TURNING')
  form.startProcessId = rough?.id ?? processes.value[0]?.id ?? 0
  form.batchNo = `B${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-01`
})
</script>

<template>
  <AppShell title="新建生产单" back>
    <section class="form-intro">
      <p>CREATE ORDER</p>
      <h2>录入第一批生产任务</h2>
      <span>创建后自动生成一个批次和起始工序任务。</span>
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
        <label
          ><span>起始工序 *</span
          ><select v-model.number="form.startProcessId" required>
            <option
              v-for="process in processes"
              :key="process.id"
              :value="process.id"
            >
              {{ process.name }}
            </option>
          </select></label
        >
      </div>
      <label
        ><span>起始工作位置</span
        ><select v-model.number="form.startWorkstationId">
          <option :value="0">暂不分配</option>
          <option
            v-for="station in workstations"
            :key="station.id"
            :value="station.id"
          >
            {{ station.name }} · {{ station.type }}
          </option></select
        ><small>暂不分配时任务保持“未排产”，可在详情中分配。</small></label
      >
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
        :disabled="loading || !form.startProcessId"
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
