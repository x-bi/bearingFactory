<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import {
  createMachine,
  deleteMachine,
  getMachines,
  getProcesses,
  updateMachine,
  type MachineItem,
  type ProcessItem,
} from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const machines = ref<MachineItem[]>([])
const processes = ref<ProcessItem[]>([])
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const notice = ref('')
const editingId = ref(0)
const form = reactive({ code: '', name: '', processId: 0 })
const machineProcesses = computed(() =>
  processes.value.filter((item) => item.executionMode === 'MACHINE'),
)

async function load() {
  loading.value = true
  try {
    ;[machines.value, processes.value] = await Promise.all([
      getMachines(),
      getProcesses(),
    ])
    if (!editingId.value && !form.processId)
      form.processId = machineProcesses.value[0]?.id ?? 0
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '机器列表加载失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = 0
  form.code = ''
  form.name = ''
  form.processId = machineProcesses.value[0]?.id ?? 0
}

function startEdit(machine: MachineItem) {
  editingId.value = machine.id
  form.code = machine.code
  form.name = machine.name
  form.processId = machine.processId ?? 0
  errorMessage.value = ''
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    if (editingId.value) {
      await updateMachine(editingId.value, { ...form })
      notice.value = '机器信息已更新'
    } else {
      await createMachine({ ...form })
      notice.value = '机器已增加'
    }
    resetForm()
    await load()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function removeMachine(machine: MachineItem) {
  if (saving.value) return
  if (!window.confirm(`确定删除机器“${machine.name}”吗？此操作不可撤销。`))
    return
  saving.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await deleteMachine(machine.id)
    if (editingId.value === machine.id) resetForm()
    notice.value = '机器已删除'
    await load()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function toggle(machine: MachineItem) {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await updateMachine(machine.id, { enabled: !machine.enabled })
    notice.value = machine.enabled ? '机器已停用' : '机器已启用'
    await load()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppShell title="机器管理">
    <section class="create-card">
      <p>MACHINE REGISTER</p>
      <h2>{{ editingId ? '编辑机器' : '增加机器' }}</h2>
      <form @submit.prevent="submit">
        <label
          ><span>机器类型</span
          ><select v-model.number="form.processId" required>
            <option
              v-for="process in machineProcesses"
              :key="process.id"
              :value="process.id"
            >
              {{ process.name }}
            </option>
          </select></label
        >
        <label
          ><span>机器名称</span
          ><input
            v-model.trim="form.name"
            maxlength="100"
            required
            placeholder="例如：粗车3"
        /></label>
        <label
          ><span>机器编码</span
          ><input
            v-model.trim="form.code"
            maxlength="50"
            required
            placeholder="例如：ROUGH_03"
        /></label>
        <p class="layout-hint">
          位置由系统按照工序顺序自动排列，无需填写坐标。
        </p>
        <div class="form-actions">
          <button type="submit" :disabled="saving || !form.processId">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '增加机器' }}
          </button>
          <button
            v-if="editingId"
            type="button"
            class="cancel-button"
            :disabled="saving"
            @click="resetForm"
          >
            取消编辑
          </button>
        </div>
      </form>
    </section>
    <p v-if="notice" class="message success">{{ notice }}</p>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    <section class="machine-list">
      <header>
        <h2>机器列表</h2>
        <span>{{ machines.length }} 台</span>
      </header>
      <p v-if="loading" class="message">正在读取机器…</p>
      <article
        v-for="machine in machines"
        :key="machine.id"
        :class="{ disabled: !machine.enabled }"
      >
        <div>
          <small>{{ machine.process?.name }} · {{ machine.code }}</small>
          <h3>{{ machine.name }}</h3>
          <p>工序内顺序 {{ machine.sort }}</p>
        </div>
        <div class="machine-actions">
          <button type="button" :disabled="saving" @click="startEdit(machine)">
            编辑
          </button>
          <button type="button" :disabled="saving" @click="toggle(machine)">
            {{ machine.enabled ? '停用' : '启用' }}
          </button>
          <button
            type="button"
            class="delete-button"
            :disabled="saving"
            @click="removeMachine(machine)"
          >
            删除
          </button>
        </div>
      </article>
    </section>
  </AppShell>
</template>

<style scoped>
.create-card,
.machine-list {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  box-shadow: var(--shadow-card);
}
.create-card {
  padding: 17px;
}
.create-card > p,
.create-card > h2 {
  margin: 0;
}
.create-card > p {
  color: var(--color-text-tertiary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.create-card > h2 {
  margin-top: 3px;
  font-size: 19px;
}
.create-card form {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
label span {
  display: block;
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
}
input,
select {
  width: 100%;
  height: 42px;
  padding: 0 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: #fafbfc;
}
.layout-hint {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--color-info);
  background: #f4f8fc;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}
.form-actions {
  display: flex;
  gap: 8px;
}
.create-card .form-actions button {
  flex: 1;
  min-height: 46px;
  border: 0;
  border-radius: 4px;
  background: var(--color-brand);
  color: white;
  font-weight: 800;
}
.create-card .form-actions .cancel-button {
  border: 1px solid var(--color-border-strong);
  background: white;
  color: var(--color-text-secondary);
}
.machine-list {
  margin-top: 12px;
}
.machine-list > header {
  display: flex;
  justify-content: space-between;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
}
.machine-list h2 {
  margin: 0;
  font-size: 17px;
}
.machine-list header span {
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 800;
}
article {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
}
article.disabled {
  opacity: 0.55;
}
article small,
article h3,
article p {
  margin: 0;
}
article small,
article p {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
article h3 {
  margin: 4px 0;
  font-size: 16px;
}
article button {
  min-width: 64px;
  min-height: 36px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px;
  background: white;
  font-weight: 800;
}
.machine-actions {
  display: flex;
  align-self: center;
  gap: 6px;
}
.machine-actions .delete-button {
  border-color: color-mix(in srgb, var(--color-danger), transparent 60%);
  color: var(--color-danger);
}
.message {
  padding: 12px;
  text-align: center;
}
.message.success {
  color: var(--color-success);
}
.message.error {
  color: var(--color-danger);
}
button:disabled {
  opacity: 0.55;
}
@media (max-width: 520px) {
  article {
    align-items: flex-start;
    flex-direction: column;
  }
  .machine-actions {
    align-self: stretch;
  }
  .machine-actions button {
    flex: 1;
  }
}
</style>
