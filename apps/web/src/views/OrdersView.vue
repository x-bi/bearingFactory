<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { getOrders, type ProductionOrderItem } from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const orders = ref<ProductionOrderItem[]>([])
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const errorMessage = ref('')
const labels: Record<string, string> = {
  UNSCHEDULED: '未排产',
  PENDING: '待加工',
  PROCESSING: '加工中',
  PAUSED: '暂停',
  COMPLETED: '已完成',
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    orders.value = (
      await getOrders({
        ...(keyword.value ? { keyword: keyword.value } : {}),
        ...(status.value ? { status: status.value } : {}),
      })
    ).items
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '生产单加载失败')
  } finally {
    loading.value = false
  }
}

function selectStatus(value: string) {
  status.value = value
  void load()
}
onMounted(load)
</script>

<template>
  <AppShell title="生产单">
    <div class="order-toolbar">
      <form @submit.prevent="load">
        <input
          v-model.trim="keyword"
          placeholder="型号 / 客户 / 单号 / 批次"
        /><button type="submit">搜索</button>
      </form>
      <RouterLink to="/orders/new">+ 新建</RouterLink>
    </div>
    <div class="status-tabs">
      <button
        v-for="item in [
          { v: '', l: '全部' },
          { v: 'PROCESSING', l: '加工中' },
          { v: 'PENDING', l: '待加工' },
          { v: 'UNSCHEDULED', l: '未排产' },
          { v: 'COMPLETED', l: '已完成' },
        ]"
        :key="item.v"
        :class="{ active: status === item.v }"
        type="button"
        @click="selectStatus(item.v)"
      >
        {{ item.l }}
      </button>
    </div>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    <p v-else-if="loading" class="message">正在读取生产单…</p>
    <p v-else-if="!orders.length" class="message">暂无符合条件的生产单</p>
    <section v-else class="order-list">
      <RouterLink
        v-for="order in orders"
        :key="order.id"
        class="order-card"
        :to="`/orders/${order.id}`"
      >
        <div class="order-card__head">
          <div>
            <small>{{ order.orderNo }}</small>
            <h2>{{ order.model }}</h2>
          </div>
          <span :class="`is-${order.status.toLowerCase()}`">{{
            labels[order.status] ?? order.status
          }}</span>
        </div>
        <dl>
          <div>
            <dt>客户</dt>
            <dd>{{ order.customer }}</dd>
          </div>
          <div>
            <dt>数量</dt>
            <dd>{{ order.quantity }}</dd>
          </div>
          <div>
            <dt>批次</dt>
            <dd>{{ order.batches[0]?.batchNo ?? '--' }}</dd>
          </div>
          <div>
            <dt>当前工序</dt>
            <dd>{{ order.batches[0]?.tasks[0]?.process?.name ?? '待分配' }}</dd>
          </div>
        </dl>
        <div class="progress">
          <i
            :style="{
              width: `${Math.min(100, ((order.batches[0]?.tasks.reduce((s, t) => s + t.completedQuantity, 0) ?? 0) / Math.max(order.quantity, 1)) * 100)}%`,
            }"
          />
        </div>
      </RouterLink>
    </section>
  </AppShell>
</template>

<style scoped>
.order-toolbar {
  display: flex;
  gap: 10px;
}
.order-toolbar form {
  display: flex;
  flex: 1;
}
.order-toolbar input {
  min-width: 0;
  height: 44px;
  flex: 1;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px 0 0 4px;
  background: white;
}
.order-toolbar button,
.order-toolbar a {
  display: grid;
  min-width: 58px;
  place-items: center;
  border: 0;
  border-radius: 0 4px 4px 0;
  background: var(--color-bg-inverse);
  color: white;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}
.order-toolbar a {
  min-width: 68px;
  border-radius: 4px;
  background: var(--color-brand);
}
.status-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  margin: 14px -16px;
  padding: 0 16px;
  scrollbar-width: none;
}
.status-tabs button {
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: white;
  color: var(--color-text-secondary);
  font-size: 11px;
}
.status-tabs button.active {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-weight: 800;
}
.order-list {
  display: grid;
  gap: 12px;
}
.order-card {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-brand);
  border-radius: 6px;
  background: white;
  color: inherit;
  box-shadow: var(--shadow-card);
  text-decoration: none;
}
.order-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.order-card__head small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.order-card h2 {
  margin: 4px 0 0;
  font-size: 20px;
}
.order-card__head span {
  padding: 5px 7px;
  border-radius: 3px;
  background: #eef1f4;
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
}
.order-card__head span.is-processing {
  background: #edf9f2;
  color: var(--color-success);
}
.order-card__head span.is-pending {
  background: #fff5f5;
  color: var(--color-danger);
}
.order-card__head span.is-paused {
  background: #fff4e6;
  color: var(--color-warning);
}
.order-card__head span.is-completed {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}
dl {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 18px;
  margin: 16px 0;
}
dl div {
  min-width: 0;
}
dt {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
dd {
  overflow: hidden;
  margin: 3px 0 0;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress {
  height: 4px;
  overflow: hidden;
  background: #e7eaee;
}
.progress i {
  display: block;
  height: 100%;
  background: var(--color-brand);
}
.message {
  padding: 30px 16px;
  color: var(--color-text-secondary);
  text-align: center;
  font-size: 12px;
}
.message.error {
  color: var(--color-danger);
}
</style>
