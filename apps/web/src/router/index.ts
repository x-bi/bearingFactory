import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/workshop',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/workshop',
      name: 'workshop',
      component: () => import('@/views/WorkshopView.vue'),
    },
    {
      path: '/workstations/:id',
      name: 'workstation-detail',
      component: () => import('@/views/WorkstationDetailView.vue'),
    },
    {
      path: '/orders',
      name: 'orders',
      component: () => import('@/views/OrdersView.vue'),
    },
    {
      path: '/orders/new',
      name: 'order-create',
      component: () => import('@/views/OrderCreateView.vue'),
    },
    {
      path: '/orders/:id',
      name: 'order-detail',
      component: () => import('@/views/OrderDetailView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) return '/login'
  if (to.path === '/login' && auth.isLoggedIn) return '/workshop'
  return true
})

export default router
