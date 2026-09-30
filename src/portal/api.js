import { http } from '@/shared/http';

/** 帖子 API 封装。 */
export const postApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.size) q.set('size', params.size);
    if (params.tagId) q.set('tagId', params.tagId);
    if (params.sort) q.set('sort', params.sort);
    if (params.keyword) q.set('keyword', params.keyword);
    return http.get('/api/posts?' + q.toString());
  },
  detail: (id) => http.get('/api/posts/' + id),
  create: (body) => http.post('/api/posts', body),
  update: (id, body) => http.put('/api/posts/' + id, body),
  remove: (id) => http.del('/api/posts/' + id),
  hot: (limit = 10) => http.get('/api/hot?limit=' + limit),
  tags: () => http.get('/api/tags'),
};

export const commentApi = {
  list: (postId, page = 1, size = 20) => http.get(`/api/posts/${postId}/comments?page=${page}&size=${size}`),
  create: (postId, body) => http.post(`/api/posts/${postId}/comments`, body),
  remove: (postId, commentId) => http.del(`/api/posts/${postId}/comments/${commentId}`),
};

export const interactionApi = {
  state: (postId) => http.get(`/api/posts/${postId}/interaction`),
  like: (postId) => http.post(`/api/posts/${postId}/likes`),
  unlike: (postId) => http.del(`/api/posts/${postId}/likes`),
  favorite: (postId) => http.post(`/api/posts/${postId}/favorite`),
  unfavorite: (postId) => http.del(`/api/posts/${postId}/favorite`),
};

export const userApi = {
  profile: (id) => http.get('/api/users/' + id),
  follow: (id) => http.post(`/api/users/${id}/follow`),
  unfollow: (id) => http.del(`/api/users/${id}/follow`),
  // 更新我的资料（昵称 / 头像），返回新的 user 信息
  editMe: (body) => http.put('/api/users/me', body),
};

/** 举报：targetType = post | comment | user */
export const reportApi = {
  submit: (body) => http.post('/api/reports', body),
};

export const notificationApi = {
  list: (page = 1, size = 20) => http.get(`/api/notifications?page=${page}&size=${size}`),
  unread: () => http.get('/api/notifications/unread'),
  read: (id) => http.put(`/api/notifications/${id}/read`),
  readAll: () => http.put('/api/notifications/read-all'),
};

export const metaApi = {
  categories: () => http.get('/api/meta/categories'),
};
