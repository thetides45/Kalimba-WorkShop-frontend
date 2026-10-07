/* =====================================================================
   extract_kernel.js —— 从 kalimba-tab/index.html 提取制谱内核，生成 ES 模块
   ---------------------------------------------------------------------
   为什么用生成器而不是手抄：
     源文件 4598 行、内核合约约 4100 行，手抄必然引入肉眼看不见的差异。
     生成器把「搬家」变成一条可反复重跑的命令：源文件改了，重跑一次即可。
     （思路与 mini-Kalimba-tab/tools/build_core.js 同源。）

   产出（src/kernel/，全部自动生成、勿手改）：
     foundation.js  内核常量表（从 s-ui 散落处归拢）
     state.js       跨模块共享状态与元信息助手（ST / 曲名 / 导出文件名 / 附加信息读取 …）
     core.js        乐理运算、音位表、调性与移调          ← <script id="s-core">
     parser.js      简谱 / MIDI / MusicXML 三类谱源解析    ← s-parse + s-ui 的导入通道
     layout.js      事件流 → 网格（量化 / 反向简谱）        ← s-layout
     renderer.js    SVG 谱面排版（分页 / 音位轴 / 页眉页脚）  ← s-render
     editor.js      点选命中、改音与时值                   ← s-edit
     player.js      Web Audio 试听与播放调度               ← s-audio
     exporter.js    SVG / PNG / ZIP / 打印 / 二维码        ← s-ui 的导出块
     studio.js      工作台装配层（页面状态 / 事件接线 / 重画） ← s-ui 剩余部分

   跨模块引用怎么处理：
     每一段原本共享同一个全局词法作用域，段与段之间是**双向**引用
     （renderer 调 studio 的 afterEdit，studio 又调 renderer 的 renderScore）。
     切成 ES 模块后词法作用域被切开，方案是：
       · 读 —— 用 ESM `import` 的**活绑定**，天然支持循环依赖，读到的永远是最新值；
       · 写 —— 导入绑定只读，跨模块可变的裸变量只有 `lastGeom` 一个，
              用一个共享容器承接（见补丁 P2）。

   ⚠️ 与原文件相比的全部差异都登记在 PATCHES 里，跑完会打印命中情况。
      除这几处，段内代码逐字搬运。

   用法：
     node tools/extract_kernel.js [--dry] [源 index.html] [输出目录]
       --dry  只做分析与报告，不落盘（改了源文件先看依赖有没有变）
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARGV = process.argv.slice(2);
const DRY = ARGV.includes('--dry');
const POS = ARGV.filter(a => !a.startsWith('--'));
const SRC = POS[0] || path.resolve(__dirname, '..', '..', '..', 'kalimba-tab', 'index.html');
const OUTDIR = POS[1] || path.resolve(__dirname, '..', 'src', 'kernel');

/* ============================================================ 0. 工具 */
function strip(code) {
  let out = '', i = 0; const n = code.length;
  const REGEX_PREV = '=(,:[!&|?{};+*%~^<>';
  while (i < n) {
    const c = code[i], c2 = code[i + 1];
    if (c === '/' && c2 === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/') {
      let k = i - 1; while (k >= 0 && /\s/.test(code[k])) k--;
      const prev = k < 0 ? '(' : code[k];
      if (k < 0 || REGEX_PREV.includes(prev)) {
        i++;
        while (i < n && code[i] !== '/') {
          if (code[i] === '\\') i++;
          if (code[i] === '[') { while (i < n && code[i] !== ']') { if (code[i] === '\\') i++; i++; } }
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(code[i])) i++;
        out += ' '; continue;
      }
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      i++; out += ' '; continue;
    }
    if (c === '`') {
      i++;
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '$' && code[i + 1] === '{') {
          let d = 1; i += 2; const st = i;
          while (i < n && d > 0) { if (code[i] === '{') d++; else if (code[i] === '}') d--; i++; }
          out += ' ' + code.slice(st, i - 1) + ' '; continue;
        }
        i++;
      }
      i++; out += ' '; continue;
    }
    out += c; i++;
  }
  return out;
}

