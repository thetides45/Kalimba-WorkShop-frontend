import { createRouter, createWebHistory } from 'vue-router';

/**
 * 路由：社区门户为主，工作台（制谱）与帖子详情是重头。
 * 「制谱」页复用内核 studio（WBS 6 才做 Vue 化整合，这里先放离线版入口 + 占位）。
 */
const routes = [
  { path: '/', name: 'home', component: () => import('@/portal/pages/Home.vue'), meta: { title: '首页' } },
  { path: '/square', name: 'square', component: () => import('@/portal/pages/Square.vue'), meta: { title: '社区广场' } },
  { path: '/posts/:id', name: 'post', component: () => import('@/portal/pages/PostDetail.vue'), meta: { title: '帖子详情' } },
  { path: '/publish', name: 'publish', component: () => import('@/portal/pages/Publish.vue'), meta: { title: '发布', auth: true } },
  { path: '/users/:id', name: 'profile', component: () => import('@/portal/pages/Profile.vue'), meta: { title: '个人中心' } },
  { path: '/notifications', name: 'notifications', component: () => import('@/portal/pages/Notifications.vue'), meta: { title: '消息', auth: true } },
  { path: '/login', name: 'login', component: () => import('@/portal/pages/Login.vue'), meta: { title: '登录' } },
  { path: '/workbench', name: 'workbench', component: () => import('@/portal/pages/Workbench.vue'), meta: { title: '制谱工作台', fullscreen: true } },
  { path: '/offline', name: 'offline', component: () => import('@/portal/pages/Offline.vue'), meta: { title: '离线版下载' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; },
});

router.beforeEach((to) => {
  document.title = (to.meta.title ? to.meta.title + ' · ' : '') + '卡林巴社区工坊';
  if (to.meta.auth) {
    const token = localStorage.getItem('kalimba_token');
    if (!token) return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
