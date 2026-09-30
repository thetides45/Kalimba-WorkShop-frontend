<script setup>
import { ref } from 'vue';

const version = ref('1.0.0');
const href = '/offline/kalimba-tab.html';

const updates = ref([
  { v: '1.0.0', date: '2026-09-29', notes: ['内核工程化为 ES 模块（core/parser/layout/renderer/editor/player/exporter/studio）', '单 HTML 离线版由模块自动装配生成', '保留全部制谱功能，1252 项回归断言全绿'] },
]);
</script>

<template>
  <div class="offline">
    <h1>离线版下载</h1>
    <p class="muted">单 HTML 文件，下载后双击即可使用；无环境依赖、断网完整制谱，草稿存 IndexedDB，成果导出乐谱 JSON。</p>

    <div class="card dl">
      <div class="info">
        <div class="t">kalimba-tab 离线版 <span class="tag">v{{ version }}</span></div>
        <div class="muted small">自包含样式 / 脚本 / 字体子集，约 270 KB</div>
      </div>
      <a class="btn btn-primary" :href="href" download>下载离线版</a>
    </div>

    <div class="compare card">
      <h2>两条离线通道</h2>
      <table>
        <thead><tr><th>对比项</th><th>单 HTML 离线版</th><th>PWA 安装</th></tr></thead>
        <tbody>
          <tr><td>获取方式</td><td>下载文件，可任意分发</td><td>浏览器内安装</td></tr>
          <tr><td>更新方式</td><td>重新下载</td><td>随站点发布自动更新</td></tr>
          <tr><td>环境依赖</td><td>无，双击即用</td><td>依赖浏览器支持</td></tr>
          <tr><td>适用场景</td><td>对外分发、无网环境、长期留存</td><td>高频回访用户的便捷入口</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card changelog">
      <h2>更新日志</h2>
      <div v-for="u in updates" :key="u.v" class="item">
        <b>{{ u.v }}</b> <span class="muted small">{{ u.date }}</span>
        <ul class="small">
          <li v-for="n in u.notes" :key="n">{{ n }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.offline h1 { font-size: 22px; }
.dl { display: flex; justify-content: space-between; align-items: center; padding: 24px; margin: 20px 0; }
.t { font-weight: 700; font-size: 16px; }
.compare, .changelog { padding: 20px; margin-bottom: 16px; }
.compare h2, .changelog h2 { font-size: 16px; margin: 0 0 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
th { color: var(--ink-2); font-weight: 600; }
.item { margin-bottom: 14px; }
.item ul { margin: 6px 0 0; padding-left: 18px; color: var(--ink-2); }
</style>
