/* =====================================================================
   studio.js —— 工作台装配层（页面状态 / 事件接线 / 重画）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { KEYS, TUNINGS, bestTranspose, buildTuning, degreeToMidi } from './core.js';
import { bindEditor, editMode, setEditMode, updateGhost } from './editor.js';
import { buildLegend, exportSvg, noteExported, pngBytesOf, renderForExport, zipStore } from './exporter.js';
import { $, BPM_MAX, BPM_MIN, META_ALIAS } from './foundation.js';
import { buildGrid, gridToJianpu } from './layout.js';
import { decodeXmlText, midiChannelParsed, parseMidi, parseMusicXML, parseSource, tempoNote, xmlTitle } from './parser.js';
import { invalidatePlayback, play, previewNote, resetProgress, stopPlayback, syncProg } from './player.js';
import { CW, RD, escAttr } from './renderer.js';
import { ATTACH_IDS, ST, attachQR, attachTitleVal, baseName, dl, draw, pagedLayout, report, scoreTitle, setPagedLayoutFlag } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   7. 界面装配 / 自动移调 / 导出
   ===================================================================== */

const SAMPLE = [
  '# 卡林巴转谱工坊 · 示例（可直接在谱面上点选修改）',
  '# 空行或注释 = 分段；同一段里的多行 = 多个声部，按小节与拍位自动对齐合并',
  'title: 小星星（示例）',
  'key: 1=C',
  'meter: 4/4',
  'tempo: 88',
  '',
  'M: 1 1 5 5 | 6 6 5- | 4 4 3 3 | 2 2 1- |',
  'A: [1 3] [1 3] 1 1 | [4 6] [4 6] 1 1 | 2 2 [1 3] [1 3] | 5_5_ 5_5_ 1- |'
].join('\n');

function currentTuning(){
  return ST.tuningKey === 'custom'
    ? buildTuning($('customTuning').value)
    : buildTuning(TUNINGS[ST.tuningKey].notes);
}


/* 悬浮音位轴：连续预览时钉在预览区底部（不随谱面滚走）；
   导出 / 打印 / 分页预览时谱内每页都自带音位轴，这时就把它藏起来避免重复 */

/* 导出时会被切成几栏（末尾多余行不计入、并按小节对齐，与 renderScore 同一口径）。
   注意「栏」≠「张纸」：一张竖向 A4 排 SHEET.COLS 栏 —— 左栏满了接右栏。 */



/* 把文本里带过来的选项落到界面 + 状态上（用户 2026-09-28「导入时需自动加载以上选项」）。
   只在文本确实写了该项时才覆盖（meta 里 null = 没写 → 保持现状），所以老文本行为不变。 */
function applyMetaOpts(m){
  if(!m) return;
  if(m.mode){ ST.st.mode = m.mode; const el = $('modeSel'); if(el) el.value = m.mode; }
  if(m.direction){ ST.st.direction = m.direction; segSet('dirSeg', m.direction); }
  if(m.tuning){
    ST.tuningKey = m.tuning;
    const sel = $('tuningSel'); if(sel) sel.value = m.tuning;
    if(m.tuning === 'custom' && m.tuningNotes){ const ct = $('customTuning'); if(ct) ct.value = m.tuningNotes; }
    const cw = $('customWrap'); if(cw) cw.style.display = m.tuning === 'custom' ? 'block' : 'none';
  }
  ST.transpose = (m.transpose === null || m.transpose === undefined) ? 0 : m.transpose;
  ST.st.transpose = ST.transpose;
}
/* 反向导出时要一并写出的选项（琴型 + 自定义音位表原文） */
function exportOpts(){
  return {tuningKey: ST.tuningKey,
          tuningNotes: ST.tuningKey === 'custom' && $('customTuning') ? $('customTuning').value : ''};
}

/* 把某一项写回简谱文本的头部（有就替换、没有就插到最前）—— 与 #keySel 的做法同一口径。
   ★ 为什么必须做：文本里若留着旧值，下一次「生成琴谱」（那是**唯一**会按文本走的入口）
     就会把用户刚选的琴型/方式弹回去。写了它，「改控件」与「文本」永远一致。 */
function setMetaLine(key, val){
  const el = $('src'); if(!el) return;
  const alts = [key].concat((META_ALIAS[key] || '').split('|')).filter(Boolean);
  const re = new RegExp('^(?:' + alts.join('|') + ')\\s*[:：].*$', 'mi');
  const txt = el.value;
  el.value = re.test(txt) ? txt.replace(re, key + ': ' + val) : (key + ': ' + val + '\n' + txt);
}

function rebuild(applyMeta){
  ST.parsed = parseSource($('src').value);
  const m = ST.parsed.meta;
  if(m.keyName) $('keySel').value = m.keyName;
  /* ★ applyMeta 只在「用户明确说『按这份文本生成』」时为真（生成琴谱 / 谱面转换）。
     改控件（琴型 / 读谱方式 / 网格精度…）引起的重画**不许**再回头读文本 ——
     否则文本里那句 "tuning: 17" 会把用户刚选的 21 立刻弹回去（2026-09-28 用户报的回归）。 */
  if(applyMeta) applyMetaOpts(m);
  ST.tuning = currentTuning();
  ST.grid = buildGrid(ST.parsed, ST.st, ST.tuning);
  ST.dirty = false;
  invalidatePlayback();             // 换了谱面，进度回到开头
  syncBpm();                        // 简谱文本里的 tempo: 就是这个入口的真源
  draw(); report();
}

function guardRebuild(applyMeta){
  if(ST.dirty && !confirm('谱面已手动点选编辑过，重新生成会覆盖这些改动。继续吗？')) return;
  rebuild(applyMeta);
}

/* 自动移调：在 ±12 半音内找“落在音域内的音最多”的移调量 */
function autoFit(){
  if(!ST.grid) rebuild();
  const midis = [];
  ST.parsed.events.forEach(ev => ev.items.forEach(it =>
    midis.push(degreeToMidi(it.deg, it.oct, it.alter, ST.st.mode, ST.parsed.meta.keyPc))));
  if(!midis.length) return;
  const best = bestTranspose(midis, ST.tuning, 12);
  ST.transpose = best; ST.st.transpose = best;
  setMetaLine('transpose', best);          // 移调量也写回文本，别让「生成琴谱」把它抹掉
  ST.grid = buildGrid(ST.parsed, ST.st, ST.tuning);
  draw(); report();
  $('stat').textContent += ' · 已移调 ' + (best > 0 ? '+' : '') + best + ' 半音（' +
    (ST.grid.warnList.length ? '仍有 ' + ST.grid.warnList.length + ' 种音在音域外' : '全部音符都落在音域内') + '）';
}

/* ---------- 导出 ---------- */
/* 导出用的排版是“分页版”，与屏幕上的连续预览无关。
   split=false（默认）：所有纸竖着叠成一张 SVG（纸间留 10px）—— 导出 SVG 用。
   一张画布装得下整谱，翻看方便；每张纸内部仍然自带音位轴和同高的页眉带。
   split=true：每张纸单独出一张 SVG，纸内尺寸与打印 / 存 PDF 的每一页完全一致
   （同一条 rowsPerCol() 切栏规则），供「导出 PNG」逐张转图 —— 这样 PNG 和
   打印稿永远对得上，不会出现「图上第二张顶跑到第一张底」那种串页。
   渲染是纯函数，但会写 lastGeom（点选编辑的命中信息），所以用完要还回去。 */

