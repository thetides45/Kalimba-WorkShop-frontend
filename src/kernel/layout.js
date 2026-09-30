/* =====================================================================
   layout.js —— 事件流 → 网格（量化与反向简谱）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { degreeToMidi, nameOf, nearestColumn } from './core.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   3. 布局：事件流 -> 网格（行 = 时间格，列 = 琴键轨道）
   ===================================================================== */
const UNIT_CANDIDATES = [1, 0.5, 0.25, 0.125];

/* ★ 格点选取用「绝大多数能对齐」而不是 every（全量整除）。
   为什么不能要求 100%：真实谱里几乎总有几个三连音 / 散拍 / 装饰音，
   一个 1/3 拍的音就足以让 every 失败、把整首谱从 1/2 拍网格一路砸到 1/32 拍网格。
   实测「狐姬零」MusicXML：1068 个事件里只有 50 个不齐（1/2 拍网格拟合度 93.9%/96.7%），
   却因此掉到 0.125 → 行数 1205 → 4820，行距 0.34s → 0.085s，
   于是尾音全部撞 0.42s 下限、变成干瘪的短音（用户反馈「延音限制太严，不像正常音效」）。
   ★ 口径与 MIDI 侧 pickMidiUnit 保持一致（同为 90%）：起点、时值分别判定，
     少数不齐的音由 buildGrid 的 Math.round(t/unit) 并到最近一行，误差 ≤ 半个格。 */
const UNIT_FIT = 0.9;
function pickUnit(events, forced){
  if(forced && forced !== 'auto') return parseFloat(forced);
  if(!events.length) return 0.125;
  for(const c of UNIT_CANDIDATES){
    let okT = 0, okD = 0;
    for(const e of events){
      if(Math.abs(e.t   / c - Math.round(e.t   / c)) < 1e-6) okT++;
      if(Math.abs(e.dur / c - Math.round(e.dur / c)) < 1e-6) okD++;
    }
    if(okT >= events.length * UNIT_FIT && okD >= events.length * UNIT_FIT) return c;
  }
  return 0.125;
}

/* 把解析结果落到网格上 */
function buildGrid(parsed, st, tuning){
  const {meta, events, beatsPerMeasure} = parsed;
  const semis = st.transpose || 0;
  const unit  = pickUnit(events, st.unitMode);

  const warned = new Map();          // 音名 -> {count, midi}
  const itemRows = [];               // {row, items:[{col,midi,label,bad,dur}], rest}
  let durMax = 1;

  for(const ev of events){
    const items = [];
    for(const it of ev.items){
      const raw = degreeToMidi(it.deg, it.oct, it.alter, st.mode, meta.keyPc);
      const midi = raw + semis;
      let col = tuning.map[midi], bad = false;
      if(col === undefined){
        col = nearestColumn(tuning, midi).col;
        bad = true;
        const nm = nameOf(midi);
        const rec = warned.get(nm) || {count:0};
        rec.count++; warned.set(nm, rec);
      }
      items.push({col, midi, label: it.tok, bad, dur: ev.dur, voice: ev.voice || 0});
    }
    itemRows.push({t: ev.t, dur: ev.dur, items, rest: ev.rest});
    durMax = Math.max(durMax, ev.dur);
  }

  /* 行数 */
  const totalBeats = Math.max(parsed.totalBeats, unit);
  const nRows = Math.max(1, Math.round(totalBeats / unit));

  /* 按行聚合（多个声部同时 -> 同一行） */
  const rows = Array.from({length: nRows}, (_, i) => ({idx:i, items:[], rest:false}));
  for(const ir of itemRows){
    let r = Math.round(ir.t / unit);
    r = Math.min(Math.max(r, 0), nRows-1);
    rows[r].items.push(...ir.items);
    if(ir.rest && !ir.items.length) rows[r].rest = true;
  }
  /* 同行去重（音名相同只留一个） */
  rows.forEach(row => {
    const seen = new Set();
    row.items = row.items.filter(it => {
      if(seen.has(it.col)) return false;
      seen.add(it.col); return true;
    }).sort((a,b) => a.col - b.col);
  });

  /* 小节信息 */
  const rowsPerMeasure = Math.max(1, Math.round(beatsPerMeasure / unit));
  rows.forEach((row, i) => {
    const inM = i % rowsPerMeasure;
    row.beatInMeasure = inM * unit;
    row.measure = Math.floor(i / rowsPerMeasure);
    row.isBarStart = inM === 0;
    row.isBeatStart = Math.abs((inM * unit) - Math.round(inM * unit)) < 1e-6;
  });

  const used = new Set();
  rows.forEach(r => r.items.forEach(it => used.add(it.col)));

  return {
    meta, unit, rows, rowsPerMeasure, beatsPerMeasure,
    nMeasures: Math.ceil(nRows / rowsPerMeasure),
    usedCols: used,
    warnList: [...warned.entries()].map(([nm, r]) => ({name:nm, count:r.count})),
    totalBeats, semis
  };
}

