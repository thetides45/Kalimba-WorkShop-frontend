<script setup>
defineProps({
  post: { type: Object, required: true },
  fmt: { type: Function, required: true },
});
</script>

<template>
  <router-link :to="'/posts/' + post.id" class="post-card card">
    <div class="thumb" v-if="post.cover" :style="{ backgroundImage: 'url(' + post.cover + ')' }"></div>
    <div class="body">
      <div class="title">{{ post.title }}</div>
      <div class="meta small muted">👍 {{ post.likeCount }} · 👀 {{ post.viewCount }} · {{ fmt(post.createdAt) }}</div>
    </div>
  </router-link>
</template>

<style scoped>
.post-card { display: flex; gap: 12px; padding: 12px; margin-bottom: 12px; }
.post-card:hover { border-color: var(--brand); }
.thumb { width: 72px; height: 54px; border-radius: 6px; background: var(--bg-soft) center/cover; flex-shrink: 0; }
.body { flex: 1; min-width: 0; }
.title { font-weight: 600; color: var(--ink); }
.meta { margin-top: 4px; }
.post-card:hover .title { color: var(--brand-ink); }
</style>