/* ---------- 文件名 ---------- */
/* 一律以简谱里的 title（曲名）为基准；没写曲名就用「未命名卡林巴谱」。
   中文文件名浏览器下载没问题，但 \ / : * ? " < > | 这些字符在 Windows 上
   直接写不出文件，统一换成下划线；首尾的点和空格也去掉（Windows 会截掉）。 */
const zipName  = () => (scoreTitle() || '未命名') + '卡林巴谱.zip';
/* 多张才带序号（春天来吧1.png、春天来吧2.png），单张不加多余的 1 */
const pngName = (base, i, total) =>
  total > 1 ? base + (i + 1) + '.png' : base + '.png';


/* ---------- 极简 ZIP（store，不压缩） ----------
   PNG 本身已是压缩数据，再套一层 deflate 收益几乎为零；不压缩就不必引第三方库，
   单文件页面继续保持零依赖。两个容易踩的点：
   ① 中文文件名必须把通用位标记置 0x0800（UTF-8），否则 Windows 解压端按本地
      代码页读文件名 → 乱码；
   ② 本地文件头 / 中央目录 / 结尾记录三处的「偏移量、长度」必须自洽，
      中央目录里记的 offset 是**本地头在整包中的起点**，不是数据区的起点。 */

/* 一页 SVG → PNG 字节。走 <img> + canvas：SVG 里的字体是系统字体（微软雅黑等），
   在 img 环境里能正常取到，所以字形与屏幕上一致。k = 2 是 2 倍图，缩放后仍清晰。 */

/* 状态栏追加一句导出结果。用「记住上次那句再精确摘掉」而不是无脑 +=：
   连点几次导出，状态栏会攒出一长串「已导出 …已导出 …」。 */

/* 导出 PNG：先按打印 / 存 PDF 的同一条规则截断成若干页，再逐页转 PNG。
   只有一页 → 直接给 PNG；多页 → 打成一个 zip（连续弹好几个下载框太吵）。
   命名：曲名 / 未命名卡林巴谱，多张带序号，zip 用「曲名 + 卡林巴谱」。 */
async function exportPng(){
  if(!ST.grid) return;
  const pages = (renderForExport(true, true).pages) || [];
  const btn = $('btnPng'), label = btn.textContent;
  btn.disabled = true;
  try{
    if(!pages.length) throw new Error('没有可导出的内容');
    const base = baseName(), files = [];
    for(let i = 0; i < pages.length; i++){
      btn.textContent = pages.length > 1 ? '导出中 ' + (i + 1) + '/' + pages.length : '导出中…';
      await new Promise(r => requestAnimationFrame(r));       // 让按钮文字有机会刷新
      files.push({name: pngName(base, i, pages.length), data: await pngBytesOf(pages[i])});
    }
    if(files.length === 1) dl(new Blob([files[0].data], {type:'image/png'}), files[0].name);
    else dl(zipStore(files), zipName());
    noteExported(files.length + ' 张 PNG' +
      (files.length > 1 ? '（' + zipName() + '）' : '（' + files[0].name + '）'));
  }catch(err){
    alert('PNG 导出失败：' + ((err && err.message) || err) + '\n可改用「导出 SVG」。');
  }finally{
    btn.disabled = false; btn.textContent = label;
  }
}

/* 打印 / 存 PDF：临时切到分页排版，出图后切回连续预览。
   ★ pagedLayout 与 ST.paged 是**两件事**，别合并：
       · ST.paged     —— 用户勾了「分页预览」，屏幕上要一直看这个版式；
       · pagedLayout  —— 此刻是不是正在**出纸 / 导出**（真打印那一下）。
     差别就在简谱对照：出纸时收掉，预览时保留（用户 2026-09-18 明确）。
   ⚠️ 退出时要按**勾选框的实际状态**还原 ST.paged，不能无脑写 false ——
      否则「勾了分页预览 → 打印一次 → 回到屏幕」会变成连续预览，
      而勾选框还显示着勾（用户看到的与状态不符）。这是本轮顺手修掉的老 bug。 */
function setPagedLayout(on){
  const v = !!on;
  if(pagedLayout === v) return;
  setPagedLayoutFlag(v);
  const box = $('optPaged');
  ST.paged = v ? true : !!(box && box.checked);
  if(ST.grid) draw();
}
function printScore(){
  setPagedLayout(true);
  try { window.print(); } finally { setTimeout(() => setPagedLayout(false), 0); }
}
window.addEventListener('beforeprint', () => setPagedLayout(true));
window.addEventListener('afterprint',  () => setPagedLayout(false));


/* =====================================================================
   QR 编码器（Model 2 · byte 模式 · EC 级别 M · 版本 1-10 自动选）
   —— 挂在 window.KAL_QR。页面是**单文件零依赖**（无构建、无 CDN），
      二维码又必须「用户边打字边刷新」，只能在运行时自己算。

   ⚠️ 正确性不是靠肉眼看的：这份实现配 `kal_qr_suite.py` 做过**逐格**校验 ——
      对 60..199 字节的每个长度，都与 python-qrcode（强制同版本同掩码）逐格比对，
      **0 组差异**，版本 1-10 全覆盖。
      写的过程中真踩到两个坑，都是这套校验逼出来的：
        ① 定位图形同心环判反（d=3 外环该深、d=2 亮环该浅）→ 图样「像二维码」但扫不出；
        ② 校准图形漏放 —— 当时用「中心已是功能格就跳过」，把落在**定时行/列**上的
           v7+ 校准图形（(6,22)/(22,6) 这些）一起跳掉了 → v6 及以下全对，v7 起全废。
      两条都属于「肉眼完全看不出、图样依然很漂亮」的那种 bug。 */

/* ---------- 附加设置侧栏（用户 2026-09-17）----------
   用途：标题 / 作者 / 作者链接 / 附加信息 —— **以后**印在每页底部当页脚。
   ★ 本轮只做到「侧栏 + 存取」，页脚**故意没做**（用户明确说先不做）。
   ★ 取值的唯一出口是 attachVals()：将来写页脚 / 导 PDF / 导 PNG 都从这里拿。
     ⚠️ 别在页脚那边再直接读一遍 DOM，也别再存一份 ST.attach —— 双份状态一定会漂。 */

/* 谱面里的曲名。与文件名那套 scoreTitle() 同一个口径：
   「未命名」是系统的**占位值**（没写曲名时 parser 填的），当没写处理。 */
/* 标题**跟着曲名走**，直到用户手动改过为止。
   为什么不无条件跟：用户改了标题之后再换个谱、或点一下「重新生成」，
   手填的标题就被曲名顶掉了 —— 那是白填，比不跟还烦人。
   为什么清空也算「改过」：清空是个明确的意图（我不想印标题），不能被曲名塞回来。 */