/* 网格 -> 简谱文本（「谱面转换」/ 导入后回填「简谱输入」框）
   ★ 保时值（用户 2026-09-28）：每个音按**它自己的 it.dur** 出记号；被长音占着的那些格
     不再写 0 休止 —— 老版一律写 marks(unit)，会把「一个二分音符」拆成「一个八分 + 一串休止」，
     导入谱（token 不带减时线）更会被整体压成一个格（实测秋绪 631 个音全变 0.25 拍）。
   ★ 同时把 琴型 / 读谱方式 / 读谱方向 / 是否移谱 写进文件头，导入时由 applyMetaOpts() 自动加载。 */
const DUR_DOTTED = {1.5:1, 0.75:1, 0.375:1, 0.1875:1};
const DUR_BASES = [1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125];
/* 时值 -> {pre, post}：pre = 减时线 + 附点（挂在**数字与八度点之间**），post = 延长线（挂最后）。
   与 parseNotes 的正则严格互逆：base 取「能整除剩余量」的最大可写基值，余下的整拍用 '-' 延长。
   例：0.75→`_.` / 1.5→`.` / 1.75→`_.-` / 4.5→`.---` / 6→`-----`（全部能原样读回）。 */
function durParts(dur){
  const d = (dur > 0 ? dur : 0.125);
  let base = DUR_BASES.find(b => d >= b - 1e-9 && Math.abs((d - b) - Math.round(d - b)) < 1e-6);
  if(base === undefined) base = 0.125;
  const dot = DUR_DOTTED[base] ? '.' : '';
  const core = dot ? base / 1.5 : base;
  const mark = core === 0.5 ? '_' : core === 0.25 ? '__' : core === 0.125 ? '___' : '';
  return {pre: mark + dot, post: '-'.repeat(Math.max(0, Math.round(d - base)))};
}
/* 网格 token 拆成 变音号 / 八度点 / 数字 / 八度尾。
   ★ 两种书写顺序都要认：midiToDegreeItem 写的是「.b1」（**八度点在前**），
     而 parseNotes 的正则要的是「b.1」（**变音号在前**）。导出必须归一化成后者，
     否则「低八度 + 变音号」的音读不回来 —— 探针实测：秋绪里 b1 从 72 掉到 61。
     （老 put() 一直在做这件事，重写时差点丢掉。） */
