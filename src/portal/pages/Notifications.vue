<script setup>
import { ref, onMounted } from 'vue';
import { notificationApi } from '@/portal/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const list = ref([]);
const loading = ref(true);

const TYPE_LABEL = { like: '赞了你的作品', comment: '评论了你的帖子', follow: '关注了你', system: '系统通知' };

async function load() {
  loading.value = true;
  try {
    const d = await notificationApi.list();
    list.value = d.records || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function readAll() {
  await notificationApi.readAll();
  list.value.forEach(n => n.isRead = 1);
  auth.fetchUnread();
}
</script>

<template>
  <div>
    <div class="head">
      <h1>消息通知</h1>
      <button class="btn btn-ghost" @click="readAll">全部已读</button>
    </div>
    <div v-if="loading" class="empty"><span class="spinner" /></div>
    <div v-else-if="!list.length" class="empty">暂无通知</div>
    <div v-for="n in list" :key="n.id" class="item card" :class="{ unread: !n.isRead }">
      <span class="dot" v-if="!n.isRead"></span>
      <div class="body">
        <b>{{ n.content || TYPE_LABEL[n.type] || n.type }}</b>
        <span class="muted small">{{ n.createdAt ? new Date(n.createdAt).toLocaleString('zh-CN') : '' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.head h1 { font-size: 20px; margin: 0; }
.item { display: flex; gap: 12px; padding: 14px 16px; margin-bottom: 10px; align-items: center; }
.item.unread { border-left: 3px solid var(--brand); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }
.body { display: flex; flex-direction: column; }
</style>