/* 打开侧栏时把标题灌进输入框（另外三个字段从一开始就是空，且只有用户会改，
   值就留在输入框里，不用来回搬）。 */
function attachFillTitle(){
  const t = $(ATTACH_IDS.title);
  if(t) t.value = attachTitleVal();
}
/* 谱面重画之后调用：把「跟着曲名走」的标题刷一下。
   ⚠️ 只在侧栏开着、**且输入框没被聚焦**时回写 ——
      用户正在里面打字时回写会把光标顶到末尾（打一个字跳一次，非常难受）。 */

/* ---------- 作者链接二维码（用户 2026-09-17）----------
   规则（用户定稿）：链接**非空且符合链接格式** → 显示二维码；
   空 / 不合法 → 显示「输入作者链接可预览」。 */
/* 「符合链接格式」的判据：能解析出 http(s) 协议 + 一个像域名的 host。
   ★ 为什么要收得这么严：只判「里面有没有点」会把 `a..b`、`...`、`1.2` 全放进来，
     于是用户打了个半截句子也弹出二维码。也不能只看 `new URL()` 不抛错 ——
     `new URL('aaa:bbb')` 是合法的（协议 aaa），那种不该算链接。
   ★ 顶级域**不能全是数字**：这是把 `1.2`（版本号、小数、半句话）挡在外面的关键一条。
     只要求 host 带点远远不够 —— `1` 和 `2` 都是合法的 hostname 标签，`1.2` 会顺利过关，
     用户敲了个版本号就弹出二维码（回归探针 qr 的「③ 非法 1.2」就是这么抓出来的）。
     现实里没有全数字的 TLD，所以这条规则既准确又便宜。
     ⚠️ 明确被这条挡掉的还有**纯数字 IP**（`127.0.0.1`、`192.168.1.1`）——
        这是有意的：作者链接是给人扫码看的，写 IP 基本是调试/内网地址，
        扫了也没意义，宁可让它落到「输入作者链接可预览」的提示态。
   ★ 没写协议的裸域名（`space.bilibili.com/123` 这种最常见的粘贴形态）**算链接**，
     补上 `https://` 再验一次；补出来的这个串就是要编码进二维码的内容。 */
/* 矩阵 → **界面用**的完整 SVG 文档串。深色格同样走 qrPathD()（与纸面通道同一份），
   这里只负责包壳：viewBox + 白底 + crispEdges。
   shape-rendering:crispEdges 防止半像素处的灰边（二维码最怕灰边）。 */

/* 附加信息改动后重排纸面。
   ★ 只有**分页版式**才需要重排 —— 连续预览里根本不画标题 / 作者 / 附加信息 / 二维码
     （那是工作视图），每敲一个字就重排整谱只会卡手。
   ★ 去抖 180ms：一页谱是几百个图元，逐键重排在长谱上会掉帧；180ms 打字时基本无感。
   ⚠️ 定时器里再判一次 ST.paged：去抖窗口内用户可能刚把「分页预览」关掉。 */
let attachTimer = 0;
function redrawForAttach(){
  if(!ST.paged) return;
  clearTimeout(attachTimer);
  attachTimer = setTimeout(() => { if(ST.paged) draw(); }, 180);
}

/* 开 / 关侧栏。
   ★ 必须重贴进度条：预览区一窄，.stage 的宽度和滚动条净宽都变了，
     progBar 的 right（= 滚动条净宽 + 右边框 + 5px 缝，见 progPlace）立刻过期。
   ⚠️ 不要在这里改 .stage 的高度或 max-height —— 侧栏与预览区的等高是
      .workRow 的 flex stretch 干的（两边的 max-height 用的是同一个表达式）。 */
function applyAttach(){
  const p = $('attach'), b = $('btnAttach');
  if(!p) return;
  p.classList.toggle('on', !!ST.attachOpen);
  if(b) b.classList.toggle('on', !!ST.attachOpen);
  if(ST.attachOpen){ attachFillTitle(); attachQR(); }
  syncProg(true);
}
function toggleAttach(){ ST.attachOpen = !ST.attachOpen; applyAttach(); }

/* ---------- 初始化 ---------- */
function seg(id, cb){
  const box = $(id);
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b || b.disabled) return;
    [...box.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset.v);
  });
}
/* 以编程方式把某组 .seg 的选中项设成 v —— 与上面点击时的写法同一口径（只切 .on）。
   导入的文本带了「读谱方向」时要把它落到界面上，否则状态变了、按钮还亮在旧的那颗。 */
function segSet(id, v){
  const box = $(id); if(!box) return;
  [...box.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x.dataset.v === v));
}

/* 「点选编辑」是时值选择按钮的前置条件：未开启时整组灰掉且真的 disabled，
   并把当前选中的那一颗也从绿色降回灰底 —— 否则「亮着却是灰的」看着像坏了。
   编辑开关本身也在这里同步 .on，避免两处各写一遍。 */
function syncEditUI(){
  const box = $('durSeg');
  if(box){
    box.classList.toggle('off', !editMode);
    box.querySelectorAll('button').forEach(b => { b.disabled = !editMode; });
    box.title = editMode ? '点选编辑：选一个时值再落笔'
                         : '开启「点选编辑」后才能选时值';
  }
  const eb = $('btnEdit');
  if(eb) eb.classList.toggle('on', editMode);
}

/* ---------- 速度（BPM）控件 ----------
   ★ 为什么需要它：**扫描谱没有速度信息**。Audiveris / PhotoScore 出的 MusicXML 里
   连一个 `<sound tempo>` / `<metronome>` 都没有（实测「狐姬零」整份 0 处），
   原曲多快在文件里不存在 —— 这时只能落到兜底 88 BPM。若原曲是 120 BPM，
   听感就是「整体慢了 36%」，用户没法自己救。给一个显式入口是唯一诚实的做法。
   速度的**唯一真源**是 ST.grid.meta.tempo（播放的 rowSec、页眉的「N BPM」、
   反向导出简谱的 `tempo:` 行都从它读）。setTempo 一处改、三处一起变。 */
function syncBpm(){
  const el = $('bpmIn'); if(!el) return;
  const tp = (ST.grid && ST.grid.meta && ST.grid.meta.tempo) || 88;
  el.value = Math.round(tp);
}
function setTempo(v){
  const g = ST.grid; if(!g) return;
  let tp = Math.round(parseFloat(v));
  if(!isFinite(tp)) tp = Math.round(g.meta.tempo) || 88;
  tp = Math.max(BPM_MIN, Math.min(BPM_MAX, tp));   // 越界值夹到 20~300
  if(tp !== Math.round(g.meta.tempo)){
    g.meta.tempo = tp;
    if(ST.parsed && ST.parsed.meta) ST.parsed.meta.tempo = tp;   // 否则点「生成琴谱」又退回旧速度
    /* 简谱输入框里那行 `tempo: N` 必须跟着改：不然后手点「生成琴谱」会把速度打回原样，
       「改了没反应」很难查。只在本来就写了 tempo 行时改，不替用户新增一行。 */
    const src = $('src');
    if(src && /^[ \t]*tempo\s*:/mi.test(src.value))
      src.value = src.value.replace(/^([ \t]*tempo\s*:)[^\n]*/mi, '$1 ' + tp);
    invalidatePlayback();                          // 速度变了，记忆的播放秒数作废
    draw();                                        // 重画页眉里的「N BPM」
  }
  syncBpm();     // ★ 只在这一处回写输入框：值越界 / 非数字时也要把夹住后的结果显示出来
}
/* 打字中途别抢：输入「120」时会依次经过 1 / 12 —— 那两个值越界，直接不动，
   绝不在用户还在打字时把框里的内容改写成夹住后的数字。 */
