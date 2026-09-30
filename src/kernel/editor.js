/* =====================================================================
   editor.js —— 点选编辑（命中测试 / 改音 / 调时值）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { RD, degreeLabel } from './renderer.js';
import { ST, afterEdit } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   5. 点选编辑：直接在谱面上点出音（无需写简谱）
   ===================================================================== */
let lastGeom = null, editMode = false, painting = 0;

/* ★ P2：lastGeom 归本模块所有，但 s-render 会**写**它（renderScore 收尾落几何）、
   studio 会存还它（导出时换一套几何、用完还原）。
   上面那行声明**一字未改** —— 回归探针直接读全局 lastGeom（如 kal_sheet_probe 的
   rpcOf()），改名字会把探针体系整个打哑。
   跨模块的「写」改走这个 setter：ES 模块的导入绑定只读，裸变量没法跨模块赋值。
   读写语义与原来完全一致（同一个变量、同一处赋值时机）。 */
function setLastGeom(v){ lastGeom = v; }
function setEditMode(v){ editMode = v; }

/* 音名 -> 简谱记号（.1 低八度 / 1' 高八度） */
function shortLabel(midi){
  const d = degreeLabel(midi);
  const rel = (Math.floor(midi / 12) - 1) - 4;
  if(rel < 0) return '.'.repeat(-rel) + d;
  if(rel > 0) return d + "'".repeat(rel);
  return d;
}

function toSvgPt(evt, svg){
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  return {x: (evt.clientX - r.left) * vb.width / r.width,
          y: (evt.clientY - r.top)  * vb.height / r.height};
}

/* 事件落在哪一页：分页视图下 #svgHost 里是多个 <div class="pg">，每页一张 SVG，
   页内坐标从 0 起算，要加上该页的 data-y0 才能换回「整张纸」的全局坐标；
   连续预览只有一张 SVG，y0 = 0。hitTest / updateGhost 全都用全局坐标，不必改。 */
function pageAt(target){
  const host = document.getElementById('svgHost');
  const pg = target && target.closest ? target.closest('.pg') : null;
  if(pg) return {svg: pg.querySelector('svg'), y0: +(pg.dataset.y0 || 0)};
  return {svg: host.querySelector('svg'), y0: 0};
}
const eventPt = evt => {
  const pg = pageAt(evt.target); if(!pg.svg) return null;
  const p = toSvgPt(evt, pg.svg);
  return {x: p.x, y: p.y + pg.y0};
};

function hitTest(pt){
  if(!lastGeom || !ST.grid) return null;
  for(const p of lastGeom.panels){
    /* 每个面板自带「纸面上的」一格尺寸：拼版后是列宽 14 / 行高 12.5，
       连续预览时仍是 28 / 25。缺字段就退回全局口径（老探针注入的 geom 可能没有）。 */
    const gx0 = p.gx0 !== undefined ? p.gx0 : lastGeom.x0;
    const colWz = p.colWz !== undefined ? p.colWz : lastGeom.colW;
    const rowHz = p.rowHz !== undefined ? p.rowHz : RD.ROW_H;
    /* 注意 yTop/yBot 是**行区**（不含面板下方的音位轴）：
       否则点轴那一条会被算成最后几行，直接在轴上演上编辑了。 */
    if(pt.y < p.yTop || pt.y >= p.yBot) continue;
    /* 拼版后左右两段共用同一段 y 区间，必须再按 x 框一次 ——
       否则点右栏会先落进左栏（行区命中），算出 ≥ 键数的列号后被当成「点空」返回 null，
       右边的谱就整块点不动了。 */
    if(p.ox !== undefined && p.w !== undefined && (pt.x < p.ox || pt.x >= p.ox + p.w)) continue;
    const vis = Math.floor((pt.y - p.yTop) / rowHz);
    const k = ST.st.direction === 'up' ? (p.n - 1 - vis) : vis;
    if(k < 0 || k >= p.n) continue;
    const col = Math.floor((pt.x - gx0) / colWz);
    if(col < 0 || col >= ST.tuning.len) continue;   // continue 而非 return：还有别的面板要看
    return {rowIdx: p.startIdx + k, col};
  }
  return null;
}

