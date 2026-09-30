<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { postApi, commentApi, interactionApi } from '@/portal/api';
import { useAuthStore } from '@/stores/auth';
import ScorePlayer from '@/portal/components/ScorePlayer.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const post = ref(null);
const comments = ref([]);
const state = ref({ liked: false, favorited: false });
const newComment = ref('');
const replyTo = ref(null);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  try {
    post.value = await postApi.detail(route.params.id);
    const c = await commentApi.list(route.params.id);
    comments.value = c.records || [];
    if (auth.isLogin) {
      state.value = await interactionApi.state(route.params.id);
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function toggleLike() {
  if (!auth.isLogin) return router.push('/login');
  try {
    if (state.value.liked) { await interactionApi.unlike(post.value.id); post.value.likeCount--; }
    else { await interactionApi.like(post.value.id); post.value.likeCount++; }
    state.value.liked = !state.value.liked;
  } catch (e) { window.alert(e.message); }
}

async function toggleFavorite() {
  if (!auth.isLogin) return router.push('/login');
  try {
    if (state.value.favorited) await interactionApi.unfavorite(post.value.id);
    else await interactionApi.favorite(post.value.id);
    state.value.favorited = !state.value.favorited;
  } catch (e) { window.alert(e.message); }
}

async function submitComment() {
  if (!newComment.value.trim()) return;
  try {
    await commentApi.create(post.value.id, { content: newComment.value.trim(), parentId: replyTo.value });
    newComment.value = '';
    replyTo.value = null;
    const c = await commentApi.list(post.value.id);
    comments.value = c.records || [];
  } catch (e) { window.alert(e.message); }
}

function fmt(t) { return t ? new Date(t).toLocaleString('zh-CN') : ''; }
function isTop(c) { return !c.parentId; }
function repliesOf(c) { return comments.value.filter(x => x.parentId === c.id); }
</script>

<template>
  <div>
    <div v-if="loading" class="empty"><span class="spinner" /></div>
    <div v-else-if="error" class="empty">{{ error }}</div>
    <template v-else>
      <article class="card post-body">
        <h1 class="title">{{ post.title }}</h1>
        <div class="meta muted small">作者 #{{ post.userId }} · {{ fmt(post.createdAt) }} · 👀 {{ post.viewCount }}</div>
        <div v-if="post.cover" class="cover" :style="{ backgroundImage: 'url(' + post.cover + ')' }"></div>
        <pre class="content">{{ post.content }}</pre>

        <div class="actions">
          <button class="btn" :class="state.liked ? 'btn-primary' : 'btn-ghost'" @click="toggleLike">
            👍 点赞 {{ post.likeCount }}
          </button>
          <button class="btn" :class="state.favorited ? 'btn-primary' : 'btn-ghost'" @click="toggleFavorite">
            ⭐ {{ state.favorited ? '已收藏' : '收藏' }}
          </button>
        </div>

        <div v-if="post.scoreFileId" class="player-panel">
          <ScorePlayer :file-id="post.scoreFileId" />
        </div>
      </article>

      <section class="comments">
        <h2 class="section-title">评论 {{ comments.length }}</h2>
        <div v-if="auth.isLogin" class="composer card">
          <textarea v-model="newComment" :placeholder="replyTo ? '回复 #' + replyTo + '…' : '写下你的评论…'" rows="2"></textarea>
          <div class="composer-bar">
            <span v-if="replyTo" class="muted small">回复中 <button class="link-btn" @click="replyTo = null">取消</button></span>
            <button class="btn btn-primary" @click="submitComment">发表</button>
          </div>
        </div>
        <div v-else class="empty">登录后参与评论</div>

        <div v-for="c in comments.filter(isTop)" :key="c.id" class="comment card">
          <div class="c-head"><b>#{{ c.userId }}</b><span class="muted small">{{ fmt(c.createdAt) }}</span></div>
          <div class="c-body">{{ c.content }}</div>
          <div class="c-foot">
            <button class="link-btn" @click="replyTo = c.id">回复</button>
          </div>
          <div v-for="r in repliesOf(c)" :key="r.id" class="reply">
            <b>#{{ r.userId }}</b>：{{ r.content }}
          </div>
        </div>
        <div v-if="!comments.length" class="empty">还没有评论</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.post-body { padding: 24px; }
.title { margin: 0 0 8px; font-size: 24px; }
.meta { margin-bottom: 16px; }
.cover { height: 240px; border-radius: 8px; background: var(--bg-soft) center/cover; margin-bottom: 16px; }
.content { white-space: pre-wrap; font-family: inherit; font-size: 15px; line-height: 1.8; margin: 0 0 20px; }
.actions { display: flex; gap: 12px; margin-bottom: 20px; }
.player-panel { border-top: 1px dashed var(--line); padding-top: 16px; }
.comments { margin-top: 24px; }
.section-title { font-size: 17px; }
.composer { padding: 12px; margin-bottom: 16px; }
.composer textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px; resize: vertical; }
.composer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.comment { padding: 12px 16px; margin-bottom: 10px; }
.c-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
.c-body { margin-bottom: 6px; }
.c-foot .link-btn { font-size: 12px; color: var(--ink-2); }
.reply { margin: 8px 0 0 20px; padding-left: 12px; border-left: 2px solid var(--line); font-size: 13px; }
</style>