function onBpmInput(e){
  const v = Math.round(parseFloat(e.target.value));
  if(!isFinite(v) || v < BPM_MIN || v > BPM_MAX) return;
  setTempo(v);
}

/* ---------- MusicXML 导入 ----------
   思路：MusicXML 已是语义化乐谱（pitch / duration / divisions / type / dot / chord 都标好了），
   比 MIDI 好解析得多。把它转成和 parseSource 完全同构的 {meta, events}，直接喂给 buildGrid，
   于是「音高 -> 琴键轨道」的整套映射、分页、导出都复用现有逻辑。
   难点只在：把绝对音高（MIDI）反演成（deg, oct, alter, tok），使得
   degreeToMidi('fixed', keyPc) 精确还原该音高 —— 这样反向导出也能得到合法简谱。 */

/* 曲名兜底：扫描谱（Audiveris / PhotoScore / SmartScore）整份常没有
   <work-title> / <movement-title> —— 实测 `カレンデュラ——狐姬零.mxl` 就是
   Audiveris 5.11 出的，只有 <part-name>Piano</part-name>。以前兜底写「MusicXML 导入」，
   和面板标题一字不差，导入成功的提示会变成「✓ 已导入 MusicXML 导入 · 971 个音」，
   看着像报错。改成「有标题就用标题，没有就用导入的文件名」，与 MIDI 侧口径一致
   （MIDI 也是 file.name 去扩展名）。'未命名' 是系统既有的占位曲名，
   scoreTitle() 会把它从导出文件名里剔掉，所以兜到底也不会污染下载名。 */


/* ---------- 速度（tempo）的三种写法 ----------
   ★ 本轮「导入后听着很慢」的根因就在这里：`<sound tempo="120"/>` 在标准 MusicXML 里是
   **`<direction>` 的子元素**（MuseScore / Finale / Sibelius 全都这么导），
   而旧实现只在 `el.tagName === 'sound'` 时读它 —— 于是**任何带速度标记的谱都读不到**，
   一律落到兜底值 88 BPM。120 BPM 的谱按 88 播 = 每个音长 36%，听感就是「整体拖慢」；
   140 BPM 的谱更是慢 59%。实测 A 组夹具（`<sound tempo="120"/>`）旧代码读出来是 88。
   时值本身没错（同一条夹具 8 拍 = 4 个四分 + 8 个八分，一拍不差），纯粹是速度。
   顺带补上 `<metronome>`（`beat-unit` × `per-minute`）：部分手写谱 / 导出器只写节拍器。 */
/* 从一个 <direction> 里取速度（四分音符/分钟）。返回 0 = 这份 direction 没有速度信息。
   `sound` / `metronome` 两处都可能出现，两个规则都要过一遍：
   ① `<sound tempo>` 按规范**已经是四分音符/分钟**，直接用；
   ② 只有判据「sound@tempo === per-minute 且 beat-unit 不是四分音符」成立时，
      才认为导出器把「拍」的数值写进了 sound（2/2 记 half=60 而真值四分=120），
      此时乘回 beat-unit 与四分的比值。MuseScore 在 2/2 下写的是 sound=240 / per=120，
      两者不等 → 走 ①，不会被误乘。 */


/* 选「主旋律」声部：平均音高最高者优先，音符数多者次之（中西方记谱里旋律通常在最高声部）。
   但 OCR（如 Audiveris）导出的谱常有极短残片声部（几个音），其平均音高可能略高却并非真旋律 ——
   先用「音符数阈值」把这些残片踢掉，只在够分量的声部里挑音高最高的，
   避免主旋律被 10 个音的残片以半音之差顶替（原 bug：狐姬零导入只剩 10 个音）。 */
/* 声部分组键：**必须带上 part 序号**，不能只看 `<voice>`。
   多乐器谱（旋律 + 伴奏）里两个 <part> 的 <voice> 常常都叫 '1'，只按 voice 分组会
   把它们当成同一个声部 → 「仅保留主旋律」一个音都不删（实测：旋律 4 音 + 伴奏 4 音被并成
   4 行 × 2 音的和弦、音域一路低到 G2，提示却照样写着「仅主旋律」）。
   带上 part 后，单 part 谱的分组与从前**完全一致**（所有事件 part 都是 0），行为不变。 */


function applyImported(parsed, msgEl){
  const msg = msgEl || $('xmlMsg');
  if(parsed.error){ if(msg) msg.textContent = '✗ ' + parsed.error; return; }
  if(!parsed.events.length){ if(msg) msg.textContent = '✗ 谱里没有可导入的音符'; return; }
  ST.parsed = parsed;
  ST.st.mode = 'fixed'; $('modeSel').value = 'fixed';     // 导入按真实音高，固定调最直观
  ST.transpose = 0; ST.st.transpose = 0;
  ST.tuning = currentTuning();
  ST.grid = buildGrid(parsed, ST.st, ST.tuning);
  ST.dirty = false;
  $('src').value = gridToJianpu(ST.grid, ST.st, exportOpts());
  if(parsed.meta.keyName) $('keySel').value = parsed.meta.keyName;
  invalidatePlayback();
  syncBpm();
  draw(); report();
  if(msg) msg.textContent = '✓ 已导入 ' + parsed.meta.title + ' · ' +
    parsed.events.filter(e => !e.rest).reduce((n,e) => n + e.items.length, 0) + ' 个音' +
    (parsed.mainOnly ? '（仅主旋律）' : '') +
    tempoNote(parsed) +
    (parsed.note ? '（' + parsed.note + '）' : '') +
    (ST.grid.warnList.length ? '（' + ST.grid.warnList.length + ' 种音超出音域，点「⤢ 移调」调整）' : '');
}

/* 导入提示里的速度说明：把「速度是怎么来的」讲清楚，并在读不到时指出补救入口。
   ★ 用户报「xml 导入听着很慢」时最需要的就是这一条：到底是谱里写了速度而没被读到，
   还是谱里根本没有速度信息（扫描谱）—— 前者是 bug，后者只能靠用户自己设。 */

