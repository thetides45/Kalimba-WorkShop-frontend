/*
 * 制谱工作台 Vue 组件生成器（WBS 6「整块嵌入」路线）。
 *
 * 从 kalimba-tab/index.html 抽取：
 *   · <style> 块（工作台 CSS，355 行）→ 作为组件 <style>（去掉 scoped，因为内核动态生成
 *     的 SVG 里也用这些类，scoped 会加 data-v 前缀导致匹配不上）
 *   · <body> 内的工作台 HTML 骨架（<header>…</main>）→ 组件 <template>
 * 生成 src/portal/components/WorkbenchStudio.vue。
 *
 * 组件挂载后在 onMounted 里调 kernel/mountStudio()（动态 import studio 并 init()），
 * init 内部用 document.getElementById 找这些节点、绑事件 —— 与离线版完全同一套。
 *
 * 用法：node tools/extract_workbench.js
 * 验证：改完 index.html 重跑本脚本 + npm run build + 离线产物回归（1252 项）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../../kalimba-tab/index.html');
const OUT = path.resolve(__dirname, '../src/portal/components/WorkbenchStudio.vue');

const html = fs.readFileSync(SRC, 'utf8');
const lines = html.split('\n');

/* 1. 抽取 <style>…</style> 的**内容**（不含标签本身） */
const styleStart = lines.findIndex((l) => l.trim() === '<style>');
const styleEnd = lines.findIndex((l) => l.trim() === '</style>');
if (styleStart < 0 || styleEnd < 0) throw new Error('找不到 <style> 块');
const css = lines.slice(styleStart + 1, styleEnd).join('\n');

/* 2. 抽取 <body>…第一个 <script id="s-core"> 之间的 HTML 骨架（去掉 <body> 标签本身） */
const bodyStart = lines.findIndex((l) => l.trim() === '<body>');
const scriptStart = lines.findIndex((l, i) => i > bodyStart && l.includes('<script id="s-'));
if (bodyStart < 0 || scriptStart < 0) throw new Error('找不到 <body> 或 <script id="s-');
const skeleton = lines.slice(bodyStart + 1, scriptStart).join('\n');

/* 3. CSS 作用域隔离：工作台是全屏独立页，但它的 CSS 是全局注入的，
   会污染门户其他页面（两边都定义了 :root 变量、.btn、body 等，值还不同）。
   把「会污染门户」的全局选择器前缀 .wb-host，工作台专属类名（.top/.panel/.group…）保持原样。 */