/* forceMode: 'add' | 'erase'，不传则自动切换 */
function toggleCell(rowIdx, col, forceMode){
  const row = ST.grid && ST.grid.rows[rowIdx];
  if(!row) return;
  const midi = ST.tuning.notes[col].midi;
  const hit  = row.items.some(it => it.col === col);
  const add  = forceMode ? forceMode === 'add' : !hit;
  if(add === hit) return;                       // 状态已一致，跳过
  if(add){
    row.items.push({col, midi, label: shortLabel(midi), bad:false, dur: ST.selectedDur, voice: 0});
    row.items.sort((a, b) => a.col - b.col);
  } else {
    row.items = row.items.filter(it => it.col !== col);
  }
  ST.dirty = true;
  afterEdit();
}

/* 格子高亮预览（HTML 浮层，不受 SVG 重绘影响） */
function updateGhost(hit){
  let g = document.getElementById('cellGhost');
  if(!g){
    g = document.createElement('div');
    g.id = 'cellGhost';
    g.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:50;border:1.5px solid #2f6f5f;' +
                      'border-radius:6px;background:rgba(47,111,95,.10)';
    document.body.appendChild(g);
  }
  const host = document.getElementById('svgHost');
  if(!editMode || !hit || !lastGeom){ g.style.display = 'none'; return; }
  const p = lastGeom.panels.find(pp => hit.rowIdx >= pp.startIdx && hit.rowIdx < pp.startIdx + pp.n);
  if(!p){ g.style.display = 'none'; return; }
  /* 命中所在的这一张纸（拼版后同一行号只可能出现在其中一段里） */
  const pgEl = host.querySelector('.pg[data-y0="' + p.g0 + '"]');
  const svg = pgEl ? pgEl.querySelector('svg') : host.querySelector('svg');
  if(!svg){ g.style.display = 'none'; return; }
  const r = svg.getBoundingClientRect(), sc = r.width / svg.viewBox.baseVal.width;
  const k = hit.rowIdx - p.startIdx;
  const vis = ST.st.direction === 'up' ? (p.n - 1 - k) : k;
  /* 再按这个面板自己的格尺寸换算回像素 —— 拼版后一格只有 14×12.5，
     用全局的 28×25 会把浮层画成两倍大 */
  const gx0 = p.gx0 !== undefined ? p.gx0 : lastGeom.x0;
  const colWz = p.colWz !== undefined ? p.colWz : lastGeom.colW;
  const rowHz = p.rowHz !== undefined ? p.rowHz : RD.ROW_H;
  g.style.display = 'block';
  g.style.left   = (r.left + (gx0 + hit.col * colWz) * sc) + 'px';
  g.style.top    = (r.top + (p.yTop - p.g0 + vis * rowHz) * sc) + 'px';
  g.style.width  = (colWz * sc) + 'px';
  g.style.height = (rowHz * sc) + 'px';
}

function bindEditor(){
  const host = document.getElementById('svgHost');
  host.addEventListener('mousedown', e => {
    if(!editMode) return;
    const pt = eventPt(e); if(!pt) return;
    const hit = hitTest(pt); if(!hit) return;
    const exists = ST.grid.rows[hit.rowIdx].items.some(it => it.col === hit.col);
    painting = exists ? 2 : 1;
    toggleCell(hit.rowIdx, hit.col, exists ? 'erase' : 'add');
    e.preventDefault();
  });
  host.addEventListener('mousemove', e => {
    if(!editMode) return;
    const pt = eventPt(e); if(!pt) return;
    const hit = hitTest(pt);
    updateGhost(hit);
    if(painting && hit) toggleCell(hit.rowIdx, hit.col, painting === 1 ? 'add' : 'erase');
  });
  host.addEventListener('mouseleave', () => updateGhost(null));
  window.addEventListener('mouseup', () => { painting = 0; });
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { bindEditor, editMode, eventPt, hitTest, lastGeom, pageAt, painting, setEditMode, setLastGeom, shortLabel, toSvgPt, toggleCell, updateGhost };