/* 顶层声明：只认行首列 0 的 const/let/var/function/class；多声明符逐个拆出 */
function declaredNames(code) {
  const s = strip(code);
  const set = new Set();
  const re = /^(?:const|let|var|function|class|async\s+function)\b/gm;
  let m;
  while ((m = re.exec(s))) {
    const kind = m[0];
    if (kind === 'function' || kind === 'class' || kind === 'async function') {
      const mm = /^(?:async\s+function|function|class)\s+([A-Za-z_$][\w$]*)/.exec(s.slice(m.index));
      if (mm) set.add(mm[1]);
      continue;
    }
    let i = m.index + kind.length, depth = 0;
    const start = i;
    while (i < s.length) {
      const ch = s[i];
      if ('{(['.includes(ch)) depth++;
      else if ('})]'.includes(ch)) depth--;
      else if (ch === ';' && depth <= 0) break;
      i++;
    }
    takeDeclarators(s.slice(start, i), set);
    re.lastIndex = i;
  }
  return set;
}
function takeDeclarators(stmt, set) {
  const parts = []; let d = 0, cur = '';
  for (const ch of stmt + ',') {
    if ('{(['.includes(ch)) d++; else if ('})]'.includes(ch)) d--;
    if (ch === ',' && d <= 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  for (const p of parts) {
    const t = p.trim(); if (!t) continue;
    if (t[0] === '{' || t[0] === '[') {
      const close = t[0] === '{' ? '}' : ']';
      const end = t.lastIndexOf(close);
      for (const q of t.slice(1, end < 0 ? t.length : end).split(',')) {
        const nm = q.split(':').pop().split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(nm)) set.add(nm);
      }
    } else {
      const nm = t.split('=')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(nm)) set.add(nm);
    }
  }
}

function referencedNames(code) {
  const s = strip(code);
  const set = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\b(\s*:)?/g;
  let m;
  while ((m = re.exec(s))) {
    const i0 = m.index;
    if (i0 > 0 && s[i0 - 1] === '.') continue;
    if (i0 > 1 && s[i0 - 2] === '?' && s[i0 - 1] === '.') continue;
    let k = i0 - 1; while (k >= 0 && /\s/.test(s[k])) k--;
    if (m[2] && (s[k] === '{' || s[k] === ',' || s[k] === '(')) continue;
    set.add(m[1]);
  }
  /* `$` 是合法的单字符标识符，但 \b 边界在 `$(` 处不成立（$ 非 \w），
     上面的正则匹配不到。单独补一条：凡是 `$(` 出现，就把 `$` 记为引用。 */
  if (/[^A-Za-z0-9_$]\$\(/.test(s)) set.add('$');
  return set;
}

/* ============================================================ 1. 切段 */
const html = fs.readFileSync(SRC, 'utf8');
const raw = {};
{
  const re = /<script id="(s-[a-z]+)">([\s\S]*?)<\/script>/g;
  let m; while ((m = re.exec(html))) raw[m[1]] = m[2];
}
for (const k of ['s-core', 's-parse', 's-layout', 's-render', 's-edit', 's-audio', 's-ui']) {
  if (!raw[k]) throw new Error('缺少脚本块 ' + k);
}

const uiLines = raw['s-ui'].split('\n');
const taken = [];                                   // { name|block, startLine, endLine }

function lineStmt(name) {                            // 找 `const/let/var name =` 或 `function name(`
  const a = uiLines.findIndex(l =>
    l.startsWith('const ' + name + ' =') || l.startsWith('let ' + name + ' =') ||
    l.startsWith('function ' + name + '(') || l.startsWith('async function ' + name + '('));
  if (a < 0) return null;
  let depth = 0, b = a;
  for (let i = a; i < uiLines.length; i++) {
    for (const ch of strip(uiLines[i])) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
    }
    b = i;
    if (depth <= 0 && /;\s*(\/\/.*)?$/.test(uiLines[i])) break;
    if (depth <= 0 && /^\}/.test(uiLines[i])) break;   // function 体以 } 收尾（无分号）
    /* 单行函数：`function f(){ ... }` 一行写完，depth 归零但既不 ; 结尾也不 } 开头，
       而是以 } 结尾 —— 必须在这一行就 break，否则会把下面的注释 / 相邻函数一起吃进来。
       注意不能用 i > a：单行函数在第一轮（i === a）就该 break。 */
    if (depth <= 0 && /\}\s*$/.test(uiLines[i])) break;
  }
  return { a, b };
}
function takeFn(name, optional) {
  const f = lineStmt(name);
  if (!f) { if (optional) return null; throw new Error('摘取 ' + name + '：找不到定义'); }
  let s = f.a;
  while (s - 1 >= 0 && /^\s*(\/\*|\*|\/\/)/.test(uiLines[s - 1])) s--;
  for (let i = s; i <= f.b; i++) taken.push({ name, startLine: i, endLine: i });
  return { text: uiLines.slice(s, f.b + 1).join('\n'), span: [s, f.b] };
}
function takeBlock(startAnchor, endAnchor, label) {
  const a = uiLines.findIndex(l => l.startsWith(startAnchor));
  if (a < 0) throw new Error('摘取 ' + label + '：找不到起点 ' + startAnchor);
  let b = -1;
  for (let i = a; i < uiLines.length; i++) if (uiLines[i].includes(endAnchor)) { b = i; break; }
  if (b < 0) throw new Error('摘取 ' + label + '：找不到终点 ' + endAnchor);
  for (let i = a; i <= b; i++) taken.push({ name: label, startLine: i, endLine: i });
  return { text: uiLines.slice(a, b + 1).join('\n'), span: [a, b] };
}