function scopeCss(css) {
  return css
    // :root 变量定义 → 收进 .wb-host 作用域
    .replace(/^:root\{/m, '.wb-host{')
    // 通配 box-sizing → 只对工作台子树生效
    .replace(/^\*\{/m, '.wb-host *{')
    // html,body → 删掉（门户已处理），body 的样式改挂 .wb-host
    .replace(/^html,body\{[^}]*\}/m, '')
    .replace(/^body\{/m, '.wb-host{min-height:100vh;')
    // 通用元素重置 → 限到工作台子树
    .replace(/^button,select,textarea,input\{/m, '.wb-host button,.wb-host select,.wb-host textarea,.wb-host input{')
    .replace(/^h1,h2,h3,p,ul\{/m, '.wb-host h1,.wb-host h2,.wb-host h3,.wb-host p,.wb-host ul{')
    // .btn 系列 → 前缀 .wb-host（门户也有 .btn）
    .replace(/^\.btn\{/m, '.wb-host .btn{')
    .replace(/^\.btn:hover\{/m, '.wb-host .btn:hover{')
    .replace(/^\.btn\.primary\{/m, '.wb-host .btn.primary{')
    .replace(/^\.btn\.primary:hover\{/m, '.wb-host .btn.primary:hover{')
    .replace(/^\.btn\.on\{/m, '.wb-host .btn.on{')
    .replace(/^\.btn:disabled\{/m, '.wb-host .btn:disabled{')
    .replace(/^\.btn\.icon\{/m, '.wb-host .btn.icon{')
    .replace(/^\.btn\.icon svg\{/m, '.wb-host .btn.icon svg{')
    .replace(/^\.btn\.icon\.on\{/m, '.wb-host .btn.icon.on{');
}
/* 3b. V3 配色映射（用户 2026-09-29：制谱页参照 DESIGN.md 适配风格，不改功能）。
   工作台原配色是「绿色 accent + 中性灰」，与门户 V3（木质暖色 + 珊瑚）不搭。
   只替换**外壳配色**（CSS 变量与硬编码色值），不动内核渲染逻辑 → 功能零变化。 */
const V3_MAP = [
  // :root 变量值
  ['--bg:#fafaf8', '--bg:#F9F7F5'],
  ['--panel:#ffffff', '--panel:#FFFFFF'],
  ['--ink:#1b1b19', '--ink:#3E2B1E'],
  ['--ink2:#5c5c58', '--ink2:#8A7A6D'],
  ['--ink3:#9b9b95', '--ink3:#B3A79A'],
  ['--line:#e9e8e3', '--line:#EDE7DE'],
  ['--line2:#d8d7d1', '--line2:#E5DCC9'],
  ['--accent:#2f6f5f', '--accent:#5D4432'],
  ['--accent2:#e9f2ef', '--accent2:#EFE7DE'],
  ['--warn:#b1542a', '--warn:#C05A3E'],
  ['--warn-bg:#fdf3ec', '--warn-bg:#FBEDE6'],
  ['--dot:#1b1b19', '--dot:#3E2B1E'],
  // 硬编码色值（accent 绿系 → 木棕；中性灰 → 暖棕）
  ['#28604f', '#4A3627'],
  ['#bcd9d1', '#DDD2C4'],
  ['#e4f1ec', '#EFE7DE'],
  ['#eaf4f0', '#EFE7DE'],
  ['#9fc9bd', '#E5DCC9'],
  ['#f5f5f2', '#EFE7DE'],
  ['#f2f2ee', '#F9F7F5'],
  ['#e8e7e2', '#EDE7DE'],
  ['#1b1b19', '#3E2B1E'],
  ['#5c5c58', '#8A7A6D'],
  ['#9b9b95', '#B3A79A'],
  ['#c6c5bd', '#B3A79A'],
  ['#cfcfc9', '#E5DCC9'],
  ['#a8a8a2', '#8A7A6D'],
  ['#8a8a84', '#8A7A6D'],
  ['#f0dbc9', '#FBEDE6'],
  ['#fdf3ec', '#FBEDE6'],
  ['#b1542a', '#C05A3E'],
  ['#fcfcfb', '#FFFFFF'],
];
function applyV3Theme(cssText) {
  let out = cssText;
  const hit = [];
  for (const [from, to] of V3_MAP) {
    const n = out.split(from).length - 1;
    if (n) { hit.push(from + '×' + n); out = out.split(from).join(to); }
  }
  console.log('  V3 配色替换：' + hit.join(', '));
  return out;
}
const scopedCss = applyV3Theme(scopeCss(css));

/* 4. 生成 Vue 组件（模板包一层 .wb-host 承接作用域） */
const vue = `<script setup>
import { onMounted } from 'vue';
import { mountStudio } from '@/kernel';

/**
 * 制谱工作台（整块嵌入，WBS 6）。
 * 本组件由 tools/extract_workbench.js 从 kalimba-tab/index.html 自动生成，请勿手改。
 * 模板 = 工作台 HTML 骨架，样式 = 工作台 CSS（全局选择器已用 .wb-host 隔离作用域），
 * 脚本 = 内核 studio 装配层（mountStudio → init）。
 */
onMounted(async () => {
  await mountStudio();
});
</script>

<template>
<div class="wb-host">
${skeleton}
</div>
</template>

<style>
${scopedCss}
</style>
`;

fs.writeFileSync(OUT, vue, 'utf8');
console.log('已生成：', OUT);
console.log('  CSS 行数：', scopedCss.split('\n').length);
console.log('  HTML 骨架行数：', skeleton.split('\n').length);