/* 把 MusicXML 字节解成文本。**不能无脑 `new TextDecoder('utf-8')`** —— 实测（六种编码同一份谱
   从真实 file input 灌进去）：
     UTF-8 / UTF-8+BOM  → ✓ 正常
     UTF-16 LE / LE+BOM / BE+BOM → ✗ 整份变乱码 → DOMParser 报「不是合法 XML」，
       用户只看到一句没头没脑的错误（而 UTF-16 恰恰是西贝柳斯 / MuseScore 的常见导出）
     GBK → ✓ **看起来导入成功，中文曲名却是乱码**「С���ǡ��������」
        —— 这种「假成功」比直接失败更糟：用户以为成了，其实标题已坏。
   判据顺序：BOM → 无 BOM 的 UTF-16 字节序特征 → XML 声明里的 encoding → 兜底 UTF-8。
   XML 一定以 `<?xml` 开头，所以「`<` 后面紧跟 0x00」就是 UTF-16，这个特征比声明更可靠。 */

async function inflateRaw(bytes){
  if(typeof DecompressionStream === 'undefined')
    throw new Error('当前浏览器不支持解压 .mxl（DecompressionStream）');
  const ds = new DecompressionStream('deflate-raw');
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

/* 极简 ZIP 读取：定位 EOCD -> 中央目录 -> 取第一个 .xml 条目，按 deflate-raw 解压 */
async function unzipMxl(bytes){
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for(let i = bytes.length - 22; i >= 0; i--)
    if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if(eocd < 0) throw new Error('.mxl 不是合法的 zip 包');
  const cdOff = dv.getUint32(eocd + 16, true);
  let p = cdOff;
  while(p + 4 <= bytes.length && dv.getUint32(p, true) === 0x02014b50){
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const fnLen = dv.getUint16(p + 28, true);
    const exLen = dv.getUint16(p + 30, true);
    const cmLen = dv.getUint16(p + 32, true);
    let name = '';
    for(let j = 0; j < fnLen; j++) name += String.fromCharCode(bytes[p + 46 + j]);
    const local = dv.getUint32(p + 42, true);
    if(name.toLowerCase().endsWith('.xml') && !/META-INF/i.test(name) && !/container\.xml$/i.test(name)){
      const lfn = dv.getUint16(local + 26, true);
      const lex = dv.getUint16(local + 28, true);
      const start = local + 30 + lfn + lex;
      const chunk = bytes.subarray(start, start + compSize);
      const raw = method === 0 ? chunk : await inflateRaw(chunk);
      return decodeXmlText(raw);                       // .mxl 里的 xml 同样是任意编码
    }
    p += 46 + fnLen + exLen + cmLen;
  }
  throw new Error('.mxl 里找不到 MusicXML 文件');
}

async function handleXmlFile(file){
  const msg = $('xmlMsg'); if(msg) msg.textContent = '读取中…';
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const isMxl = /\.mxl$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
    const text = isMxl ? await unzipMxl(bytes) : decodeXmlText(bytes);   // 别写死 utf-8，见 decodeXmlText
    const parsed = parseMusicXML(text, $('xmlMain').checked);
    /* ★ 两个坑都在这一行附近，别顺手简化：
       ① 出错时 parseMusicXML 返回 {error} 且**没有 meta** —— 无条件写 parsed.meta.title
          会抛 TypeError 并被外层 catch 吞掉，用户看到的就不是「未找到根节点」而是
          「Cannot set properties of undefined」，错误原因被彻底掩盖。
       ② ST.lastXml 只能在**解析成功之后**才存 —— 旧写法把它放在 parse 之前，
          导入一个坏文件就会污染缓存，之后每次切换「仅保留主旋律」都会连带崩。 */
    if(!parsed.error){
      parsed.meta.title = xmlTitle(parsed, file.name);
      ST.lastXml = text;                               // 供「仅保留主旋律」勾选切换时重导
      ST.lastXmlName = file.name;                      // 曲名兜底要用文件名，重导时也得记得
    }
    applyImported(parsed);                             // 出错时由它统一输出 ✗ 提示
  } catch(err){ if(msg) msg.textContent = '✗ ' + (err.message || '读取失败'); }
}

const SAMPLE_XML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<score-partwise version="4.0">\n' +
'  <work><work-title>小星星（MusicXML 示例）</work-title></work>\n' +
'  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>\n' +
'  <part id="P1">\n' +
'    <measure number="1">\n' +
'      <attributes><divisions>4</divisions><key><fifths>0</fifths></key>' +
'        <time><beats>4</beats><beat-type>4</beat-type></time>' +
'        <clef><sign>G</sign><line>2</line></clef></attributes>\n' +
/* 速度标记写在 <direction> 里 —— 这正是 MuseScore / Finale / Sibelius 的实际写法，
   也是「导入后听着很慢」那个 bug 的现场：旧实现只在 <measure> 的直接子元素里找
   `<sound>`，于是这一处永远读不到、整首按兜底 88 BPM 播。示例带上它，等于随时在跑这条路径。 */
'      <direction placement="above"><direction-type><metronome>' +
'        <beat-unit>quarter</beat-unit><per-minute>100</per-minute>' +
'      </metronome></direction-type><sound tempo="100"/></direction>\n' +
'      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'    </measure>\n' +
'    <measure number="2">\n' +
'      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type></note>\n' +
'      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><type>half</type></note>\n' +
'    </measure>\n' +
'  </part>\n' +
'</score-partwise>';

/* ---------- MIDI 导入 ----------
   MIDI 是事件流：每个音符自带 通道(ch) / 音高 / 力度 / 起始 tick / 时长，通道与音色(program)
   一一对应 —— 比 MusicXML 的 voice 干净得多，天然适合「按通道分离主旋律」。
   思路：解析标准 MIDI 文件(SMF) → 按通道把音符归并成 events（voice = 通道号）→ 自动挑旋律通道
   → 交给与 parseSource / parseMusicXML 完全同构的 {meta, events} 复用 buildGrid 的映射/分页/导出。 */





/* 选一个「够粗又够准」的时间格：从 1 拍 → 1/8 拍，取第一个能让 ≥90% 音符对齐的网格。
   避免整首歌被个别偏离网格的音拖到 1/8 拍 → 谱面行数翻几倍。 */

/* 自动识别「主旋律通道」：排除鼓组与零星通道，用 近单声部 + 音符数 + 音高寄存器 + 时间覆盖 + 平均时值 加权。
   旋律的典型特征：同一时刻基本只响一个音（近单声部）、音数适中偏多、音区中高、贯穿全曲、时值较长。
   音色名只作显示，不参与判断 —— 因为同一音色（如钢琴）里旋律与伴奏可能同轨。 */

/* 从指定通道的原始音符现场构建可喂给 buildGrid 的子结构（时间格自适应）。
   ★ 第二个参数**单通道传数字、多通道传数组**（用户 2026-09-23 定：多个通道合并成一份谱）。
     为什么用「数字或数组」而不新增一个函数：小程序生成器是 `sliceFn('midiChannelParsed')`
     按**函数名**摘这一段的，新增函数就得同时改生成器与端口校验；改签名对它们完全透明。
   ★ 网格单位必须对**合并后的音符全集**算一次 —— `pickMidiUnit` 是按单通道自适应的，
     两通道各算各的会得到不同栅格，合并后时间轴立刻错位（同一时刻的音落不进同一格）。
   ★ 同一时刻来自不同通道的音符合进**同一个 event 的 items** → 网格上就是「同格多音」，
     即卡林巴上要同时按下的那几根条，这正是「合并成一份谱」想要的形态。 */