function jpSplit(lab){
  const s = String(lab);
  let m = /^([.]*)([#b]?)(\d)('*)$/.exec(s);
  if(m) return {acc:m[2], dots:m[1], deg:m[3], primes:m[4]};
  m = /^([#b]?)(\.*)(\d)('*)$/.exec(s);
  if(m) return {acc:m[1], dots:m[2], deg:m[3], primes:m[4]};
  return null;
}
/* 变音号 + 八度点 + 数字 + 减时线/附点 + 八度尾 + 延长线（＝ parseNotes 认的那个顺序） */
function jpTok(lab, pre, post){
  const p = jpSplit(lab);
  return p ? p.acc + p.dots + p.deg + pre + p.primes + post : String(lab);
}
function gridToJianpu(grid, st, opt){
  const {meta, unit, rows} = grid;
  const o = opt || {};
  const n = rows.length;
  const rpm = Math.max(1, grid.rowsPerMeasure || 1);      // 一小节几格（和 buildGrid 同一口径）
  const cells = d => Math.max(1, Math.round((d || unit) / unit));
  /* 下一处「有音」的格。简谱是**单声部顺序记号**，写不出重叠（一个音还没结束下一个就起），
     所以导出时把每个音截到下一个音的起点 —— 这叫「按记谱截短」，位置与音数一点不丢；
     不截的话，后面所有音都会被前一个音的时值推着往后漂（实测秋绪会漂 0.5 拍）。 */
  const nextOn = i => { for(let k = i + 1; k < n; k++) if(rows[k].items.length) return k; return -1; };
  const skip = [];                       // 被长音占着的格：本身没音就什么都不写（时值已记在长音上）
  const out = [], line = [];
  for(let i = 0; i < n; i++){
    const row = rows[i];
    if(row.isBarStart && i > 0) line.push('|');   // 小节线先写：哪怕格被长音占着，线也要在
    if(!row.items.length){
      if(skip[i]) continue;              // 长音内部：不写 0（写了就成了「长音 + 休止」）
      /* 连续空格合成一个休止（别每格一个 0__），但不跨小节线 —— 记号更短也更像人写的 */
      let j = i, acc = 0;
      while(j < n && !rows[j].items.length && !skip[j] && !(j > i && rows[j].isBarStart)){
        acc += unit; j++;
      }
      const rp = durParts(acc || unit);
      line.push('0' + rp.pre + rp.post);
      i = j - 1;
      continue;
    }
    const nx = nextOn(i);
    /* 时值截短的两条上限（简谱是单声部顺序记号，写不了重叠、也写不了跨小节延音）：
       ① 下一个音的起点（重叠只能截短）；
       ② **本小节末** —— 简谱的时间在每个小节线处重新起算，跨过小节线的时值会被丢掉。
          实测秋绪：一个跨小节线的 0.75 拍音，把下一小节的音整体提前了 0.25 拍。
       被截掉的尾巴由后面的休止补回来，曲子总长不变。 */
    const barEnd = ((Math.floor(i / rpm) + 1) * rpm - i) * unit;
    const gap = Math.min(nx < 0 ? Infinity : (nx - i) * unit, barEnd);
    let span = 1;
    const toks = row.items.map(it => {
      const d = Math.max(unit, Math.min(it.dur || unit, gap));
      const p = durParts(d), lab = it.label || nameOf(it.midi);
      span = Math.max(span, cells(d));
      return jpTok(lab, p.pre, p.post);
    });
    for(let k = 1; k < span; k++) if(i + k < n) skip[i + k] = 1;
    line.push(toks.length > 1 ? '[' + toks.join(' ') + ']' : toks[0]);
  }
  const tk = o.tuningKey || 'k17';
  out.push('title: ' + meta.title);
  out.push('key: 1=' + meta.keyName);
  out.push('meter: ' + meta.meter[0] + '/' + meta.meter[1]);
  out.push('tempo: ' + meta.tempo);
  out.push('tuning: ' + (tk === 'k21' ? '21' : tk === 'custom' ? 'custom' : '17'));
  if(tk === 'custom' && o.tuningNotes)
    out.push('tuningNotes: ' + String(o.tuningNotes).replace(/\s+/g, ' ').trim());
  out.push('mode: ' + (st && st.mode === 'fixed' ? 'fixed' : 'movable'));
  out.push('direction: ' + (st && st.direction === 'down' ? 'down' : 'up'));
  out.push('transpose: ' + ((st && st.transpose) || 0));
  out.push('# 由谱面反向导出：音高 / 时值 / 节奏位置 / 琴型 / 读谱方式 / 读谱方向 / 移调 全部保留');
  out.push(line.join(' '));
  return out.join('\n');
}

/* 发声时刻表（播放高亮用）：只把「有音 / 有休止」的行按时间列出来。
   谱面是按**最小格**切行的，一个时值更长的音符后面会跟着若干空格；
   那些空格不该被高亮 —— 否则高亮会在同一个音符上跳两下、第二下还停在空白行上。
   高亮在这张表上依次停留，每行的停留时长 = 到下一个发声行的时间差，
   正好等于该行音符的实际时值。音频本来按拍位调度，与这张表天然对齐。 */
function buildCues(grid, rowSec){
  const cues = [];
  grid.rows.forEach(r => {
    if(!r.items.length && !r.rest) return;
    const dur   = r.items.length ? Math.max(...r.items.map(it => it.dur || grid.unit)) : grid.unit;
    const nGrid = Math.max(1, Math.round(dur / grid.unit));
    cues.push({idx: r.idx, sec: r.idx * rowSec, end: (r.idx + nGrid) * rowSec});
  });
  return cues;
}

/* 当前该亮哪个 cue：已过时刻 el（秒）落在的最后一个发声行 */
function cueIndexAt(cues, el){
  let k = 0;
  while(k + 1 < cues.length && el >= cues[k + 1].sec) k++;
  return k;
}
/* 当前时刻所在那个音的起点（秒）。暂停时把进度对回音头 →
   继续播放时这个音会完整重来一遍，不会出现「高亮亮着却没声音」的半截音 */
function cueStartAt(cues, el){
  return cues[cueIndexAt(cues, el)].sec;
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { DUR_BASES, DUR_DOTTED, UNIT_CANDIDATES, UNIT_FIT, buildCues, buildGrid, cueIndexAt, cueStartAt, durParts, gridToJianpu, jpSplit, jpTok, pickUnit };
