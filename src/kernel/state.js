/* =====================================================================
   state.js —— 跨模块共享状态与元信息助手
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { nameOf } from './core.js';
import { $, FILE_BAD } from './foundation.js';
import { invalidatePlayback, onRedrawn, syncProg } from './player.js';
import { AXIS_BAR_OFFSET, SHEET, axisBarSvg, esc, layoutRowCount, qrPathD, renderScore, rowsPerCol } from './renderer.js';
import { DRAFT_KEY, DRAFT_MS, KAL_SNAP, draftTimer } from './studio.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

const ST = {
  tuningKey:'k17', tuning:null, parsed:null, grid:null, dirty:false,
  transpose:0, selectedDur:1, paged:false,
  lastXml:null, lastXmlName:'',      // 上次导入的 XML 文本 + 文件名（曲名兜底 / 勾选重导用）
  /* 附加设置侧栏（用户 2026-09-17）。**只存不发** —— 底部页脚以后再接；
     真接的时候一律从 attachVals() 取值，别另开一份状态，否则两处一定会漂。
     ★ 四个字段的值就以侧栏里的 input/textarea 为准（它们是静态节点、不会被重建），
       这里只留「用户是否手动改过标题」这一个**推不出来**的标志位。
       没改过 → 标题跟着谱面曲名走；改过 → 以输入框为准（清空也算改过）。 */
  attachDirty:false, attachOpen:false,
  st:{mode:'movable', unitMode:'auto', direction:'up', optDegree:false, optMark:true}
};

/* ★ 唯一取值出口（页脚 / 导出以后都走这里） */
function attachVals(){
  return {
    title : String(attachTitleVal()).trim(),
    author: String(attachVal('author')).trim(),
    link  : String(attachVal('link')).trim(),
    note  : String(attachVal('note')).trim()
  };
}