/* ---------- MIDI 通道行：可多行，合并成一份谱 ----------
   ★ 语义（用户 2026-09-23 定）：多行 = **多通道合并**，不是「换一个通道再听一遍」。
     第一行是自动识别出的主旋律，加号新增的行往同一份谱上加声部。
   ★ 同一通道不允许被两行同时选中 —— 那会把该通道的音符叠加两次、音数直接翻倍，
     而谱面上看不出任何异常（用户只会觉得「音怎么多了」）。已选通道在**别的行**里
     渲染成 disabled；通道用满时加号按钮自己禁用，免得加出一个什么都选不了的空行。 */
/* 图标：加号 = 新增通道行，横线 = 移除该行（用户 2026-09-23 给的两段 path）。
   尺寸交给 CSS（原 SVG 标的是 200），fill 换成 currentColor 才能跟着 hover 变色。 */
const SVG_CH_ADD = '<svg class="chIcon" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M853.333333 480H544V170.666667c0-17.066667-14.933333-32-32-32s-32 14.933333-32 32v309.333333H170.666667c-17.066667 0-32 14.933333-32 32s14.933333 32 32 32h309.333333V853.333333c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V544H853.333333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z" fill="currentColor"></path></svg>';
const SVG_CH_DEL = '<svg class="chIcon" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M170.666667 480h682.666666c17.066667 0 32 14.933333 32 32s-14.933333 32-32 32H170.666667c-17.066667 0-32-14.933333-32-32s14.933333-32 32-32z" fill="currentColor"></path></svg>';

function midiChSelEls(){
  const box = $('midiChRows');
  return box ? [].slice.call(box.querySelectorAll('select.midiChSel')) : [];
}
function midiChNameCount(parsed){
  const n = {};
  parsed.channels.filter(c => !c.isDrum).forEach(c => { const k = c.name || ''; n[k] = (n[k] || 0) + 1; });
  return n;
}
/* 除 selfIdx 那一行之外，还有哪些通道已被选中（= 本行里要禁掉的） */
function midiChTaken(selfIdx){
  const taken = {};
  (ST.midiChs || []).forEach((v, i) => {
    if(i !== selfIdx && v !== null && v !== undefined) taken[v] = 1;
  });
  return taken;
}
/* 当前已选（非空）的通道 —— 合并用的就是它 */
function midiChsPicked(){
  return (ST.midiChs || []).filter(v => v !== null && v !== undefined);
}
/* 选项文案的**唯一出处**：整行渲染与「只刷禁用态」两条路径共用，免得两份实现漂移。
   选项只写「音色名」（放进【】里要短），通道号/音数放 title 里备查；
   同名音色出现在多个通道时（如两份钢琴轨）追加 chN 以免分不清。 */
function midiChOptText(c, taken, nameCount){
  const base  = c.name || ('通道 ' + (c.ch + 1));
  const short = nameCount[c.name] > 1 ? (base + ' · ch' + (c.ch + 1)) : base;
  const full  = base + '（ch' + (c.ch + 1) + ' · ' + c.count + ' 音）'
              + (taken[c.ch] ? ' —— 已被别的行选中' : '');
  return {short: short, full: full};
}
function midiChOptionsHTML(parsed, selfIdx, allowEmpty){
  const taken = midiChTaken(selfIdx), nameCount = midiChNameCount(parsed);
  /* 只列可成谱的通道（鼓组无音高、不生成谱面，直接不列） */
  const list = parsed.channels.filter(c => !c.isDrum);
  let html = allowEmpty ? '<option value="">（未选择）</option>' : '';
  html += list.map(c => {
    const t = midiChOptText(c, taken, nameCount);
    return '<option value="' + c.ch + '" title="' + escAttr(t.full) + '"'
         + (taken[c.ch] ? ' disabled' : '') + '>' + escAttr(t.short) + '</option>';
  }).join('');
  return html;
}
/* 把每行「当前选中项」的备查文案提到 select 上 —— 原生只在展开下拉时显示 option 的 title，
   收起来后鼠标悬停在 select 上看不到（这是原来就有的行为，保留）。 */
function syncMidiChSelTitles(){
  midiChSelEls().forEach(el => {
    const opt = el.options[el.selectedIndex];
    if(opt) el.title = opt.title || '';
  });
}
/* ⚠️ parsed 走**参数**而不是读 ST.midiParsed：这个函数在「载入新 parsed 之前」也会被调用
   （先渲染行、再落 ST），读全局会让第一处调用**静默返回、什么都不渲染**。 */
function renderMidiChRows(parsed){
  const box = $('midiChRows'); if(!box || !parsed) return;
  const chs = ST.midiChs || [];
  const usable = parsed.channels.filter(c => !c.isDrum).length;
  box.innerHTML = chs.map((v, i) => {
    const sel = '<select class="inline midiChSel" data-row="' + i + '">'
              + midiChOptionsHTML(parsed, i, i > 0) + '</select>';
    if(i === 0){
      /* 加号挂在识别行末尾（用户 2026-09-23）：通道用满就禁用，免得加出选不出东西的空行 */
      return '<div class="chLine"><span class="chLead">目前识别为</span>【' + sel + '】通道'
           + '<button type="button" class="iconbtn" id="btnAddCh" title="新增通道"'
           + (midiChsPicked().length >= usable ? ' disabled' : '') + '>' + SVG_CH_ADD + '</button></div>';
    }
    return '<div class="chLine"><span class="chLead">新增通道</span>【' + sel + '】'
         + '<button type="button" class="iconbtn chDel" data-row="' + i + '" title="移除该通道">'
         + SVG_CH_DEL + '</button></div>';
  }).join('');
  /* innerHTML 重建会丢选中态，逐行落回去 */
  midiChSelEls().forEach((el, i) => {
    el.value = (chs[i] === null || chs[i] === undefined) ? '' : String(chs[i]);
  });
  syncMidiChSelTitles();
}
/* 只刷「禁用态 / 备查文案」，**不重建 DOM** —— 用户刚点完原生下拉，重建会让交互闪一下。 */
function refreshMidiChOptions(){
  const parsed = ST.midiParsed; if(!parsed) return;
  const list = parsed.channels.filter(c => !c.isDrum);
  const nameCount = midiChNameCount(parsed);
  midiChSelEls().forEach((el, i) => {
    const taken = midiChTaken(i);
    [].forEach.call(el.options, o => {
      if(o.value === '') return;
      const ch = parseInt(o.value, 10);
      const t = midiChOptText(list.find(x => x.ch === ch) || {ch: ch}, taken, nameCount);
      o.textContent = t.short;
      o.title = t.full;
      o.disabled = !!taken[ch];
    });
  });
  const btn = $('btnAddCh');
  if(btn) btn.disabled = midiChsPicked().length >= list.length;   // 通道用满
  syncMidiChSelTitles();
}
/* 从 DOM 收一次状态 → 刷新行 → 需要时重导入。
   ⚠️ 判据必须是「**上一次真正应用过**的通道集合」(`ST.midiApplied`)，不能从 ST.midiChs 推 ——
     加行/删行的代码会**先改 ST.midiChs、再调这里**，于是 before 永远是「改后的」，
     删除一个已选通道会被误判成「集合没变」而跳过重导入
     （实测踩过：删掉钢琴通道后行数少了、音数纹丝不动）。
   ⚠️ 但这个判断本身是必要的：「加一个空行 / 删一个空行」时集合确实没变，
     重导入会把用户在简谱区的手动编辑抹掉，而那一下本来什么都不该变。 */
