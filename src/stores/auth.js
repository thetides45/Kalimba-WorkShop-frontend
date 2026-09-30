import { defineStore } from 'pinia';
import { getToken, setToken, setUnauthorizedHandler, http } from '@/shared/http';

/**
 * 用户会话 store：登录态、当前用户、未读通知数。
 * token 持久化在 localStorage，刷新后仍保持登录。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: null,
    unread: 0,
  }),
  getters: {
    isLogin: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    setSession(token, user) {
      this.token = token;
      this.user = user;
      setToken(token);
    },
    async login(username, password) {
      const d = await http.post('/api/auth/login', { username, password });
      this.setSession(d.token, { id: d.userId, username: d.username, nickname: d.nickname, avatar: d.avatar, role: d.role });
    },
    async register(payload) {
      const d = await http.post('/api/auth/register', payload);
      this.setSession(d.token, { id: d.userId, username: d.username, nickname: d.nickname, avatar: d.avatar, role: d.role });
    },
    async refreshMe() {
      if (!this.token) return;
      try {
        const d = await http.post('/api/auth/refresh');
        this.setSession(d.token, { id: d.userId, username: d.username, nickname: d.nickname, avatar: d.avatar, role: d.role });
      } catch {
        this.logout();
      }
    },
    async fetchUnread() {
      if (!this.token) { this.unread = 0; return; }
      try {
        const d = await http.get('/api/notifications/unread');
        this.unread = d.count || 0;
      } catch { /* 忽略 */ }
    },
    logout() {
      this.token = '';
      this.user = null;
      this.unread = 0;
      setToken('');
    },
  },
});

// 登录态失效时清空会话
setUnauthorizedHandler(() => {
  const store = useAuthStore();
  store.logout();
});
