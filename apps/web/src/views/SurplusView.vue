<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { getSurplus, type SurplusItem } from '@/api/flow'
import { getApiErrorMessage } from '@/utils/api-error'

const items = ref<SurplusItem[]>([])
const keyword = ref('')
const total = ref(0)
const summaryQuantity = ref(0)
const loading = ref(true)
const errorMessage = ref('')

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getSurplus({
      page: 1,
      pageSize: 100,
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
    })
    items.value = result.items
    total.value = result.total
    summaryQuantity.value = result.summaryQuantity
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, '余品记录加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppShell title="余品区">
    <section class="summary-card">
      <div>
        <p>SURPLUS LEDGER</p>
        <h2>余品永久台账</h2>
      </div>
      <strong>{{ summaryQuantity }} 件</strong>
    </section>
    <form class="search-bar" @submit.prevent="load">
      <input v-model.trim="keyword" placeholder="生产单号 / 型号 / 批次" />
      <button type="submit">查询</button>
    </form>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    <p v-if="loading" class="message">正在读取余品记录…</p>
    <section v-else class="ledger">
      <header>
        <h2>转入记录</h2>
        <span>{{ total }} 条</span>
      </header>
      <p v-if="!items.length" class="empty">暂无余品记录</p>
      <RouterLink
        v-for="item in items"
        :key="item.id"
        class="ledger-item"
        :to="`/orders/${item.orderId}`"
      >
        <div>
          <small>{{ item.orderNo }} · {{ item.batchNo }}</small>
          <h3>{{ item.model }}</h3>
          <p>{{ item.customer }}</p>
        </div>
        <div class="quantity">
          <strong>{{ item.currentQuantity }}</strong
          ><small
            >转入 {{ item.transferredQuantity }} · 报废
            {{ item.scrappedQuantity }}</small
          >
        </div>
        <footer>
          <span>{{ new Date(item.transferredAt).toLocaleString() }}</span
          ><span>{{ item.operator.name }}</span>
        </footer>
      </RouterLink>
    </section>
  </AppShell>
</template>

<style scoped>
.summary-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-radius: 7px;
  background: var(--color-bg-inverse);
  color: white;
}
.summary-card p,
.summary-card h2 {
  margin: 0;
}
.summary-card p {
  color: #8fa2b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.summary-card h2 {
  margin-top: 5px;
  font-size: 22px;
}
.summary-card strong {
  align-self: center;
  color: #f5b942;
  font-size: 22px;
}
.search-bar {
  display: flex;
  margin: 12px 0;
}
.search-bar input {
  min-width: 0;
  height: 44px;
  flex: 1;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 4px 0 0 4px;
}
.search-bar button {
  width: 76px;
  border: 0;
  border-radius: 0 4px 4px 0;
  background: var(--color-brand);
  color: white;
  font-weight: 800;
}
.ledger {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: white;
  box-shadow: var(--shadow-card);
}
.ledger > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
}
.ledger h2 {
  margin: 0;
  font-size: 17px;
}
.ledger > header span {
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 800;
}
.ledger-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 15px 17px;
  border-bottom: 1px solid var(--color-border);
  color: inherit;
  text-decoration: none;
}
.ledger-item:last-child {
  border: 0;
}
.ledger-item small,
.ledger-item h3,
.ledger-item p {
  margin: 0;
}
.ledger-item small,
.ledger-item p {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
.ledger-item h3 {
  margin: 4px 0;
  font-size: 17px;
}
.quantity {
  text-align: right;
}
.quantity strong,
.quantity small {
  display: block;
}
.quantity strong {
  color: var(--color-warning);
  font-size: 21px;
}
.ledger-item footer {
  grid-column: 1/-1;
  display: flex;
  justify-content: space-between;
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.message,
.empty {
  padding: 24px;
  background: white;
  color: var(--color-text-tertiary);
  text-align: center;
}
.message.error {
  color: var(--color-danger);
}
</style>