/* ============================================================ 2. 补丁 */
const patches = [];
function patchText(text, id, from, to) {
  const n = text.split(from).length - 1;
  if (n === 0) throw new Error('补丁 ' + id + ' 没命中：源文件形状变了 → ' + from.slice(0, 60));
  patches.push(id + '：命中 ' + n + ' 处');
  return text.split(from).join(to);
}
function patchRe(text, id, re, to) {
  const m = text.match(re);
  if (!m) throw new Error('补丁 ' + id + ' 没命中：源文件形状变了 → ' + re);
  patches.push(id + '：命中 1 处');
  return text.replace(re, to);
}

/* ---------- 从 s-ui 摘出属于各内核模块的函数 ---------- */
const PARSER_FNS = [
  'midiToDegreeItem', 'parseMidi', 'pickMidiUnit', 'detectMelodyChannel', 'midiChannelParsed',
  'decodeXmlText', 'xmlTitle', 'beatUnitQuarter', 'tempoFromMark', 'parseMusicXML',
  'voiceKey', 'pickMainVoice', 'detectKeyPc', 'tempoNote'
];
/* exporter：导出 / 打包 / 二维码 */
const EXPORTER_FNS = ['renderForExport', 'exportSvg', 'pngBytesOf', 'crc32', 'zipStore', 'buildLegend', 'noteExported'];
/* editor：s-ui 里同属编辑链路的几何函数 */
const EDITOR_FNS = [];

const segParser = PARSER_FNS.map(n => takeFn(n).text).join('\n\n');
const segExporter = patchText(
  patchText(
    EXPORTER_FNS.map(n => takeFn(n).text).join('\n\n'),
    'P4 exporter 写 lastExportNote 改走 setter',
    "  lastExportNote = ' · 已导出 ' + msg;",
    "  setLastExportNote(' · 已导出 ' + msg);"),
  'P2g exporter 里 renderForExport 存还几何改走 setter',
  '  lastGeom = keep;',
  '  setLastGeom(keep);');
const segEditor = EDITOR_FNS.map(n => takeFn(n, true)).filter(Boolean).map(x => x.text).join('\n\n');

/* ---------- 内核级常量（原本散落在 s-ui）---------- */
const FOUNDATION_CONSTS = [
  'PC_KEYNAME', 'XML_HEAD', 'FILE_BAD', 'BPM_MIN', 'XML_UNTITLED', 'FIFTHS_KEY',
  'BEAT_UNIT_Q', 'GM_INSTR', 'GM_DRUM_CH', 'KEY_PROFILE', 'META_ALIAS',
  'CRC_TABLE', 'PNG_SCALE'
];
/* P8：$ 是「DOM 节点查询」的全局助手，原单文件里定义在 s-ui（studio），
   但 exporter（buildLegend / noteExported）也要用 —— 模块化后跨模块共享，
   收进 foundation（最早模块）供 exporter / studio 共同 import，避免跨模块重名。 */
