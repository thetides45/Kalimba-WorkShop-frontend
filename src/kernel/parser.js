/* =====================================================================
   parser.js —— 三类谱源解析（简谱文本 / MIDI / MusicXML）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { KEY_PC, MAJOR_STEPS } from './core.js';
import { BEAT_UNIT_Q, FIFTHS_KEY, GM_DRUM_CH, GM_INSTR, KEY_PROFILE, PC_KEYNAME, XML_UNTITLED } from './foundation.js';
import { ST } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   2. 简谱解析器：文本 -> 事件流
   事件 = { t:起拍(拍), dur:时值(拍), items:[{midi,deg,oct,alter,tok}], rest }
   ===================================================================== */

/* 把一行的 "[" 分组切出来 */
function tokenize(line){
  const out = []; let buf = '', depth = 0;
  for(const ch of line){
    if(ch === '[' || ch === '{'){ depth++; buf += ch; }
    else if(ch === ']' || ch === '}'){ depth--; buf += ch; }
    else if(/\s/.test(ch) && depth === 0){ if(buf) out.push(buf), buf=''; }
    else buf += ch;
  }
  if(buf) out.push(buf);
  return out;
}

/* 一个记号 -> 一个或多个音符
   支持：单个（1 / .6_ / #4'）、连写（6_5_ / 1232 / 5 5 6）、尾随延长线（5-） */
