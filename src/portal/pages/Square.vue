<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { postApi } from '@/portal/api';

const route = useRoute();
const posts = ref([]);
const tags = ref([]);
const total = ref(0);
const page = ref(1);
const size = 10;
const tagId = ref(route.query.tag ? Number(route.query.tag) : null);
const sort = ref('latest');
const keyword = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const d = await postApi.list({ page: page.value, size, tagId: tagId.value || undefined, sort: sort.value, keyword: keyword.value || undefined });
    posts.value = d.records || [];
    total.value = d.total || 0;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  tags.value = (await postApi.tags()) || [];
  await load();
});

watch([page, tagId, sort], load);
function search() { page.value = 1; load(); }
function fmt(t) { return t ? new Date(t).toLocaleDateString('zh-CN') : ''; }
</script>

<template>
  <div>
    <div class="toolbar card">
      <input v-model="keyword" class="search" placeholder="搜索作品标题…" @keyup.enter="search" />
      <select v-model="tagId" class="select">
        <option :value="null">全部分类</option>
        <option v-for="t in tags" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select v-model="sort" class="select">
        <option value="latest">最新</option>
        <option value="hot">最热</option>
      </select>
    </div>

    <div v-if="loading" class="empty"><span class="spinner" /></div>
    <div v-else-if="!posts.length" class="empty">没有符合条件的作品</div>
    <template v-else>
      <div class="list">
        <div v-for="p in posts" :key="p.id" class="row card">
          <div class="thumb" v-if="p.cover" :style="{ backgroundImage: 'url(' + p.cover + ')' }"></div>
          <router-link :to="'/posts/' + p.id" class="info">
            <div class="title">{{ p.title }}</div>
            <div class="meta muted small">👍 {{ p.likeCount }} · 👀 {{ p.viewCount }} · {{ fmt(p.createdAt) }}</div>
          </router-link>
          <span v-if="p.scoreFileId" class="score-badge">🎵 附乐谱</span>
        </div>
      </div>
      <div class="pager">
        <button class="btn btn-ghost" :disabled="page <= 1" @click="page--">上一页</button>
        <span class="muted small">{{ page }} / {{ Math.max(1, Math.ceil(total / size)) }}</span>
        <button class="btn btn-ghost" :disabled="page >= Math.ceil(total / size)" @click="page++">下一页</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 10px; padding: 12px; margin-bottom: 16px; }
.search { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; }
.select { border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: var(--card); }
.row { display: flex; align-items: center; gap: 14px; padding: 12px; margin-bottom: 10px; }
.row .thumb { width: 96px; height: 60px; border-radius: 6px; background: var(--bg-soft) center/cover; flex-shrink: 0; }
.info { flex: 1; }
.info:hover { text-decoration: none; }
.title { font-weight: 600; color: var(--ink); }
.row:hover .title { color: var(--brand-ink); }
.meta { margin-top: 4px; }
.score-badge { font-size: 12px; color: var(--brand-ink); }
.pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px; }
</style>