const segFoundation = patchText(
  FOUNDATION_CONSTS.map(n => { const t = takeFn(n, true); return t ? t.text : null; })
    .filter(Boolean).join('\n\n'),
  'P8 foundation 增加 $ 助手',
  'const PC_KEYNAME =',
  "const $ = id => document.getElementById(id);\n\nconst PC_KEYNAME =");

/* ---------- 二维码编码器（IIFE）---------- */
const qrBlk = takeBlock('(function(root){', "})(typeof globalThis !== 'undefined' ? globalThis : this);", 'KAL_QR 编码器');

/* ============================================================ 3. 自动推导 state 模块 */
/* 规则：任何「靠后模块声明、靠前模块使用」的名字，连同它在 s-ui 内的传递闭包，
   一并前移到 state。这样非 UI 模块（renderer / exporter / editor / player）
   不必 import studio，内核才能被「只要渲染、不要工作台」的调用方单独使用。 */
const S_UI = 'studio';
const S_EDIT = 'editor';
const ORDER0 = ['foundation', 'state', 'core', 'parser', 'layout', 'renderer', 'editor', 'player', 'exporter', 'studio'];
const idxOf = id => ORDER0.indexOf(id);

const prelim = {
  foundation: declaredNames(segFoundation),
  core: declaredNames(raw['s-core']),
  parser: declaredNames(raw['s-parse'] + '\n' + segParser),
  layout: declaredNames(raw['s-layout']),
  renderer: declaredNames(raw['s-render']),
  editor: declaredNames(raw['s-edit'] + '\n' + segEditor),
  player: declaredNames(raw['s-audio']),
  exporter: declaredNames(segExporter + '\n' + qrBlk.text),
  studio: null   // 稍后算
};
/* 先给 studio 一个"占位"声明集：s-ui 全体顶层声明 */
const allUiDecls = new Map();     // name -> {text, span}
for (const name of declaredNames(raw['s-ui'])) {
  const t = lineStmt(name);
  if (t) allUiDecls.set(name, t);
}
const studioOwn = new Set(allUiDecls.keys());
prelim.studio = studioOwn;

/* studio 里哪些名字被「更早的模块」用到。
   ★ 已经被搬到其它模块（foundation / parser / exporter / editor）的名字要先排除，
     否则它们会因为「在别的模块里被调用」而重复进 state，造成跨模块重名。 */
const alreadyMoved = new Set([
  ...declaredNames(segFoundation), ...declaredNames(segParser),
  ...declaredNames(segExporter), ...declaredNames(segEditor)
]);
const earlierRefs = new Set();
for (const [id, set] of Object.entries(prelim)) {
  if (id === 'studio' || id === 'foundation' || id === 'state') continue;
  for (const r of referencedNames(bodyOf(id))) {
    if (studioOwn.has(r) && !alreadyMoved.has(r)) earlierRefs.add(r);
  }
}
/* 传递闭包：这些名字自身引用的其他 s-ui 名字也算上 */
const stateNames = new Set(earlierRefs);
{
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of [...stateNames]) {
      const t = allUiDecls.get(n); if (!t) continue;
      const body = uiLines.slice(t.a, t.b + 1).join('\n');
      for (const r of referencedNames(body)) {
        if (studioOwn.has(r) && !alreadyMoved.has(r) && !stateNames.has(r)) { stateNames.add(r); changed = true; }
      }
    }
  }
}
/* 另外把「被别的 state 名字引用」的也纳入（同上，闭包已覆盖），
   但 ST 是全局状态真源，必须进 state —— 它被 s-edit / s-audio 直接用到，闭包已含。 */
function bodyOf(id) {
  if (id === 'foundation') return segFoundation;
  if (id === 'core') return raw['s-core'];
  if (id === 'parser') return raw['s-parse'] + '\n' + segParser;
  if (id === 'layout') return raw['s-layout'];
  if (id === 'renderer') return raw['s-render'];
  if (id === 'editor') return raw['s-edit'] + '\n' + segEditor;
  if (id === 'player') return raw['s-audio'];
  if (id === 'exporter') return segExporter + '\n' + qrBlk.text;
  if (id === 'studio') return raw['s-ui'];
  return '';
}

