/* =====================================================================
   内核对外出口说明
   ---------------------------------------------------------------------
   本目录每个模块都是标准 ES 模块：跨模块引用走 `import` 的**活绑定**
   （支持 renderer ↔ studio 这种双向依赖，读到的永远是最新值）。
   本文件不参与运行，只用来给「内核 = 哪些模块」一个可 import 的清单。 */

export const KERNEL_MODULES = ["foundation","state","core","parser","layout","renderer","editor","player","exporter","studio"];

/** 内核分层说明（自下而上）。 */
export const KERNEL_LAYERS = [
  { id: 'foundation', desc: '常量表' },
  { id: 'state', desc: '共享状态与元信息' },
  { id: 'core', desc: '乐理与音位' },
  { id: 'parser', desc: '三类谱源解析' },
  { id: 'layout', desc: '事件流 → 网格' },
  { id: 'renderer', desc: 'SVG 排版' },
  { id: 'editor', desc: '点选编辑' },
  { id: 'player', desc: 'Web Audio 试听' },
  { id: 'exporter', desc: '导出与打包' },
  { id: 'studio', desc: '工作台装配（含 DOM 接线，仅离线单文件产物使用）' }
];