function attachLinkUrl(){
  const raw = String(attachVal('link')).trim();
  if(!raw) return '';
  const ok = v => {
    try {
      const u = new URL(v);
      if(u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const host = u.hostname;
      if(!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return false;
      /* 顶级域必须含至少一个字母（挡 `1.2` / `123.456`，放 `127.0.0.1`：末段是数字但…）*/
      const tld = host.slice(host.lastIndexOf('.') + 1);
      if(!/[a-z]/i.test(tld)) return false;
      return true;
    } catch(e){ return false; }
  };
  if(ok(raw)) return raw;
  if(!/^[a-z][a-z0-9+.-]*:/i.test(raw) && ok('https://' + raw)) return 'https://' + raw;
  return '';
}

/* 要印几张 A4（一张 = SHEET.COLS 栏） */
const sheetCount = () => Math.ceil(pagedCount() / SHEET.COLS);

/* 点选编辑后重算统计与提示 */
function afterEdit(){
  const g = ST.grid; if(!g) return;
  g.usedCols = new Set();
  const warned = new Map();
  g.rows.forEach(r => r.items.forEach(it => {
    g.usedCols.add(it.col);
    if(it.bad){ const n = nameOf(it.midi); warned.set(n, (warned.get(n) || 0) + 1); }
  }));
  g.warnList = [...warned.entries()].map(([name, count]) => ({name, count}));
  invalidatePlayback();             // 音符变了，记忆的播放位置作废
  draw(); report();
  draftScheduleSave();              // 手动编辑 ⇒ 攒一次自动保存
}

function dl(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

const baseName = () => scoreTitle() || '未命名卡林巴谱';       // 单张图 / SVG 的名字

let lastExportNote = '';
function setLastExportNote(v){ lastExportNote = v; }

function attachTitleVal(){
  return ST.attachDirty ? attachVal('title') : attachSongTitle();
}

function attachVal(k){ const el = $(ATTACH_IDS[k]); return el ? el.value : ''; }

function pagedCount(){
  if(!ST.grid) return 1;
  const g = ST.grid;
  return Math.max(1, Math.ceil(layoutRowCount(g.rows, g.unit, g.rowsPerMeasure) /
                               rowsPerCol(g.rowsPerMeasure)));
}

function draw(){
  const paged = !!ST.paged;
  /* 分页视图：每页一块（.pg）独立渲染，打印时由 CSS 强制分页 —— 所见即所印。
     连续预览：整谱一张 SVG，不分块。
     ★ forOutput 跟的是 **pagedLayout**（真打印 / 导出的临时开关），不是 ST.paged：
       「分页预览」勾选框是用户在看版式，简谱对照要照给；真正出纸那一刻才收掉。 */
  const res = renderScore(ST.grid, ST.tuning, ST.st,
                          {paged, split: paged, forOutput: pagedLayout});
  $('svgHost').innerHTML = res.split
    ? res.pages.map(p => '<div class="pg" data-y0="' + p.y0 + '">' + p.svg + '</div>').join('')
    : res.svg;
  renderAxisBar(paged);
  syncProg(true);                     // 谱面换了 / 读谱方向换了 / 滚动条宽度变了 → 重新贴边并归位
  if(typeof onRedrawn === 'function') onRedrawn();
  /* 谱面重画后刷新侧栏标题（跟着曲名走的那份；用户手改过就不动） */
  if(typeof attachAfterDraw === 'function') attachAfterDraw();
  const notes = ST.grid.rows.reduce((n, r) => n + r.items.length, 0);
  let txt = ST.tuning.len + ' 键 · ' + ST.grid.rows.length + ' 格（1 格 = ' + ST.grid.unit +
    ' 拍）· ' + ST.grid.usedCols.size + '/' + ST.tuning.len + ' 条轨道被用到 · ' + notes + ' 个音' +
    (ST.dirty ? ' · 已手动编辑' : '');
  if(ST.paged) txt += ' · 分页视图（' + pagedCount() + ' 栏 · ' + sheetCount() + ' 张 A4）';
  else if(pagedCount() > 1) txt += ' · 预览整谱连续，导出 / 打印时排成 ' + pagedCount() +
    ' 栏（' + sheetCount() + ' 张 A4，每张 ' + SHEET.COLS + ' 栏 × 每栏 ' +
    rowsPerCol() + ' 行）';
  $('stat').textContent = txt;
  /* ★ 自动保存挂在这里，而不是每个入口逐个加：
     点选编辑 / 改 BPM / 换琴型 / 移调 / 生成琴谱 / 导入，最后**都会走到 draw()**。
     （2026-11-08 实测就漏过：只改 BPM 时草稿根本不写 —— 因为 setTempo 改的是
       `ST.grid.meta.tempo`，不触发「简谱输入」的 input 事件，而当时保存只挂在那几个入口上。）
     ⚠️ draw() 在 init() 里也会被调用，那时 KAL_SNAP 还是 null ⇒ kalHasUnsaved() 返回 false
        ⇒ 不会把首屏样例谱误存成草稿。开销也不用担心：draftScheduleSave 只是 clearTimeout + setTimeout，
        真正的快照计算在 1.2s 防抖之后才做一次。 */
  draftScheduleSave();
}

function report(){
  const box = $('warnbox'), msgs = [];
  const errs = (ST.parsed && ST.parsed.errors) || [];
  errs.slice(0, 3).forEach(e => msgs.push(esc(e)));
  if(errs.length > 3) msgs.push('…另有 ' + (errs.length - 3) + ' 处无法识别的记号');
  const w = ST.grid.warnList;
  if(w.length){
    msgs.push('<b>' + w.length + ' 个音超出 ' + ST.tuning.len + ' 键音域</b>（' +
      w.map(x => x.name + '×' + x.count).join('、') +
      '）：谱面上已用红圈标出，暂按最近的琴键代替。点「⤢ 自动移调」可整体挪到合适音域。');
  }
  box.innerHTML = msgs.join('<br>');
  box.classList.toggle('on', msgs.length > 0);
}

function draftScheduleSave(){
  if(draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(function(){ draftTimer = null; draftSave(); }, DRAFT_MS);
}

function scoreTitle(){
  const raw = String((ST.grid && ST.grid.meta.title) || '').trim();
  const t = raw.replace(FILE_BAD, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return (t && t !== '未命名') ? t : '';
}

function attachSongTitle(){
  const raw = String((ST.grid && ST.grid.meta && ST.grid.meta.title) || '').trim();
  return raw === '未命名' ? '' : raw;
}

const ATTACH_IDS = {title:'atTitle', author:'atAuthor', link:'atLink', note:'atNote'};

let pagedLayout = false;
function setPagedLayoutFlag(v){ pagedLayout = v; }

function renderAxisBar(paged){
  const bar = $('axisBar');
  if(!bar) return;
  if(paged || !ST.grid || !ST.tuning){ bar.classList.remove('on'); bar.innerHTML = ''; return; }
  bar.innerHTML = axisBarSvg(ST.tuning, ST.grid.usedCols, ST.st.optMark);
  bar.style.marginLeft = AXIS_BAR_OFFSET() + 'px';   // 把裁过的轴条推回与轨道列对齐的位置
  bar.classList.add('on');
}

function attachAfterDraw(){
  const p = $('attach');
  if(!p || !p.classList.contains('on')) return;
  const t = $(ATTACH_IDS.title);
  if(t && document.activeElement !== t) t.value = attachTitleVal();
  attachQR();
}

function draftSave(){
  try {
    /* ⚠️ 只有**真的改过**才写草稿。不加这道守卫会有两个坏结果：
       ① 只打开看一眼（或草稿损坏被丢弃后重新载入）也会被存成草稿，
          下次进来自动"恢复"一份原样的样例谱，还提示"已恢复上次编辑" —— 纯属误导；
       ② `draftRestore` 里清掉坏数据后，紧接着 rebuild() 的自动保存又把垃圾位填上，
          "坏草稿被清除"这件事等于没发生。
       复用 kalHasUnsaved() 的判据（快照比对），与 beforeunload 完全同源。
       ⚠️ init() 过程中 KAL_SNAP 还是 null ⇒ 它返回 false ⇒ 首屏 rebuild 不会写草稿。 */
    if(!kalHasUnsaved()) return;
    var d = draftBuild();
    if(!d) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch(e){ /* 配额满 / 隐私模式 ⇒ 静默放弃 */ }
}

function attachQR(){
  const wrap = $('atQR'); if(!wrap) return;
  const box = $('qrBox'), url = $('qrUrl');
  const link = attachLinkUrl();
  const svg = link ? qrSvg(link) : '';
  if(svg){
    /* 比对后再写：每敲一个字都重设 innerHTML 会让二维码整块闪一下 */
    if(box && box.__svg !== svg){ box.innerHTML = svg; box.__svg = svg; }
    if(url) url.textContent = link;
    wrap.classList.add('on');
    return;
  }
  if(box && box.__svg){ box.innerHTML = ''; box.__svg = ''; }
  if(url) url.textContent = '';
  wrap.classList.remove('on');
}

function kalHasUnsaved(){
  if(KAL_SNAP === null) return false;      // 基准还没建立（初始化过程中）⇒ 一律不拦
  if(!ST.grid) return false;               // 没有谱面 ⇒ 没有东西可丢
  try { return kalSnapshot() !== KAL_SNAP; } catch(e){ return false; }
}

function draftBuild(){
  if(!ST.grid) return null;
  var g = ST.grid, m = g.meta || {};
  return {
    v: 1,
    at: Date.now(),
    src: $('src').value,
    meta: {
      title: m.title, keyName: m.keyName, tempo: m.tempo,
      meter: (m.meter || []).slice(),
      tuningKey: ST.tuningKey, mode: ST.st.mode,
      direction: ST.st.direction, transpose: ST.transpose,
      unitMode: ST.st.unitMode
    },
    /* 只存「谱面本身」：行号 + 休止 + 每格音符。
       beatInMeasure / measure / isBarStart 都是**由行号推出来**的派生字段，
       恢复时由 rebuild() 重新算好，存进来纯属冗余。 */
    rows: g.rows.map(function(r){
      return {
        idx: r.idx, rest: !!r.rest,
        items: r.items.map(function(it){
          return { col: it.col, midi: it.midi, label: it.label, dur: it.dur, voice: it.voice || 0, bad: !!it.bad };
        })
      };
    })
  };
}

function qrSvg(text){
  const m = qrPathD(text);
  if(!m) return '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + m.n + ' ' + m.n +
         '" shape-rendering="crispEdges" role="img" aria-label="作者链接二维码">' +
         '<rect width="' + m.n + '" height="' + m.n + '" fill="#fff"/>' +
         '<path d="' + m.d + '" fill="#1b1b19"/></svg>';
}

function kalSnapshot(){
  if(!ST.grid) return '';
  var g = ST.grid, m = g.meta || {};
  var parts = [
    $('src').value,
    m.title, m.keyName, m.tempo, (m.meter || []).join('/'),
    ST.tuningKey, ST.st.mode, ST.st.direction, ST.transpose,
    g.unit, g.rowsPerMeasure, g.totalBeats, g.nMeasures
  ];
  /* 网格指纹：每行记「列号:音高:时值:声部」，休止行记 '0'（够区分，且不依赖派生字段）。 */
  g.rows.forEach(function(r){
    parts.push(r.rest ? '0' : r.items.map(function(it){
      return it.col + ':' + it.midi + ':' + it.dur + ':' + (it.voice || 0);
    }).join(','));
  });
  return parts.join('|');
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { ATTACH_IDS, ST, afterEdit, attachAfterDraw, attachLinkUrl, attachQR, attachSongTitle, attachTitleVal, attachVal, attachVals, baseName, dl, draftBuild, draftSave, draftScheduleSave, draw, kalHasUnsaved, kalSnapshot, lastExportNote, pagedCount, pagedLayout, qrSvg, renderAxisBar, report, scoreTitle, setLastExportNote, setPagedLayoutFlag, sheetCount };
