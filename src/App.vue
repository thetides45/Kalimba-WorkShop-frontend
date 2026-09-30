<script setup>
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
// 工作台全屏：不带门户顶栏/footer/container 包裹
const fullscreen = computed(() => !!route.meta.fullscreen);
onMounted(async () => {
  await auth.refreshMe();
  auth.fetchUnread();
});
</script>

<template>
  <div v-if="fullscreen" class="fullscreen-host">
    <router-view />
  </div>
  <div v-else class="app-shell">
    <header class="topbar">
      <div class="container topbar-inner">
        <router-link to="/" class="logo">
          <span class="brandmark">琴</span><span>卡林巴社区工坊</span>
        </router-link>
        <nav class="nav">
          <router-link to="/square">社区广场</router-link>
          <router-link to="/workbench">制谱</router-link>
          <router-link to="/offline">离线版</router-link>
        </nav>
        <div class="right">
          <template v-if="auth.isLogin">
            <router-link to="/publish" class="btn btn-primary btn-sm">发布作品</router-link>
            <router-link to="/notifications" class="icon-btn">
              🔔<span v-if="auth.unread" class="badge">{{ auth.unread > 99 ? '99+' : auth.unread }}</span>
            </router-link>
            <router-link :to="auth.user ? '/users/' + auth.user.id : '/login'" class="avatar">{{ (auth.user && (auth.user.nickname || auth.user.username) || '?')[0] }}</router-link>
            <button class="link-btn" @click="auth.logout(); $router.push('/')">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="btn btn-ghost btn-sm">登录</router-link>
          </template>
        </div>
      </div>
    </header>
    <main class="container main">
      <router-view />
    </main>
    <footer class="footer">
      <div class="container">卡林巴转谱工坊 · 本地优先的 Web 制谱平台与乐谱分享社区</div>
    </footer>
  </div>
</template>

<style scoped>
/* 布局骨架 + 顶栏品牌标记；其余顶栏样式由 global.css（V3 风）接管 */
.fullscreen-host { min-height: 100vh; }
.app-shell { display: flex; flex-direction: column; min-height: 100vh; }
.brandmark {
  width: 34px; height: 34px; border-radius: 10px;
  background: var(--wood); color: #F7F2E8;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--serif); font-size: 17px; font-weight: 700;
}
</style>