function syncMidiChRows(){
  ST.midiChs = midiChSelEls().map(el => el.value === '' ? null : parseInt(el.value, 10));
  refreshMidiChOptions();
  if(midiChsPicked().join(',') === ST.midiApplied) return;
  applyMidiChannels(midiChsPicked());
}
function applyMidiChannels(chs){
  if(!ST.midiParsed || !chs.length) return;
  const parsed = ST.midiParsed;
  const sub = midiChannelParsed(parsed, chs);
  const unit = sub.midiUnit || 0.25;
  const unitLabel = unit >= 1 ? (unit + ' 拍') : ('1/' + Math.round(1 / unit) + ' 拍');
  /* 说明里把**每个**合并进来的通道都列出来 —— 只报第一个会让人以为另一个没生效 */
  const names = chs.map(ch => {
    const info = parsed.channels.find(c => c.ch === ch) || {};
    return info.name ? ('通道 ' + info.name) : ('通道 ' + (ch + 1));
  });
  sub.note = names.join(' + ') + ' · 网格 ' + unitLabel;
  ST.midiCh = chs[0];
  ST.midiApplied = chs.join(',');              // 记下「这一版谱面用的是哪几个通道」
  applyImported(sub, $('midiMsg'));
}

function populateMidiChannels(parsed){
  /* ★ 顺手把 ST.midiParsed 一起落定：这个函数是「载入一份 parsed 并初始化通道行」的**唯一入口**，
     而 `applyMidiChannels` / `refreshMidiChOptions` 读的都是 `ST.midiParsed`（不是参数）——
     两边不同源就会出现「行按 A 渲染、谱面按 B 生成」。
     2026-09-23 真撞上过：探针用假 parsed 调它、再点加号，渲染用假的、应用用真的，
     于是「通道用满后加号该禁用」那条假红。真实流程里 `handleMidiFile` 恰好先设过 ST，
     所以没暴露 —— 但那是个**隐式契约**，靠调用顺序维持，迟早有人踩。
     现在载入 parsed 是原子的：设 ST.midiParsed + 归位通道行，一起做。 */
  ST.midiParsed = parsed;
  ST.midiChs = [parsed.detected];        // 第一行 = 自动识别出的主旋律
  renderMidiChRows(parsed);
  const wrap = $('midiChWrap'); if(wrap) wrap.style.display = '';
}

async function handleMidiFile(file){
  const msg = $('midiMsg'); if(msg) msg.textContent = '读取中…';
  try {
    const buf = await file.arrayBuffer();
    const parsed = parseMidi(buf);
    if(parsed.error){ if(msg) msg.textContent = '✗ ' + parsed.error; return; }
    if(!parsed.channels || !parsed.channels.some(c => !c.isDrum)){
      if(msg) msg.textContent = '✗ 没有可导入的音符'; return;
    }
    parsed.meta.title = file.name.replace(/\.[^.]+$/, '') || 'MIDI 导入';
    ST.midiParsed = parsed;
    populateMidiChannels(parsed);
    applyMidiChannels([parsed.detected]);
  } catch(err){ if(msg) msg.textContent = '✗ ' + (err.message || '读取失败'); }
}

