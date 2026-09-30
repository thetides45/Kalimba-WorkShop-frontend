<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { userApi, postApi } from '@/portal/api';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const profile = ref(null);
const posts = ref([]);
const isMe = ref(false);
const following = ref(false);

// 编辑资料弹窗
const editing = ref(false);
const form = ref({ nickname: '', avatar: '' });
const saving = ref(false);

onMounted(async () => {
  const id = route.params.id;
  profile.value = await userApi.profile(id);
  isMe.value = auth.isLogin && String(auth.user && auth.user.id) === String(id);
  const list = await postApi.list({ page: 1, size: 20 });
  posts.value = (list.records || []).filter(p => String(p.userId) === String(id));
});

async function toggleFollow() {
  try {
    if (following.value) await userApi.unfollow(profile.value.id);
    else await userApi.follow(profile.value.id);
    following.value = !following.value;
  } catch (e) { window.alert(e.message); }
}

function openEdit() {
  form.value = { nickname: profile.value.nickname || '', avatar: profile.value.avatar || '' };
  editing.value = true;
}

async function saveEdit() {
  if (!form.value.nickname.trim()) { window.alert('昵称不能为空'); return; }
  saving.value = true;
  try {
    await userApi.editMe({ nickname: form.value.nickname.trim(), avatar: form.value.avatar.trim() });
    profile.value.nickname = form.value.nickname.trim();
    profile.value.avatar = form.value.avatar.trim();
    await auth.refreshMe();   // 同步顶栏
    editing.value = false;
  } catch (e) {
    window.alert(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="profile">
    <div class="head card">
      <img v-if="profile.avatar" class="avatar-big" :src="profile.avatar" alt="" />
      <div v-else class="avatar-big">{{ (profile.nickname || profile.username || '?')[0] }}</div>
      <div class="info">
        <h1>{{ profile.nickname }}</h1>
        <div class="muted small">@{{ profile.username }} · 加入于 {{ profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('zh-CN') : '' }}</div>
      </div>
      <button v-if="isMe" class="btn btn-ghost btn-sm" @click="openEdit">编辑资料</button>
      <button v-else-if="auth.isLogin" class="btn btn-sm" :class="following ? 'btn-ghost' : 'btn-primary'" @click="toggleFollow">
        {{ following ? '已关注' : '关注' }}
      </button>
    </div>

    <h2 class="section-title">作品 {{ posts.length }}</h2>
    <div v-if="!posts.length" class="empty">还没有发布作品</div>
    <div v-for="p in posts" :key="p.id" class="row card">
      <router-link :to="'/posts/' + p.id" class="info">
        <div class="title">{{ p.title }}</div>
        <div class="muted small">👍 {{ p.likeCount }} · 👀 {{ p.viewCount }}</div>
      </router-link>
    </div>

    <!-- 编辑资料弹窗 -->
    <div class="overlay" :class="{ show: editing }" @click.self="editing = false">
      <div class="modal">
        <div class="m-title">编辑资料</div>
        <div class="field">
          <label>昵称</label>
          <input v-model="form.nickname" maxlength="20" placeholder="给自己起个名字" />
        </div>
        <div class="field">
          <label>头像图片链接（可选）</label>
          <input v-model="form.avatar" placeholder="https://..." />
        </div>
        <div class="m-row">
          <button class="btn btn-ghost" @click="editing = false">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveEdit">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 18px; padding: 20px; margin-bottom: 20px; }
.head img.avatar-big { object-fit: cover; }
.info { flex: 1; }
.info h1 { margin: 0 0 4px; font-size: 20px; }
.section-title { font-size: 20px; }
.row { padding: 12px 16px; margin-bottom: 10px; }
.row .title { font-weight: 600; }

.overlay { position: fixed; inset: 0; background: rgba(42, 34, 27, .45); display: none; align-items: center; justify-content: center; z-index: 50; }
.overlay.show { display: flex; }
.modal { width: 440px; max-width: calc(100vw - 48px); background: var(--surface); border-radius: 20px; padding: 26px; box-shadow: var(--sh-modal); }
.m-title { font-family: var(--serif); font-size: 19px; font-weight: 600; color: var(--wood-deep); text-align: center; margin-bottom: 20px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 13px; color: var(--ink-2); margin-bottom: 7px; }
.m-row { display: flex; gap: 10px; margin-top: 8px; }
.m-row .btn { flex: 1; }
</style>