function parseNotes(tok){
  const out = [];
  const re = /([#b]?)(\.*)(\d)(_*)(\.(?![.\d]))?('*)(-*)/g;
  let m, consumed = 0;
  while((m = re.exec(tok)) !== null){
    if(m.index !== consumed) return null;
    consumed = m.index + m[0].length;
    let dur = 1 / Math.pow(2, m[4].length);
    if(m[5]) dur *= 1.5;
    dur += m[7].length;                       // 尾随的每个 "-" 延长一拍
    out.push({
      deg: parseInt(m[3], 10),
      oct: m[6].length - m[2].length,
      alter: m[1] === '#' ? 1 : (m[1] === 'b' ? -1 : 0),
      dur, tok: m[0]
    });
  }
  return (out.length && consumed === tok.length) ? out : null;
}

/* 一行谱 -> 若干小节，每小节 = 事件数组 */
function parseVoiceLine(line, errors, lineNo){
  const tokens = tokenize(line);
  const measures = [[]];
  let beat = 0;                       // 当前小节内的拍位
  let last = null;                    // 上一个事件（供 '-' 延长）
  for(const tk of tokens){
    if(tk === '|' ){ measures.push([]); beat = 0; last = null; continue; }
    if(tk === '|:' || tk === ':|' || tk === ':||:' ){ measures.push([]); beat = 0; last = null; continue; }
    if(tk === '-'){
      if(last){ last.dur += 1; }
      else { errors.push('第 '+lineNo+' 行：延音线 "-" 前面没有音符'); }
      continue;
    }
    if(tk[0] === '['){
      const inner = tokenize(tk.slice(1, -1));
      const items = [];
      let dur = 0;
      for(const it of inner){
        const ns = parseNotes(it);
        if(!ns){ errors.push('第 '+lineNo+' 行：无法识别 "'+it+'"'); continue; }
        for(const n of ns){ if(n.deg !== 0){ items.push(n); dur = Math.max(dur, n.dur); } }
      }
      if(!items.length) continue;
      const ev = {t: beat, dur: dur || 1, items, rest:false};
      measures[measures.length-1].push(ev);
      beat += ev.dur; last = ev;
      continue;
    }
    const ns = parseNotes(tk);
    if(!ns){ errors.push('第 '+lineNo+' 行：无法识别 "'+tk+'"'); continue; }
    for(const n of ns){
      if(n.deg === 0){
        measures[measures.length-1].push({t: beat, dur: n.dur, items: [], rest: true});
        beat += n.dur; last = null;
      } else {
        const ev = {t: beat, dur: n.dur, items: [n], rest:false};
        measures[measures.length-1].push(ev);
        beat += n.dur; last = ev;
      }
    }
  }
  /* 去掉末尾因收尾小节线产生的空小节 */
  if(measures.length > 1 && measures[measures.length-1].length === 0) measures.pop();
  return measures;
}

function parseSource(text){
  /* ★ 新增四项（用户 2026-09-28）：反向导出会把「琴型 / 读谱方式 / 读谱方向 / 是否移谱」写进文件头，
     这里负责读回来；界面侧由 applyMetaOpts() 自动加载。
     null = 文本里没写这一项 → 保持界面当前值不动（老文本照旧能读）。 */
  const meta = {title:'未命名', keyName:'C', keyPc:0, meter:[4,4], tempo:88,
                tuning:null, tuningNotes:'', mode:null, direction:null, transpose:null};
  const errors = [];
  const blocks = [];                  // 块 = {voices:[measures[]]}
  let cur = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if(!line || line.startsWith('#') || line.startsWith('//')){ cur = null; return; }
    const vm = /^([MA]|[Vv]\d|声部\d?)\s*[:：]\s*(.*)$/.exec(line);
    const d = vm ? null : /^([A-Za-z\u4e00-\u9fa5_]+)\s*[:：]\s*(.+)$/.exec(line);
    if(d){
      const k = d[1].toLowerCase(), v = d[2].trim();
      if(k === 'title' || k === '曲名') meta.title = v;
      else if(k === 'key' || k === '调号'){
        const kk = v.replace(/^1\s*=\s*/, '').replace(/#/g,'#');
        const norm = kk.replace(/^b/,'b').replace(/^#/,'F#');
        meta.keyName = KEY_PC[norm] !== undefined ? norm : (KEY_PC[kk] !== undefined ? kk : 'C');
        meta.keyPc = KEY_PC[meta.keyName];
      }
      else if(k === 'meter' || k === '拍号'){
        const mm = /^(\d+)\s*\/\s*(\d+)$/.exec(v);
        if(mm) meta.meter = [parseInt(mm[1],10), parseInt(mm[2],10)];
      }
      else if(k === 'tempo' || k === '速度'){ meta.tempo = parseFloat(v) || 88; }
      /* ↓↓ 反向导出带的四项（含中文别名）。取值容错：17 / k17 / 17键 都认。 */
      else if(k === 'tuning' || k === '琴型'){
        const t = v.replace(/\s/g, '').toLowerCase();
        meta.tuning = /^(k?17|17键)/.test(t) ? 'k17'
                    : /^(k?21|21键)/.test(t) ? 'k21'
                    : /^(custom|自定义)/.test(t) ? 'custom' : null;
      }
      else if(k === 'tuningnotes' || k === '音位表'){ meta.tuningNotes = v; }
      else if(k === 'mode' || k === '读谱方式'){
        const t = v.toLowerCase();
        meta.mode = (t === 'fixed' || t.indexOf('固定') === 0) ? 'fixed'
                  : (t === 'movable' || t.indexOf('首调') === 0) ? 'movable' : null;
      }
      else if(k === 'direction' || k === '读谱方向'){
        const t = v.toLowerCase();
        meta.direction = (t === 'down' || t.indexOf('从上') >= 0 || t.indexOf('向下') >= 0) ? 'down'
                       : (t === 'up' || t.indexOf('从下') >= 0 || t.indexOf('向上') >= 0) ? 'up' : null;
      }
      else if(k === 'transpose' || k === '移谱' || k === '移调'){
        /* 半音数，可带正负号；写成「移谱: 是/否」的老写法认不出来 → null（保持现状） */
        const n = parseInt(v.replace(/[+\s半音个]/g, ''), 10);
        meta.transpose = isNaN(n) ? null : n;
      }
      cur = null; return;
    }
    if(!cur){ cur = {voices:[]}; blocks.push(cur); }
    cur.voices.push(parseVoiceLine(vm ? vm[2] : line, errors, i+1));
  });

  /* --- 拍号换算：一小节多少拍 --- */
  const beatsPerMeasure = meta.meter[0] * (4 / meta.meter[1]);

  /* --- 多声部按小节对齐合并 --- */
  const events = [];
  let measureOffset = 0;
  for(const blk of blocks){
    let maxMeasures = 0;
    blk.voices.forEach(v => maxMeasures = Math.max(maxMeasures, v.length));
    blk.voices.forEach((v, vi) => {
      v.forEach((meas, mi) => {
        const base = (measureOffset + mi) * beatsPerMeasure;
        meas.forEach(ev => {
          events.push({t: base + ev.t, dur: ev.dur, items: ev.items, rest: ev.rest, voice: vi});
        });
      });
    });
    /* 块内小节数按拍号推进 */
    const blockBeats = maxMeasures * beatsPerMeasure;
    measureOffset += Math.max(maxMeasures, Math.round(blockBeats / beatsPerMeasure));
  }

  events.sort((a,b) => a.t - b.t || (a.rest?1:0) - (b.rest?1:0));
  const totalBeats = events.reduce((mx, e) => Math.max(mx, e.t + e.dur), 0);
  return {meta, events, errors, beatsPerMeasure, totalBeats};
}

function midiToDegreeItem(midi, keyPc){
  const kp = ((keyPc % 12) + 12) % 12;
  const tpc = ((midi % 12) + 12) % 12;
  let best = null;
  for(let d = 1; d <= 7; d++){
    const diaPc = ((kp + MAJOR_STEPS[d-1]) % 12 + 12) % 12;
    let alt = ((tpc - diaPc) % 12 + 12) % 12;
    if(alt > 6) alt -= 12;                                  // 归到 [-5, 6]
    if(alt < -1) alt = -1; else if(alt > 1) alt = 1;        // 限到常用范围内
    const diaMidi = 60 + kp + MAJOR_STEPS[d-1] + alt;
    /* ★ oct 必须**取整**再算误差。老写法把 `(midi - diaMidi) / 12` 直接当八度数用，
       于是 `err = |midi - (diaMidi + 12*oct)|` 恒等于 0 —— 七个候选全"零误差"，
       再靠 |alt| 的平手判据挑到**第一个**候选；而那个候选常常凑不出整八度，
       记号里 `"'".repeat(小数)` 只能截成 0 个八度尾 → **label 与 midi 对不上**。
       实测（秋绪）：C5 被记成 `b1`（应当是 `b7`），反向导出后从 72 掉到 61。
       取整后误差才有意义，挑出来的候选才能原样写回简谱。 */
    const oct = Math.round((midi - diaMidi) / 12);
    const err = Math.abs(midi - (diaMidi + 12 * oct));
    if(!best || err < best.err - 1e-9 ||
       (Math.abs(err - best.err) < 1e-9 && Math.abs(alt) < Math.abs(best.alt)))
      best = {d, alt, oct, err};
  }
  const tok = (best.oct < 0 ? '.'.repeat(-best.oct) : '') +
              (best.alt > 0 ? '#' : best.alt < 0 ? 'b' : '') +
              best.d + (best.oct > 0 ? "'".repeat(best.oct) : '');
  return {deg: best.d, oct: best.oct, alter: best.alt, tok, midi};
}

/* 解析标准 MIDI 文件 → 按通道聚合 */
function parseMidi(buf){
  const bytes = new Uint8Array(buf);
  if(bytes.length < 14 || bytes[0]!==0x4D || bytes[1]!==0x54 || bytes[2]!==0x68 || bytes[3]!==0x64)
    return {error:'不是合法的 MIDI 文件（缺 MThd 头）'};
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ntrk = dv.getUint16(10, false);
  const div  = dv.getUint16(12, false);
  const tpb  = (div & 0x8000) ? 0 : div;
  if(!tpb) return {error:'暂不支持 SMPTE 时间制的 MIDI'};

  const notesByCh = {}, chProg = {}, chName = {};
  let tempo = 88, meter = [4,4], anyTempo = false;
  const dec = new TextDecoder('utf-8');
  let p = 14;
  for(let ti = 0; ti < ntrk && p + 8 <= bytes.length; ti++){
    if(!(bytes[p]===0x4D && bytes[p+1]===0x54 && bytes[p+2]===0x72 && bytes[p+3]===0x6B)) break;  // MTrk
    const len = dv.getUint32(p + 4, false);
    const end = Math.min(p + 8 + len, bytes.length);
    let q = p + 8, tick = 0, status = 0, lastName = null;
    const active = {};                                   // 键 ch*128+note -> 起始 tick
    while(q < end){
      let dt = 0, b;
      do { b = bytes[q++]; dt = (dt << 7) | (b & 0x7F); } while(b & 0x80);
      tick += dt;
      if(q >= end) break;
      let b0 = bytes[q];
      if(b0 & 0x80){ status = b0; q++; }
      const hi = status & 0xF0, ch = status & 0x0F;
      if(status === 0xFF){
        const mt = bytes[q++];
        let ml = 0; do { b = bytes[q++]; ml = (ml << 7) | (b & 0x7F); } while(b & 0x80);
        if(mt === 0x51 && ml === 3 && !anyTempo){
          const us = (bytes[q] << 16) | (bytes[q+1] << 8) | bytes[q+2];
          if(us > 0){ tempo = Math.round(60000000 / us); anyTempo = true; }
        } else if(mt === 0x58 && ml >= 2){
          meter = [bytes[q], Math.pow(2, bytes[q+1])];
        } else if(mt === 0x03 && ml > 0){
          lastName = dec.decode(bytes.subarray(q, q + ml));
        } else if(mt === 0x2F){ break; }
        q += ml;
      } else if(status === 0xF0 || status === 0xF7){
        let ml = 0; do { b = bytes[q++]; ml = (ml << 7) | (b & 0x7F); } while(b & 0x80);
        q += ml;
      } else if(hi === 0x90 || hi === 0x80){
        const note = bytes[q++], vel = bytes[q++];
        const key = ch * 128 + note;
        if(hi === 0x90 && vel > 0){
          active[key] = tick;
          if(chName[ch] === undefined && lastName) chName[ch] = lastName;
        } else {
          const st = active[key];
          if(st !== undefined){
            (notesByCh[ch] || (notesByCh[ch] = [])).push({tick: st, midi: note, dur: Math.max(1, tick - st)});
            delete active[key];
          }
        }
      } else if(hi === 0xC0){
        const pr = bytes[q++];
        if(chProg[ch] === undefined) chProg[ch] = pr;
      } else if(hi === 0xA0 || hi === 0xB0 || hi === 0xE0){ q += 2; }
      else if(hi === 0xD0){ q++; }
      else { break; }                                    // 未知状态字节：防死循环
    }
    p = end;
  }

  /* ---- 汇总每通道统计（复音度 / 音域 / 覆盖） ---- */
  const hist = new Array(12).fill(0);
  Object.keys(notesByCh).forEach(ch => {
    if(+ch === GM_DRUM_CH) return;
    notesByCh[ch].forEach(n => { hist[((n.midi % 12) + 12) % 12]++; });
  });
  const keyPc = detectKeyPc(hist);
  const meta = {title:'MIDI 导入', keyName: PC_KEYNAME[keyPc] || 'C', keyPc, meter, tempo,
                tempoFrom: anyTempo ? 'midi' : 'none'};

  let maxTick = 0;
  Object.values(notesByCh).forEach(arr => arr.forEach(n => { maxTick = Math.max(maxTick, n.tick + n.dur); }));

  const channels = [];
  Object.keys(notesByCh).map(Number).sort((a,b) => a - b).forEach(ch => {
    const arr = notesByCh[ch];
    if(!arr.length) return;
    const midis = arr.map(n => n.midi);
    const prog = chProg[ch];
    const isDrum = ch === GM_DRUM_CH;
    const name = isDrum ? '鼓组 (Drums)' : (prog !== undefined ? GM_INSTR[prog] : '未指定音色');
    /* 复音度：把音符展开成 +1/-1 时间线，统计最大同时音数 与 「只响 1 个音」的时间占比 */
    const ev = [];
    arr.forEach(n => { ev.push([n.tick, 1]); ev.push([n.tick + n.dur, -1]); });
    ev.sort((a,b) => a[0] - b[0]);
    let cur = 0, maxSim = 0, mono = 0, totT = 0, last = ev.length ? ev[0][0] : 0;
    ev.forEach(([tt, d]) => {
      if(tt > last){
        const dur = tt - last; totT += dur;
        if(cur === 1) mono += dur;
        if(cur > maxSim) maxSim = cur;
        last = tt;
      }
      cur += d; if(cur < 0) cur = 0;
    });
    const firstTick = Math.min(...arr.map(n => n.tick));
    const lastTick  = Math.max(...arr.map(n => n.tick + n.dur));
    channels.push({
      ch, name, program: prog, isDrum,
      count: arr.length,
      minMidi: Math.min(...midis), maxMidi: Math.max(...midis),
      avgMidi: midis.reduce((s,m) => s + m, 0) / arr.length,
      maxSim, monoPct: totT ? mono / totT : 0,
      avgDur: arr.reduce((s,n) => s + n.dur, 0) / arr.length / tpb,
      cover: maxTick ? (lastTick - firstTick) / maxTick : 0
    });
  });

  if(!channels.length) return {error:'MIDI 里没有找到音符'};
  if(!channels.some(c => !c.isDrum)) return {error:'MIDI 里只有打击乐，没有可成谱的旋律'};
  return {
    meta, channels, detected: detectMelodyChannel(channels),
    tpb, notesByCh, keyPc,
    beatsPerMeasure: meta.meter[0] * (4 / meta.meter[1])
  };
}

function pickMidiUnit(notes, tpb){
  const cands = [1, 0.5, 0.25, 0.125];
  for(const u of cands){
    let ok = 0;
    notes.forEach(n => {
      const t = n.tick / tpb, d = n.dur / tpb;
      const et = Math.abs(t/u - Math.round(t/u)) * u;
      const ed = Math.abs(d/u - Math.round(d/u)) * u;
      if(et < u * 0.3 && ed < u * 0.3) ok++;
    });
    if(ok / notes.length >= 0.9) return u;
  }
  return 0.125;
}

function detectMelodyChannel(chs){
  const cand = chs.filter(c => !c.isDrum && c.count >= 8);
  if(!cand.length) return chs.length ? chs[0].ch : 0;
  const maxCnt = Math.max(...cand.map(c => c.count));
  const avgs = cand.map(c => c.avgMidi);
  const lo = Math.min(...avgs), hi = Math.max(...avgs), span = (hi - lo) || 1;
  let best = cand[0].ch, bestScore = -Infinity;
  cand.forEach(c => {
    const mono = c.maxSim <= 2 ? 1 : (c.maxSim <= 3 ? 0.4 : 0);   // 近单声部 = 旋律最硬的指标
    const cnt  = c.count / maxCnt;
    const reg  = (c.avgMidi - lo) / span;
    const cov  = Math.min(c.cover, 1);
    const dur  = Math.min(c.avgDur, 1);
    const score = mono * 1.00 + cnt * 1.10 + reg * 0.45 + cov * 0.45 + dur * 0.35;
    if(score > bestScore){ bestScore = score; best = c.ch; }
  });
  return best;
}

function midiChannelParsed(parsed, ch){
  const chs = Array.isArray(ch) ? ch : [ch];
  const arr = [];
  chs.forEach(c => (parsed.notesByCh && parsed.notesByCh[c] || []).forEach(n => arr.push(n)));
  const tpb = parsed.tpb, keyPc = parsed.keyPc;
  const unit = pickMidiUnit(arr, tpb);
  const byOnset = new Map();
  arr.forEach(n => {
    const t   = Math.round(n.tick / tpb / unit) * unit;
    const dur = Math.max(unit, Math.round(n.dur / tpb / unit) * unit);
    const k   = t.toFixed(4);
    let e = byOnset.get(k);
    if(!e){ e = {t, dur, items: [], rest: false, voice: String(chs[0])}; byOnset.set(k, e); }
    e.items.push(midiToDegreeItem(n.midi, keyPc));
    if(dur > e.dur) e.dur = dur;
  });
  const evs = [...byOnset.values()].sort((a,b) => a.t - b.t);
  const totalBeats = evs.reduce((mx, e) => Math.max(mx, e.t + e.dur), 0);
  return {meta: parsed.meta, events: evs, errors: [], beatsPerMeasure: parsed.beatsPerMeasure,
          totalBeats, midiUnit: unit, tempoFrom: parsed.meta && parsed.meta.tempoFrom};
}

function decodeXmlText(bytes){
  const TD = (label, b) => new TextDecoder(label).decode(b);
  if(bytes.length >= 2){                                   // ① BOM 最权威
    if(bytes[0] === 0xFF && bytes[1] === 0xFE) return TD('utf-16le', bytes.subarray(2));
    if(bytes[0] === 0xFE && bytes[1] === 0xFF) return TD('utf-16be', bytes.subarray(2));
  }
  if(bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return TD('utf-8', bytes.subarray(3));
  if(bytes.length >= 2){                                   // ② 无 BOM 的 UTF-16：看 "<?" 的字节序
    if(bytes[0] === 0x3C && bytes[1] === 0x00) return TD('utf-16le', bytes);
    if(bytes[0] === 0x00 && bytes[1] === 0x3C) return TD('utf-16be', bytes);
  }
  /* ③ XML 声明里的 encoding。声明本身在 UTF-8 / GBK 下都是 ASCII，可以按 latin1 直接读；
        命中未知标签时 TextDecoder 会抛 RangeError，逐层兜底。 */
  const m = /encoding\s*=\s*["']([A-Za-z0-9_.\-]+)["']/.exec(TD('latin1', bytes.subarray(0, 240)));
  if(m){
    const label = m[1].toLowerCase();
    if(label !== 'utf-8' && label !== 'utf8'){
      for(const cand of [label, label === 'gb2312' || label === 'gb18030' ? 'gbk' : label]){
        try {
          const t = TD(cand, bytes);
          /* 声明与实际不符时（OMR 工具改过声明的谱并不罕见）会解出一堆 NUL ——
             XML 里不该有 NUL，出现就说明这个编码猜错了，别硬用。 */
          if(t.indexOf('\u0000') < 0) return t;
        } catch(e){ /* 换个候选继续试 */ }
      }
    }
  }
  return TD('utf-8', bytes);                               // ④ 默认 UTF-8（含无声明的纯 ASCII 谱）
}

function xmlTitle(parsed, name){
  const t = String((parsed.meta && parsed.meta.title) || '').trim();
  if(t && t !== XML_UNTITLED) return t;
  const fromName = String(name || '').replace(/\.[^.]+$/, '').trim();
  return fromName || XML_UNTITLED;
}

function beatUnitQuarter(u){
  const q = BEAT_UNIT_Q[String(u || '').trim().toLowerCase()];
  return q === undefined ? 1 : q;
}

function tempoFromMark(snd, met){
  let per = 0, uq = 1;
  if(met){
    const bu = met.querySelector('beat-unit'), pm = met.querySelector('per-minute');
    if(bu) uq = beatUnitQuarter(bu.textContent) * (met.querySelector('beat-unit-dot') ? 1.5 : 1);
    if(pm) per = parseFloat(pm.textContent) || 0;
  }
  const st = (snd && snd.getAttribute && snd.getAttribute('tempo'))
    ? (parseFloat(snd.getAttribute('tempo')) || 0) : 0;
  if(st > 0){
    if(per > 0 && Math.abs(st - per) < 1e-6 && Math.abs(uq - 1) > 1e-9) return st * uq;
    return st;
  }
  return per > 0 ? per * uq : 0;
}

function parseMusicXML(text, mainOnly){
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); }
  catch(e){ return {error:'XML 解析异常'}; }
  if(doc.querySelector('parsererror')) return {error:'MusicXML 不是合法 XML'};
  const root = doc.querySelector('score-partwise') || doc.querySelector('score-timewise');
  if(!root) return {error:'未找到 score-partwise / score-timewise 根节点'};
  const mv = doc.querySelector('work-title') || doc.querySelector('movement-title');
  const meta = {title:(mv && mv.textContent ? mv.textContent.trim() : '') || XML_UNTITLED,
                keyName:'C', keyPc:0, meter:[4,4], tempo:88};
  const events = [], errors = [];
  const STEP_PC = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  let firstKey = true;
  let curBeats = 4, curBeatType = 4;            // 拍号提升到函数级（meta.meter 要用）
  /* 速度：只认**第一处**标记当全曲速度（后面的变速只计数、不改速度）。
     旧实现是「最后一个赢」—— 谱尾一个 rit. 或第二段的速度标记会把**整首**拖慢，
     正是「听着很慢」的第二种成因。 */
  let tempoSeen = false, tempoChanges = 0, tempoFrom = 'none';
  root.querySelectorAll('part').forEach((part, pIdx) => {
    let t = 0, lastStart = 0;
    let curDiv = 4, curFifths = 0, curKeyPc = 0;
    [...part.querySelectorAll('measure')].forEach(m => {
      [...m.children].forEach(el => {
        const tag = el.tagName.toLowerCase();
        if(tag === 'attributes'){
          const d = el.querySelector('divisions'); if(d) curDiv = parseInt(d.textContent,10) || curDiv;
          const k = el.querySelector('key > fifths');
          if(k){ curFifths = parseInt(k.textContent,10) || 0; curKeyPc = KEY_PC[FIFTHS_KEY[curFifths]] || 0;
                 if(firstKey){ meta.keyName = FIFTHS_KEY[curFifths] || 'C'; meta.keyPc = curKeyPc; firstKey = false; } }
          const mt = el.querySelector('time');
          if(mt){ const b = mt.querySelector('beats'), bt = mt.querySelector('beat-type');
                  if(b && bt){ curBeats = parseInt(b.textContent,10); curBeatType = parseInt(bt.textContent,10); } }
          /* 这里**不再**顺便读 <sound tempo>：`<sound>` 不会是 <attributes> 的子元素，
             那行是死代码（真正的位置是 <direction> 里，见下面的 direction 分支）。 */
        } else if(tag === 'direction' || tag === 'sound'){
          /* ★ 速度标记的**主路径**：`<direction><sound tempo="…"/>`。
             旧实现漏了这一支（只在 direction 的直接子元素里找 `sound`），
             于是带速度标记的谱也一律按兜底 88 BPM 播放 —— 见 tempoFromMark 上方注释。 */
          const snd = tag === 'sound' ? el : el.querySelector('sound');
          const met = tag === 'sound' ? null : el.querySelector('metronome');
          const tp  = tempoFromMark(snd, met);
          if(tp > 0){
            if(!tempoSeen){
              meta.tempo = tp; tempoSeen = true;
              tempoFrom = (snd && snd.getAttribute && snd.getAttribute('tempo')) ? 'sound'
                        : (met ? 'metronome' : 'sound');
            } else if(Math.abs(tp - meta.tempo) > 0.5) tempoChanges++;   // 中途变速：只计数
          }
        } else if(tag === 'note'){
          if(el.querySelector('grace')) return;                       // 倚音不占时值
          const vEl = el.querySelector('voice');
          const voice = vEl ? vEl.textContent.trim() : '1';
          const chord = !!el.querySelector('chord');
          const durEl = el.querySelector('duration');
          const dur = durEl ? (parseInt(durEl.textContent,10) / curDiv) : 0;
          if(dur <= 0 && !chord) return;
          const onset = chord ? lastStart : t;
          if(el.querySelector('rest')){
            events.push({t: onset, dur, items: [], rest: true, voice, part: pIdx});
          } else {
            const stepEl = el.querySelector('pitch > step');
            const step = stepEl ? stepEl.textContent.toUpperCase() : '';
            const pcBase = STEP_PC[step];
            if(!stepEl || pcBase === undefined){
              /* ★ 这两处**绝对不能 `return`**：无音高音符（`<unpitched>`，打击乐 / 口哨）和
                 异常的 `<step>` 虽然映射不到琴键，但它**占着时值** —— 原来写 `return` 会跳过
                 函数末尾的 `t += dur`，于是该 part 之后所有音符整体提前、节奏全错
                 （实测：C5 · unpitched · E5 · G5 的起点成了 0/1/2，正确应为 0/2/3）。
                 按「空格」占位：既保住后续对齐，也在谱面上如实标出这里没有可弹的音。 */
              events.push({t: onset, dur, items: [], rest: true, voice, part: pIdx});
            } else {
              const octEl = el.querySelector('pitch > octave');
              const octave = octEl ? parseInt(octEl.textContent,10) : 4;
              const altEl = el.querySelector('pitch > alter');
              const alter = altEl ? parseInt(altEl.textContent,10) : 0;
              const midi = 12 * (octave + 1) + pcBase + alter;
              events.push({t: onset, dur, items: [midiToDegreeItem(midi, curKeyPc)],
                           rest: false, voice, part: pIdx});
            }
          }
          if(!chord){ t += dur; lastStart = onset; }
        } else if(tag === 'backup'){
          const d = el.querySelector('duration'); if(d) t -= parseInt(d.textContent,10) / curDiv;
        } else if(tag === 'forward'){
          const d = el.querySelector('duration'); if(d) t += parseInt(d.textContent,10) / curDiv;
        }
      });
    });
  });
  if(mainOnly){
    const keep = pickMainVoice(events);
    if(keep) for(let i = events.length - 1; i >= 0; i--)
      if(voiceKey(events[i]) !== keep) events.splice(i, 1);   // 与 pickMainVoice 同用 voiceKey，别退回只比 voice
  }
  events.sort((a,b) => a.t - b.t);
  /* ★ 顺序不能反：beatsPerMeasure 是从 meta.meter 算出来的，而 meta.meter 的赋值
     原来在这行**之后**，于是它永远按默认的 [4,4] 算出 4 拍 —— 3/4 的曲子会被画成
     每 4 拍一条小节线（每小节多出一拍空白），6/8 也一样。
     实测夹具 E（3/4）：改前 beatsPerMeasure=4 / rows每小节=8，改后 3 / 6。 */
  meta.meter = [curBeats, curBeatType];
  const beatsPerMeasure = meta.meter[0] * (4 / meta.meter[1]);
  const totalBeats = events.reduce((mx, e) => Math.max(mx, e.t + e.dur), 0);
  return {meta, events, errors, beatsPerMeasure, totalBeats, mainOnly: !!mainOnly,
          tempoFrom, tempoChanges};
}

function voiceKey(e){ return (e.part || 0) + ':' + (e.voice || '1'); }

function pickMainVoice(events){
  const byVoice = {};
  events.forEach(e => {
    if(e.rest) return;
    const v = voiceKey(e);
    const b = byVoice[v] || (byVoice[v] = {sum:0, n:0});
    e.items.forEach(it => { b.sum += it.midi; b.n++; });
  });
  const voices = Object.keys(byVoice);
  if(!voices.length) return null;
  const total = voices.reduce((s, v) => s + byVoice[v].n, 0);
  const thr = Math.max(12, Math.ceil(total * 0.05));   // 残片阈值：不足 12 个音、或不足总量 5%
  let cand = voices.filter(v => byVoice[v].n >= thr);
  if(!cand.length) cand = voices.filter(v => byVoice[v].n >= 8);   // 兜底：谱子本身就很短
  if(!cand.length) cand = voices;                                   // 再兜底：总不能空着
  let best = null, bestScore = -Infinity;
  cand.forEach(v => {
    const s = byVoice[v];
    const score = (s.sum / s.n) * 1000 + s.n;     // 平均音高主导，音符数次之
    if(score > bestScore){ bestScore = score; best = v; }
  });
  return best;
}

function detectKeyPc(hist){
  let best = 0, bestR = -Infinity;
  for(let k = 0; k < 12; k++){
    let num = 0, d1 = 0, d2 = 0;
    for(let i = 0; i < 12; i++){
      const pr = KEY_PROFILE[i], h = hist[(k + i) % 12] || 0;
      num += pr * h; d1 += pr * pr; d2 += h * h;
    }
    const r = num / Math.sqrt(d1 * d2 || 1);
    if(r > bestR){ bestR = r; best = k; }
  }
  return best;
}

function tempoNote(parsed){
  const tp = Math.round((ST.grid && ST.grid.meta && ST.grid.meta.tempo) || 88);
  if(parsed && parsed.tempoFrom === 'none')
    return '（谱里没有速度信息，按默认 ' + tp + ' BPM 播放，可在工具栏「速度」里改）';
  if(parsed && parsed.tempoChanges)
    return '（速度 ' + tp + ' BPM · 谱内有 ' + parsed.tempoChanges + ' 处变速，按第一处播放）';
  return '（速度 ' + tp + ' BPM）';
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { beatUnitQuarter, decodeXmlText, detectKeyPc, detectMelodyChannel, midiChannelParsed, midiToDegreeItem, parseMidi, parseMusicXML, parseNotes, parseSource, parseVoiceLine, pickMainVoice, pickMidiUnit, tempoFromMark, tempoNote, tokenize, voiceKey, xmlTitle };
