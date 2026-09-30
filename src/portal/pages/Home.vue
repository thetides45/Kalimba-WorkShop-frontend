<script setup>
import { ref, onMounted } from 'vue';
import { postApi } from '@/portal/api';
import PostCard from '@/portal/components/PostCard.vue';

const hot = ref([]);
const latest = ref([]);
const tags = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const [h, l, t] = await Promise.all([
      postApi.hot(6),
      postApi.list({ page: 1, size: 8, sort: 'latest' }),
      postApi.tags(),
    ]);
    hot.value = h || [];
    latest.value = l.records || [];
    tags.value = t || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function fmt(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
</script>

<template>
  <div>
    <section class="hero">
      <h1>为拇指琴爱好者打造的制谱与分享社区</h1>
      <p class="muted">简谱 / MIDI / MusicXML 一键转卡林巴谱，本地优先、离线可用，作品以乐谱 JSON 自由流转。</p>
      <div class="hero-actions">
        <router-link to="/workbench" class="btn btn-primary">开始制谱</router-link>
        <router-link to="/publish" class="btn btn-ghost">发布作品</router-link>
        <router-link to="/offline" class="btn btn-ghost">下载离线版</router-link>
      </div>
    </section>

    <div v-if="error" class="empty">{{ error }}<br><span class="small">请确认后端已启动（localhost:8080）。</span></div>
    <div v-else-if="loading" class="empty"><span class="spinner" /></div>

    <template v-else>
      <div class="grid">
        <section class="col">
          <h2 class="section-title">🔥 热门作品</h2>
          <div v-if="!hot.length" class="empty">还没有作品，来发布第一篇吧</div>
          <PostCard v-for="p in hot" :key="p.id" :post="p" :fmt="fmt" />
        </section>
        <section class="col">
          <h2 class="section-title">🆕 最新发布</h2>
          <div v-if="!latest.length" class="empty">还没有作品，来发布第一篇吧</div>
          <PostCard v-for="p in latest" :key="p.id" :post="p" :fmt="fmt" />
        </section>
      </div>

      <section class="categories">
        <h2 class="section-title">分类</h2>
        <div class="tag-row">
          <router-link v-for="t in tags" :key="t.id" :to="{ path: '/square', query: { tag: t.id } }" class="tag big">
            {{ t.name }}
          </router-link>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hero { padding: 40px 0 28px; text-align: center; }
.hero h1 { font-size: 28px; margin: 0 0 10px; }
.hero p { max-width: 560px; margin: 0 auto 22px; }
.hero-actions { display: flex; gap: 12px; justify-content: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.section-title { font-size: 17px; margin: 0 0 14px; }
.categories { margin-top: 28px; }
.tag-row { display: flex; gap: 10px; flex-wrap: wrap; }
.tag.big { padding: 6px 16px; font-size: 13px; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
