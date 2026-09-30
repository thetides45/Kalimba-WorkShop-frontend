<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { postApi, metaApi } from '@/portal/api';
import { upload } from '@/shared/http';

const router = useRouter();
const tags = ref([]);
const tuningTypes = ref([]);
const keyNames = ref([]);
const difficulties = ref([]);
const musicGenres = ref([]);
const form = ref({
  title: '', content: '', cover: '', tagIds: [],
  scoreFileId: null,
  tuningType: '', keyName: '', difficulty: '', musicGenre: '',
});
const uploading = ref(false);
const submitting = ref(false);

onMounted(async () => {
  try {
    const m = await metaApi.categories();
    tags.value = m.postTags || [];
    tuningTypes.value = m.tuningTypes || [];
    keyNames.value = m.keyNames || [];
    difficulties.value = m.difficulties || [];
    musicGenres.value = m.musicGenres || [];
  } catch (e) {
    // 分类字典加载失败不阻塞发布，标签仍可手动为空
    console.warn('加载分类字典失败', e);
  }
});

function toggleTag(id) {
  const i = form.value.tagIds.indexOf(id);
  if (i >= 0) form.value.tagIds.splice(i, 1);
  else form.value.tagIds.push(id);
}

async function onCover(e) {
  const f = e.target.files[0];
  if (!f) return;
  uploading.value = true;
  try {
    const d = await upload('/api/files/image', f);
    form.value.cover = d.url;
  } catch (err) {
    window.alert(err.message);
  } finally {
    uploading.value = false;
  }
}

async function onScore(e) {
  const f = e.target.files[0];
  if (!f) return;
  uploading.value = true;
  try {
    const q = new URLSearchParams();
    if (form.value.tuningType) q.set('tuningType', form.value.tuningType);
    if (form.value.keyName) q.set('keyName', form.value.keyName);
    if (form.value.difficulty) q.set('difficulty', form.value.difficulty);
    if (form.value.musicGenre) q.set('musicGenre', form.value.musicGenre);
    const d = await upload('/api/files/score' + (q.toString() ? '?' + q.toString() : ''), f);
    form.value.scoreFileId = d.id;
  } catch (err) {
    window.alert(err.message);
  } finally {
    uploading.value = false;
  }
}

async function submit() {
  if (!form.value.title.trim()) return window.alert('请填写标题');
  submitting.value = true;
  try {
    const p = await postApi.create(form.value);
    router.push('/posts/' + p.id);
  } catch (e) {
    window.alert(e.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="publish">
    <h1>发布作品</h1>
    <div class="card form">
      <label>标题 <span class="req">*</span></label>
      <input v-model="form.title" class="input" maxlength="80" placeholder="给你的作品起个名字" />

      <label>正文</label>
      <textarea v-model="form.content" class="input" rows="8" placeholder="分享你的制谱心得、演奏技巧…"></textarea>

      <label>封面</label>
      <div class="cover-row">
        <div v-if="form.cover" class="cover-preview" :style="{ backgroundImage: 'url(' + form.cover + ')' }"></div>
        <input type="file" accept="image/*" @change="onCover" />
      </div>

      <label>乐谱附件（JSON / klb，可选）</label>
      <div class="file-row">
        <input type="file" accept=".json,.klb" @change="onScore" />
        <span v-if="form.scoreFileId" class="muted small">已上传（id={{ form.scoreFileId }}）</span>
      </div>

      <div class="score-cats">
        <label>曲谱分类</label>
        <div class="cat-row">
          <select v-model="form.tuningType" class="input select">
            <option value="">琴型（可选）</option>
            <option v-for="t in tuningTypes" :key="t.code" :value="t.code">{{ t.label }}</option>
          </select>
          <select v-model="form.keyName" class="input select">
            <option value="">调性（可选）</option>
            <option v-for="k in keyNames" :key="k.code" :value="k.code">{{ k.label }}</option>
          </select>
        </div>
        <div class="cat-row">
          <select v-model="form.difficulty" class="input select">
            <option value="">难度（可选）</option>
            <option v-for="d in difficulties" :key="d.code" :value="d.code">{{ d.label }}</option>
          </select>
          <select v-model="form.musicGenre" class="input select">
            <option value="">音乐类型（可选）</option>
            <option v-for="g in musicGenres" :key="g.code" :value="g.code">{{ g.label }}</option>
          </select>
        </div>
        <p class="muted small">曲谱分类跟着乐谱附件走，与下面的帖子标签是两套：标签是「内容/话题」，这里是「琴型/调性/难度/音乐类型」。</p>
      </div>

      <label>帖子标签</label>
      <div class="tag-row">
        <button v-for="t in tags" :key="t.id"
                class="tag pick" :class="{ on: form.tagIds.includes(t.id) }"
                @click="toggleTag(t.id)">{{ t.name }}</button>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="uploading || submitting" @click="submit">
          {{ submitting ? '发布中…' : '发布' }}
        </button>
      </div>
      <p class="muted small">提示：也可以先到「制谱」完成作品，导出乐谱 JSON 后回到这里上传发布。</p>
    </div>
  </div>
</template>

<style scoped>
.publish h1 { font-size: 22px; }
.form { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.form label { font-weight: 600; font-size: 13px; }
.req { color: var(--danger); }
.input { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; width: 100%; }
textarea.input { resize: vertical; }
.cover-row, .file-row { display: flex; align-items: center; gap: 12px; }
.cover-preview { width: 120px; height: 68px; border-radius: 6px; background: var(--bg-soft) center/cover; }
.score-cats { display: flex; flex-direction: column; gap: 8px; }
.cat-row { display: flex; gap: 10px; }
.cat-row .select { flex: 1; }
.tag-row { display: flex; gap: 8px; flex-wrap: wrap; }
.tag.pick { cursor: pointer; }
.tag.pick.on { background: var(--brand); color: #fff; }
.actions { margin-top: 8px; }
</style>
