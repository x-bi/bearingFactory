import { nextTick } from 'vue'

export async function refreshPreservingScroll(
  refresh: () => Promise<void>,
) {
  const scrollTop = window.scrollY
  await refresh()
  await nextTick()
  window.scrollTo({ top: scrollTop, behavior: 'auto' })
}