function init(){
  $('keySel').innerHTML = KEYS.map(k =>
    '<option value="' + k[0] + '"' + (k[0] === 'C' ? ' selected' : '') + '>' + k[1] + '</option>').join('');
  $('src').value = SAMPLE;
  $('customTuning').value = TUNINGS.k21.notes;
  buildLegend();
  bindEditor();

  $('tuningSel').addEventListener('change', e => {
    ST.tuningKey = e.target.value;
    /* 把新琴型写回文本（否则下次「生成琴谱」会拿文本里的旧值把它弹回去） */
    setMetaLine('tuning', ST.tuningKey === 'k21' ? '21' : ST.tuningKey === 'custom' ? 'custom' : '17');
    if(ST.tuningKey === 'custom')
      setMetaLine('tuningNotes', $('customTuning').value.replace(/\s+/g, ' ').trim());
    $('customWrap').style.display = ST.tuningKey === 'custom' ? 'block' : 'none';
    guardRebuild();
  });
  $('customTuning').addEventListener('input', () => {
    if(ST.tuningKey !== 'custom') return;
    setMetaLine('tuning', 'custom');
    setMetaLine('tuningNotes', $('customTuning').value.replace(/\s+/g, ' ').trim());
    guardRebuild();
  });
  $('modeSel').addEventListener('change', e => {
    ST.st.mode = e.target.value; setMetaLine('mode', e.target.value); guardRebuild();
  });
  /* ★ 只有这一处（和「谱面转换」）把 applyMeta 打开：用户明确在说「按这份文本生成」 */
  $('btnParse').addEventListener('click', () => guardRebuild(true));
  $('btnFit').addEventListener('click', autoFit);
  $('btnPlay').addEventListener('click', play);
  $('btnStop').addEventListener('click', stopPlayback);
  $('btnReset').addEventListener('click', () => resetProgress(true));
  /* 速度（BPM）：change 走「夹到 20~300 后落定」，input 只在值已经合法时才动手
     —— 详见 onBpmInput 的说明（打字中途不抢）。 */
  $('bpmIn').addEventListener('input',  onBpmInput);
  $('bpmIn').addEventListener('change', e => setTempo(e.target.value));
  $('bpmIn').addEventListener('keydown', e => {
    if(e.key === 'Enter'){ setTempo(e.target.value); e.target.blur(); }
  });
  $('btnSvg').addEventListener('click', exportSvg);
  $('btnPng').addEventListener('click', exportPng);
  $('btnPrint').addEventListener('click', printScore);

  $('keySel').addEventListener('change', e => {
    const v = e.target.value, txt = $('src').value;
    const re = /^(key|调号)\s*[:：].*$/mi;
    $('src').value = re.test(txt) ? txt.replace(re, 'key: 1=' + v) : ('key: 1=' + v + '\n' + txt);
    guardRebuild();
  });

  seg('dirSeg',  v => { ST.st.direction = v; setMetaLine('direction', v); draw(); });
  seg('unitSeg', v => { ST.st.unitMode = v; guardRebuild(); });
  seg('durSeg',  v => { ST.selectedDur = parseFloat(v); });

  $('optDegree').addEventListener('change', e => { ST.st.optDegree = e.target.checked; draw(); });
  $('optMark').addEventListener('change',   e => { ST.st.optMark   = e.target.checked; draw(); });
  $('optPaged').addEventListener('change',  e => { ST.paged = e.target.checked; draw(); });

  /* 附加设置侧栏：按钮开合 + 独立的 ×；标题一旦被手改就打上 dirty。
     ⚠️ 取值仍然**不另存状态**：attachVals() 现读现取（少一层同步就少一处能漂的地方）。
        但 2026-09-18 起这四个字段**要进纸面**（标题/作者进页眉、附加信息+二维码进右侧信息栏），
        所以输入时必须让页面重排一次 —— 否则用户填了字却看不到版式变化。 */
  $('btnAttach').addEventListener('click', toggleAttach);
  $('btnAttachClose').addEventListener('click', () => { ST.attachOpen = false; applyAttach(); });
  $('atTitle').addEventListener('input', () => { ST.attachDirty = true; redrawForAttach(); });
  $('atAuthor').addEventListener('input', redrawForAttach);
  $('atNote').addEventListener('input', redrawForAttach);
  /* 作者链接一变就重算二维码（非空且合法才显示，否则回到「输入作者链接可预览」） */
  $('atLink').addEventListener('input', () => { attachQR(); redrawForAttach(); });

  /* 点悬浮音位轴的某一列 → 试听该琴键 */
  $('axisBar').addEventListener('pointerdown', e => {
    const svg = e.currentTarget.querySelector('svg');
    if(!svg || !ST.tuning) return;
    const r = svg.getBoundingClientRect();
    if(!r.width) return;
    const vb = svg.viewBox.baseVal;
    const svgX = vb.x + (e.clientX - r.left) * vb.width / r.width;   // 屏幕坐标 → SVG 坐标
    const col = Math.floor((svgX - RD.LEFT) / CW(ST.tuning.len));
    if(col >= 0 && col < ST.tuning.len) previewNote(ST.tuning.notes[col].midi);
  });

  $('btnEdit').addEventListener('click', () => {
    setEditMode(!editMode);
    $('stage').classList.toggle('edit-mode', editMode);
    $('stage').style.cursor = editMode ? 'crosshair' : '';
    syncEditUI();
    updateGhost(null);
  });

  /* 谱面 → 简谱文本（谱面转换）
     ★ 保时值之后这条往返是无损的（音高 / 时值 / 位置 / 四项选项都能回来），
       所以直接走 rebuild() —— 与「生成琴谱」同一条路径，顺带把文本里的选项自动加载上。 */
  $('btnBack').addEventListener('click', () => {
    if(!ST.grid) return;
    $('src').value = gridToJianpu(ST.grid, ST.st, exportOpts());
    rebuild(true);                   // 按刚写出来的文本重建（此时文本与状态本就一致）
  });

  /* 手风琴：三块（简谱输入 / MIDI 导入 / MusicXML 导入）同时只展开一块 */
  (function(){
    const panels = ['foldJianpu', 'foldMidi', 'foldXml'].map(id => $(id)).filter(Boolean);
    panels.forEach(p => p.addEventListener('toggle', () => {
      if(!p.open) return;
      panels.forEach(q => { if(q !== p && q.open) q.open = false; });
    }));
  })();

  /* MIDI 导入：选文件 / 通道行（多行 = 多通道合并成一份谱，见那段注释） */
  $('btnMidiFile').addEventListener('click', () => $('midiFile').click());
  $('midiFile').addEventListener('change', e => { const f = e.target.files[0]; if(f) handleMidiFile(f); e.target.value = ''; });
  /* 行是动态增减的，所以绑在容器上做事件委托 —— 委托冒泡到容器，重渲染不用重新绑 */
  $('midiChRows').addEventListener('change', e => {
    const el = e.target && e.target.closest ? e.target.closest('select.midiChSel') : null;
    if(el) syncMidiChRows();
  });
  $('midiChRows').addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('button.iconbtn') : null;
    if(!btn) return;
    if(btn.id === 'btnAddCh'){
      ST.midiChs.push(null);                       // 新行默认空（用户 2026-09-23）
      renderMidiChRows(ST.midiParsed);
      syncMidiChRows();
    } else if(btn.classList.contains('chDel')){
      const i = parseInt(btn.getAttribute('data-row'), 10);
      ST.midiChs.splice(i, 1);
      renderMidiChRows(ST.midiParsed);
      syncMidiChRows();
    }
  });

  /* MusicXML 导入：选文件 / 示例 */
  $('btnXmlFile').addEventListener('click', () => $('xmlFile').click());
  $('xmlFile').addEventListener('change', e => { const f = e.target.files[0]; if(f) handleXmlFile(f); e.target.value = ''; });
  $('btnXmlSample').addEventListener('click', () => {
    ST.lastXml = SAMPLE_XML;                            // 记下示例文本，供勾选切换时重导
    ST.lastXmlName = '';                                // 示例自带 work-title，不需要文件名兜底
    applyImported(parseMusicXML(SAMPLE_XML, $('xmlMain').checked));
  });
  /* 「仅保留主旋律」勾选切换：之前只是加载时的参数，切了不会重导。
     现在若已导入过 XML，立即按新勾选重导（full 钢琴 ↔ 主旋律），让用户即时看到效果。
     ★ 必须一起重放曲名兜底 —— 扫描谱无 work-title，只重导解析结果会退回「未命名」，
       勾一下勾选框曲名就变了，用户会以为导入坏了。 */
  $('xmlMain').addEventListener('change', () => {
    if(!ST.lastXml) return;
    const parsed = parseMusicXML(ST.lastXml, $('xmlMain').checked);
    if(!parsed.error) parsed.meta.title = xmlTitle(parsed, ST.lastXmlName);   // 出错时没有 meta
    applyImported(parsed);
  });

  window.addEventListener('keydown', e => {
    if(e.code === 'Space' && !/TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName)){
      e.preventDefault(); play();
    }
  });

  /* 窗口一变，预览区高度与滚动条都在变 → 进度条要重新贴边 */
  window.addEventListener('resize', () => syncProg(true));

  rebuild();
  syncEditUI();          // 初始为「未编辑」：时值按钮整组灰掉、不可点
}
/* ★ P1：顶层 `init();` 已移出本模块（见离线产物末尾的显式 init() 调用）。
   否则任何 import 到本模块的代码（例如只用 renderer 的调用方）都会在加载时就去摸工作台 DOM。 */

/* ─────────────── 本模块对外出口 ─────────────── */
export { SAMPLE, SAMPLE_XML, SVG_CH_ADD, SVG_CH_DEL, applyAttach, applyImported, applyMetaOpts, applyMidiChannels, attachFillTitle, attachTimer, autoFit, currentTuning, exportOpts, exportPng, guardRebuild, handleMidiFile, handleXmlFile, inflateRaw, init, midiChNameCount, midiChOptText, midiChOptionsHTML, midiChSelEls, midiChTaken, midiChsPicked, onBpmInput, pngName, populateMidiChannels, printScore, rebuild, redrawForAttach, refreshMidiChOptions, renderMidiChRows, seg, segSet, setMetaLine, setPagedLayout, setTempo, syncBpm, syncEditUI, syncMidiChRows, syncMidiChSelTitles, toggleAttach, unzipMxl, zipName };