/* ============================================================ 4. 组装模块体 */
const P2_DECL = 'let lastGeom = null, editMode = false, painting = 0;';
const P2_SETTER = [
  '',
  '/* ★ P2：lastGeom 归本模块所有，但 s-render 会**写**它（renderScore 收尾落几何）、',
  '   studio 会存还它（导出时换一套几何、用完还原）。',
  '   上面那行声明**一字未改** —— 回归探针直接读全局 lastGeom（如 kal_sheet_probe 的',
  '   rpcOf()），改名字会把探针体系整个打哑。',
  '   跨模块的「写」改走这个 setter：ES 模块的导入绑定只读，裸变量没法跨模块赋值。',
  '   读写语义与原来完全一致（同一个变量、同一处赋值时机）。 */',
  'function setLastGeom(v){ lastGeom = v; }',
  'function setEditMode(v){ editMode = v; }'
].join('\n');

if (!raw['s-edit'].split('\n').some(l => l.trim() === P2_DECL)) {
  throw new Error('补丁 P2 没命中：s-edit 的 lastGeom 声明行形状变了');
}
/* ---------- P2a：editor 侧加 setter ---------- */
let segEdit = patchText(raw['s-edit'], 'P2a s-edit 增加 setLastGeom/setEditMode', P2_DECL, P2_DECL + '\n' + P2_SETTER);

/* ---------- P2b/P2c：renderer 侧两处写入改走 setter ---------- */
raw['s-render'] = patchText(raw['s-render'], 'P2b renderScore 落几何改走 setter',
  '  lastGeom = {panels: geom,', '  setLastGeom({panels: geom,');
raw['s-render'] = patchText(raw['s-render'], 'P2c renderScore 落几何收尾补括号',
  'hdrL, hdrR, railL: SHEET.RAIL_L, footL, footC, footR};',
  'hdrL, hdrR, railL: SHEET.RAIL_L, footL, footC, footR});');

/* ---------- P2e：renderer 里**第二处**落几何（连续预览单栏路径）改走 setter ---------- */
raw['s-render'] = patchText(raw['s-render'], 'P2e 连续预览落几何改走 setter',
  '    lastGeom = {panels: [{yTop, yBot, startIdx: 0, n, g0: 0, h,',
  '    setLastGeom({panels: [{yTop, yBot, startIdx: 0, n, g0: 0, h,');
raw['s-render'] = patchText(raw['s-render'], 'P2f 连续预览落几何收尾补括号',
  'colW, x0, W: Wfull, H: h, single: false};',
  'colW, x0, W: Wfull, H: h, single: false});');

/* ---------- P2d：studio 侧的存还改走 setter ---------- */
{
  const i = uiLines.findIndex(l => l.trim() === 'lastGeom = keep;');
  if (i < 0) throw new Error('补丁 P2d 没命中：studio 的 lastGeom 存还写法变了');
  uiLines[i] = uiLines[i].replace('lastGeom = keep;', 'setLastGeom(keep);');
  patches.push('P2d studio 存还几何改走 setter：命中 1 处');
}

function sliceUi() {
  const skip = new Set();
  for (const t of taken) for (let i = t.startLine; i <= t.endLine; i++) skip.add(i);
  return uiLines.filter((_, i) => !skip.has(i)).join('\n');
}

let segStudio = '';

/* segEdit（含 P2a 的 setter）已在上面备好 */

/* ---------- state 模块正文 ---------- */
let segState = '';
{
  const parts = [];
  for (const n of stateNames) {
    const t = allUiDecls.get(n); if (!t) continue;
    let s = t.a;
    while (s - 1 >= 0 && /^\s*(\/\*|\*|\/\/)/.test(uiLines[s - 1])) s--;
    for (let i = s; i <= t.b; i++) taken.push({ name: n, startLine: i, endLine: i });
    parts.push(uiLines.slice(s, t.b + 1).join('\n'));
  }
  segState = parts.join('\n\n');
}

/* ---------- P3：lastExportNote / pagedLayout 是 state 声明的可变量，
   但分别被 exporter（noteExported）和 studio（setPagedLayout）跨模块赋值。
   ES 模块的导入绑定只读，裸 let 没法跨模块赋值 —— 各加一个 setter，读写语义不变。
   ⚠️ setter 名不能叫 setPagedLayout（源文件已有同名函数），故用 setPagedLayoutFlag。 ---------- */
