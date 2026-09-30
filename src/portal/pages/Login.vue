<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const mode = ref('login');
const username = ref('');
const password = ref('');
const nickname = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (!username.value || !password.value) { error.value = '请填写用户名和密码'; return; }
  busy.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(username.value, password.value);
    } else {
      await auth.register({ username: username.value, password: password.value, nickname: nickname.value || undefined });
    }
    const redirect = route.query.redirect || '/';
    router.push(redirect);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="card login-card">
      <h1>{{ mode === 'login' ? '登录' : '注册' }}</h1>
      <div v-if="error" class="error">{{ error }}</div>
      <input v-model="username" class="input" placeholder="用户名" autocomplete="username" />
      <input v-model="password" class="input" type="password" placeholder="密码" autocomplete="current-password" />
      <input v-if="mode === 'register'" v-model="nickname" class="input" placeholder="昵称（可选）" />
      <button class="btn btn-primary full" :disabled="busy" @click="submit">{{ busy ? '提交中…' : (mode === 'login' ? '登录' : '注册') }}</button>
      <div class="switch muted small">
        {{ mode === 'login' ? '还没有账号？' : '已有账号？' }}
        <button class="link-btn" @click="mode = mode === 'login' ? 'register' : 'login'">
          {{ mode === 'login' ? '去注册' : '去登录' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap { display: flex; justify-content: center; padding-top: 40px; }
.login-card { width: 360px; padding: 28px; display: flex; flex-direction: column; gap: 14px; }
.login-card h1 { margin: 0 0 6px; font-size: 22px; }
.input { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.full { justify-content: center; }
.error { color: var(--danger); font-size: 13px; }
.switch { text-align: center; }
.link-btn { color: var(--brand-ink); }
</style>
