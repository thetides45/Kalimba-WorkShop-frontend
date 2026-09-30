/**
 * HTTP 客户端：统一带 token、统一拆 R{code,message,data}。
 * code !== 0 时抛错；401 触发登出回调。
 */
const TOKEN_KEY = 'kalimba_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(method, url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['sa-token'] = token;

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...opts,
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error('服务返回异常（HTTP ' + res.status + '）');
  }
  if (payload.code !== 0) {
    if (payload.code === 2001) {
      setToken('');
      if (onUnauthorized) onUnauthorized();
    }
    const err = new Error(payload.message || '请求失败');
    err.code = payload.code;
    throw err;
  }
  return payload.data;
}

export const http = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

/** 上传文件（multipart，不带 JSON 头）。 */
export async function upload(url, file) {
  const fd = new FormData();
  fd.append('file', file);
  const headers = {};
  const token = getToken();
  if (token) headers['sa-token'] = token;
  const res = await fetch(url, { method: 'POST', headers, body: fd });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(payload.message || '上传失败');
  return payload.data;
}

export { request };
