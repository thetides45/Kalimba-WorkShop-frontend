/* =====================================================================
   kernel/index.js —— 内核装配入口（自动生成）
   ---------------------------------------------------------------------
   内核是「一套代码、两种形态」：
     · SPA（社区门户）—— 只 import 用得到的模块（典型是 parser / layout / renderer / player）；
     · 单 HTML 离线版 —— 全部模块被 build_offline.js 依序内联进一个 <script>，
       并在末尾显式调用 studio 的 init()。

   ⚠️ 本文件**刻意不做任何静态 import**：
     工作台装配层（studio）带 DOM 接线，门户一加载就被拽进来会白白多打包约 30KB，
     也会让「内核能不能脱离工作台单独用」这件事变得说不清。
     所以一律走动态 import，谁用谁付代价。
   ===================================================================== */
export const KERNEL_MODULES = ["foundation","state","core","parser","layout","renderer","editor","player","exporter","studio"];

export const KERNEL_LAYERS = [
  { id: 'foundation', desc: "内核常量表（原散落在 s-ui 各处的表与常量）" },
  { id: 'state', desc: "跨模块共享状态与元信息助手" },
  { id: 'core', desc: "乐理运算 / 音位表 / 调性与移调" },
  { id: 'parser', desc: "三类谱源解析（简谱文本 / MIDI / MusicXML）" },
  { id: 'layout', desc: "事件流 → 网格（量化与反向简谱）" },
  { id: 'renderer', desc: "SVG 谱面排版（分页 / 音位轴 / 页眉页脚）" },
  { id: 'editor', desc: "点选编辑（命中测试 / 改音 / 调时值）" },
  { id: 'player', desc: "Web Audio 试听与播放调度" },
  { id: 'exporter', desc: "导出 / 打包 / 二维码" },
  { id: 'studio', desc: "工作台装配层（页面状态 / 事件接线 / 重画）" }
];

/** 工作台装配：把 studio 装到页面上（仅离线单文件产物 / 工作台页面需要）。 */
export async function mountStudio() {
  const studio = await import('./studio.js');
  studio.init();
  return studio;
}

/** 便捷出口：门户帖内试听要用的那几件（state + 解析 + 排版 + 试听 + 导出）。 */
export async function kernel() {
  const mods = await Promise.all([
    import('./state.js'), import('./core.js'), import('./parser.js'), import('./layout.js'),
    import('./renderer.js'), import('./player.js'), import('./exporter.js')
  ]);
  return Object.assign({}, ...mods);
}