segState = patchText(segState, 'P3a 给 lastExportNote 加 setter',
  "let lastExportNote = '';",
  "let lastExportNote = '';\nfunction setLastExportNote(v){ lastExportNote = v; }");
segState = patchText(segState, 'P3b 给 pagedLayout 加 setter',
  'let pagedLayout = false;',
  'let pagedLayout = false;\nfunction setPagedLayoutFlag(v){ pagedLayout = v; }');

/* ---------- P4：exporter 的 noteExported 里 lastExportNote 赋值改走 setter（在 segExporter 声明后就 patch） ---------- */
{
  // segExporter 是 const，这里不能重赋值 —— 直接改 patch 后的结果会被下方 MODULES 使用。
  // 所以 P4 必须在 segExporter 声明处就地完成，见下方声明区。
}

/* ---------- 重算 studio（state 名字已被摘走后要重新切片） ---------- */
segStudio = sliceUi();
/* ---------- P1：把 s-ui 末尾的 init() 调用移出模块 ---------- */
const P1_FROM = /\ninit\(\);[ \t]*\n?[ \t]*$/;
const P1_TO = '\n/* ★ P1：顶层 `init();` 已移出本模块（见离线产物末尾的显式 init() 调用）。\n' +
  '   否则任何 import 到本模块的代码（例如只用 renderer 的调用方）都会在加载时就去摸工作台 DOM。 */\n';
segStudio = patchRe(segStudio, 'P1 移出顶层 init() 调用', P1_FROM, P1_TO);

/* ---------- P5：studio 的 setPagedLayout 里 pagedLayout 赋值改走 setter ---------- */
segStudio = patchText(segStudio, 'P5 studio 写 pagedLayout 改走 setter',
  '  pagedLayout = v;',
  '  setPagedLayoutFlag(v);');

/* ---------- P6：studio 切换点选编辑 editMode 赋值改走 setter ---------- */
segStudio = patchText(segStudio, 'P6 studio 写 editMode 改走 setter',
  '    editMode = !editMode;',
  '    setEditMode(!editMode);');

/* ---------- P9：studio 删掉 $ 的本地定义（改由 foundation 提供，避免跨模块重名） ---------- */
segStudio = patchText(segStudio, 'P9 studio 移除 $ 本地定义',
  "const $ = id => document.getElementById(id);\n",
  '');

/* ============================================================ 5. 模块清单 */
const MODULES = [
  { id: 'foundation', title: '内核常量表（原散落在 s-ui 各处的表与常量）', body: segFoundation },
  { id: 'state', title: '跨模块共享状态与元信息助手', body: segState },
  { id: 'core', title: '乐理运算 / 音位表 / 调性与移调', body: raw['s-core'] },
  { id: 'parser', title: '三类谱源解析（简谱文本 / MIDI / MusicXML）', body: raw['s-parse'] + '\n\n' + segParser },
  { id: 'layout', title: '事件流 → 网格（量化与反向简谱）', body: raw['s-layout'] },
  { id: 'renderer', title: 'SVG 谱面排版（分页 / 音位轴 / 页眉页脚）', body: raw['s-render'] },
  { id: 'editor', title: '点选编辑（命中测试 / 改音 / 调时值）', body: segEdit },
  { id: 'player', title: 'Web Audio 试听与播放调度', body: raw['s-audio'] },
  { id: 'exporter', title: '导出 / 打包 / 二维码', body: segExporter + '\n\n' + qrBlk.text },
  { id: 'studio', title: '工作台装配层（页面状态 / 事件接线 / 重画）', body: segStudio }
];

/* ============================================================ 6. 依赖分析 */
const info = MODULES.map(m => ({
  id: m.id, body: m.body,
  declared: declaredNames(m.body),
  refs: referencedNames(m.body),
  lines: m.body.split('\n').length
}));
const ownerOf = new Map();
for (const m of info) for (const n of m.declared) if (!ownerOf.has(n)) ownerOf.set(n, m.id);
const orderOf = new Map(info.map((m, i) => [m.id, i]));

/* 重名检查（离线单文件把所有模块拼进同一个作用域，重名会直接语法错误） */
const dup = new Map();
for (const m of info) for (const n of m.declared) {
  if (!dup.has(n)) dup.set(n, []);
  dup.get(n).push(m.id);
}

