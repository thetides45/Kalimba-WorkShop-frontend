/**
 * IndexedDB 草稿箱（WBS 2.4）。
 * 制谱草稿自动保存、多草稿列表、断点续编、配额提示。
 */

const DB_NAME = 'kalimba-drafts';
const STORE = 'drafts';
const DB_VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** 保存一个草稿（有 id 则覆盖，无 id 则新建并回填 id）。 */
export async function saveDraft(draft) {
  const record = {
    ...draft,
    id: draft.id || ('d_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
    updatedAt: Date.now(),
  };
  try {
    await tx('readwrite', (store) => store.put(record));
    return record;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e)))) {
      throw new Error('本地存储空间已满，请删除部分草稿后重试');
    }
    throw e;
  }
}

/** 按更新时间倒序列出草稿（仅摘要，不含全文，列表页够用）。 */
export async function listDrafts() {
  const all = await tx('readonly', (store) => store.getAll());
  return (all || [])
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(({ id, title, updatedAt, size }) => ({ id, title, updatedAt, size }));
}

export async function getDraft(id) {
  return tx('readonly', (store) => store.get(id));
}

export async function deleteDraft(id) {
  return tx('readwrite', (store) => store.delete(id));
}

export async function clearDrafts() {
  return tx('readwrite', (store) => store.clear());
}
