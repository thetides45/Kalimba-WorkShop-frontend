<script setup>
import { ref, onMounted } from 'vue';
import { kernel } from '@/kernel';

const props = defineProps({
  fileId: { type: [Number, String], required: true },
});

const status = ref('loading');
const score = ref(null);
const err = ref('');

onMounted(async () => {
  try {
    // 拉取乐谱 JSON，交给内核解析预览（不依赖服务端转码）
    const res = await fetch('/api/files/' + props.fileId);
    if (!res.ok) throw new Error('附件不存在');
    const text = await res.text();
    const k = await kernel();
    score.value = k.parseSource(text);
    status.value = score.value && score.value.events && score.value.events.length ? 'ready' : 'empty';
  } catch (e) {
    err.value = e.message;
    status.value = 'error';
  }
});
</script>

<template>
  <div class="player">
    <div class="player-head">🎵 帖内试听</div>
    <div v-if="status === 'loading'" class="muted small">正在加载乐谱…</div>
    <div v-else-if="status === 'error'" class="muted small">加载失败：{{ err }}</div>
    <div v-else-if="status === 'empty'" class="muted small">该附件不含可解析的谱面</div>
    <div v-else class="ready">
      <div class="muted small">曲名：{{ score.meta?.title || '未命名' }} · 调号 {{ score.meta?.keyName || 'C' }} · 拍号 {{ (score.meta?.meter || [4,4]).join('/') }}</div>
      <div class="muted small">谱面已就绪（试听引擎待接入工作台 player 模块，WBS 6 打通）。</div>
    </div>
  </div>
</template>

<style scoped>
.player-head { font-weight: 600; margin-bottom: 6px; }
.ready { display: flex; flex-direction: column; gap: 4px; }
</style>