const deps = new Map();
for (const m of info) {
  const d = [];
  for (const r of m.refs) {
    if (m.declared.has(r)) continue;
    if (!ownerOf.has(r)) continue;
    d.push({ name: r, owner: ownerOf.get(r) });
  }
  d.sort((a, b) => (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : a.name < b.name ? -1 : 1));
  deps.set(m.id, d);
}

/* ============================================================ 7. 报告 */
console.log('源文件：', SRC);
console.log('输出目录：', OUTDIR, DRY ? '（--dry：不落盘）' : '');
console.log('');
console.log('模块         行数   声明   依赖');
console.log('--------------------------------------------------------------');
for (const m of info) {
  const d = deps.get(m.id);
  console.log(pad(m.id, 12), pad(m.lines, 6), pad(m.declared.size, 6),
    d.length ? [...new Set(d.map(x => x.owner))].join(' ') : '—');
}
console.log('');
console.log('补丁：'); patches.forEach(p => console.log('  ' + p));
console.log('');
const dupBad = [...dup.entries()].filter(([, v]) => v.length > 1);
if (dupBad.length) {
  console.log('❌ 跨模块重名（离线单文件拼接会语法错误）：');
  dupBad.forEach(([n, v]) => console.log('   ' + n + ' ← ' + v.join(' + ')));
} else {
  console.log('✓ 跨模块无重名（离线拼接安全）');
}
console.log('state 模块收纳了 s-ui 的 ' + stateNames.size + ' 项：' + [...stateNames].join(' '));
console.log('s-ui ' + uiLines.length + ' 行 → studio ' + segStudio.split('\n').length + ' 行');

if (dupBad.length) { console.log('\n已中止。'); process.exit(1); }

/* ============================================================ 8. 生成 */
function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }

const files = {};
files['_ns.js'] = `/* =====================================================================
   内核对外出口说明
   ---------------------------------------------------------------------
   本目录每个模块都是标准 ES 模块：跨模块引用走 \`import\` 的**活绑定**
   （支持 renderer ↔ studio 这种双向依赖，读到的永远是最新值）。
   本文件不参与运行，只用来给「内核 = 哪些模块」一个可 import 的清单。 */

export const KERNEL_MODULES = ${JSON.stringify(MODULES.map(m => m.id))};

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
`;

for (const m of MODULES) {
  const d = deps.get(m.id);
  const byOwner = new Map();
  for (const x of d) {
    if (!byOwner.has(x.owner)) byOwner.set(x.owner, []);
    byOwner.get(x.owner).push(x.name);
  }
  let head = '';
  head += '/* =====================================================================\n';
  head += '   ' + m.id + '.js —— ' + m.title + '\n';
  head += '   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。\n';
  head += '      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。\n';
  head += '      重新生成：npm run kernel:extract\n';
  head += '   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，\n';
  head += '   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。\n';
  head += '   ===================================================================== */\n';
  if (byOwner.size) {
    head += '\n';
    for (const [owner, names] of byOwner) {
      head += "import { " + names.sort().join(', ') + " } from './" + owner + ".js';\n";
    }
  }
  head += '\n/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */\n\n';
  const names = [...info.find(x => x.id === m.id).declared];
  const tail = names.length
    ? '\n\n/* ─────────────── 本模块对外出口 ─────────────── */\nexport { ' + names.sort().join(', ') + ' };\n'
    : '\n';
  files[m.id + '.js'] = head + m.body.trim() + tail;
}

/* ⚠️ 2026-10-07：原先这里还生成一个 `index.js` 装配入口（导出的 KERNEL_MODULES /
   mountStudio / kernel 都是给 Vue SPA 用的）。Vue 侧已整体下线，该入口随之取消 ——
   它本来也不在 build_offline.js 的装配序里，只服务于 SPA。 */

console.log('');
console.log('将写出 ' + Object.keys(files).length + ' 个文件：');
for (const k of Object.keys(files)) console.log('  ' + k.padEnd(16) + Buffer.byteLength(files[k], 'utf8') + ' 字节');

if (DRY) { console.log('\n--dry 模式，未落盘。'); process.exit(0); }
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(OUTDIR, k), v, 'utf8');
console.log('\n已写入 ' + OUTDIR);
