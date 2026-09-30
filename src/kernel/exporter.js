/* =====================================================================
   exporter.js —— 导出 / 打包 / 二维码
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { lastGeom, setLastGeom } from './editor.js';
import { $, CRC_TABLE, PNG_SCALE, XML_HEAD } from './foundation.js';
import { NOTE_RATIO, SHADE_DARK, SHADE_LIGHT, ln, renderScore } from './renderer.js';
import { ST, baseName, dl, lastExportNote, setLastExportNote } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

function renderForExport(paged, split){
  const keep = lastGeom;
  /* forOutput = true：导出的 SVG / PNG 是给人打印的**成品**，与真打印同一口径 ——
     简谱对照在纸上不印（用户 2026-09-18），所以导出也一并收掉。
     屏幕上的「分页预览」不走这里，仍按 st.optDegree 照画。 */
  const res = renderScore(ST.grid, ST.tuning, ST.st,
                          {paged: paged !== false, split: !!split, forOutput: true});
  setLastGeom(keep);
  return res;
}

function exportSvg(){
  if(!ST.grid) return;
  dl(new Blob([XML_HEAD + renderForExport(true).svg], {type:'image/svg+xml;charset=utf-8'}), baseName() + '.svg');
}

function pngBytesOf(page){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([XML_HEAD + page.svg], {type:'image/svg+xml;charset=utf-8'}));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width  = Math.round(page.width  * PNG_SCALE);
      cv.height = Math.round(page.height * PNG_SCALE);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(b => {
        if(!b){ reject(new Error('画布导出失败')); return; }
        b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 转图片失败')); };
    img.src = url;
  });
}

function crc32(u8){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ u8[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files){
  const enc = new TextEncoder();
  const u16 = v => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]);
  const u32 = v => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);
  const cat = parts => {
    let n = 0; parts.forEach(p => n += p.length);
    const out = new Uint8Array(n);
    let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  };
  const d = new Date(), yr = Math.max(0, d.getFullYear() - 1980);
  const tTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const tDate = ((yr << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  let off = 0;
  const locals = [], cents = [];
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const head = cat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(tTime), u16(tDate),
                      u32(crc), u32(n), u32(n), u16(name.length), u16(0)]);
    locals.push(head, name, f.data);
    cents.push(cat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(tTime), u16(tDate),
                    u32(crc), u32(n), u32(n), u16(name.length), u16(0), u16(0), u16(0), u16(0),
                    u32(0), u32(off), name]));
    off += head.length + name.length + n;
  });
  const central = cat(cents);
  const eocd = cat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
                    u32(central.length), u32(off), u16(0)]);
  return new Blob([cat(locals), central, eocd], {type:'application/zip'});
}

/* ---------- 图例 ---------- */
function buildLegend(){
  const wrap = $('legend');
  const item = (inner, text) =>
    '<div class="item"><svg width="48" height="26" viewBox="0 0 48 26" xmlns="http://www.w3.org/2000/svg">' +
    inner + '</svg><span>' + text + '</span></div>';
  const D = 'fill="#1b1b19"';
  /* 图例里的音符示意：与谱面**同一套画法**（正圆符头、符干贴符头顶、左端全体对齐在最左、
     符尾垂直下垂），只是等比缩进 48×26 的图例框。谱面上 半径 = 行高/2 × NOTE_RATIO、列宽 28；
     图例里行高取 12 → 半径 6 × NOTE_RATIO、列宽 6.7、符尾 8、错开 2.3。
     符干/符尾跟谱面一样不随符头缩放（都按列宽算），这样图例和实物的大头小头比例一致。 */
  const INK = '#1b1b19';
  const R = 6 * NOTE_RATIO, COL = 6.7, TOPY = 13 - R;
  const STEML = 5;                       // 符干左端（= 谱面上「全部对齐到最左边」那条线）
  const head = (cx, hollow) => '<circle cx="' + cx + '" cy="13" r="' + R + '" ' +
      (hollow ? 'fill="none" stroke="' + INK + '" stroke-width="1.7"' : D) + '/>';
  const stem = cx => ln(cx, TOPY, STEML, TOPY, INK, 1.5);                  // 贴符头顶、往左拉齐
  const flag = (cx, k) => ln(STEML + k * 2.3, TOPY, STEML + k * 2.3, TOPY + 8, INK, 1.5);
  /* 符尾连接的示意：同一拍内的符尾不再各自下垂，而是首尾相接成一条**竖梁**
     （= 把五线谱连同它的横梁一起逆时针转 90°）。梁就落在「全体符干左端对齐」那条线上。 */
  const noteRow = (cx, cy) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" ' + D + '/>' +
                              ln(cx, cy - R, STEML, cy - R, INK, 1.5);
  const beamGlyph = noteRow(34, 20) + noteRow(20, 9) +
                    ln(STEML, 20 - R, STEML, 9 - R, INK, 2);
  /* 图例里的轨道示意：7 条 6px 宽，按「中央深 / 两侧各两条浅 / 再外一条深」画 */
  let cols = '';
  for(let i = 0; i < 7; i++){
    const dark = Math.abs(i - 3) % 3 === 0;
    cols += '<rect x="' + (3 + i * 6) + '" y="3" width="6" height="20" fill="' +
            (dark ? SHADE_DARK : SHADE_LIGHT) + '" stroke="#dcdbd3"/>';
  }
  cols += '<line x1="24" y1="3" x2="24" y2="23" stroke="#1b1b19" stroke-width="2"/>';
  wrap.innerHTML = [
    item(head(32, false) + stem(32),
         '实心圆音符 + 贴在它正上方、一直往左拉到最左边的符干 = 四分音符（弹一拍）'),
    item(head(32, false) + stem(32) + flag(32, 0),
         '符尾条数 = 时值：1 条 = 八分音符（半拍），2 条 = 十六分音符（四分之一拍）'),
    item(beamGlyph,
         '同一拍内相邻的符尾会连成一条竖梁（4/4 每拍连 2 个八分、6/8 每拍连 3 个）—— 五线谱的连梁转 90°'),
    item(head(32, true) + stem(32),
         '空心符头 = 二分 / 全音符（时值更长）'),
    item(head(16, false) + head(34, false) + stem(34),
         '同一横行两个点 = 双音一起弹（相邻多点 = 滑音）'),
    item(cols,
         '深浅交替的竖条 = 琴键轨道（中央最低音为深色，往两边各 2 条浅色后又是一条深色）；粗竖线 = 左右手分界')
  ].join('');
}

function noteExported(msg){
  const el = $('stat');
  if(lastExportNote) el.textContent = el.textContent.replace(lastExportNote, '');
  setLastExportNote(' · 已导出 ' + msg);
  el.textContent += lastExportNote;
}

(function(root){
  var RS_BLOCKS = {
    1:[26,10,1,16,0,0], 2:[44,16,1,28,0,0], 3:[70,26,1,44,0,0],
    4:[100,18,2,32,0,0], 5:[134,24,2,43,0,0], 6:[172,16,4,27,0,0],
    7:[196,18,4,31,0,0], 8:[242,22,2,38,2,39], 9:[292,22,3,36,2,37],
    10:[346,26,4,43,1,44]
  };
  var ALIGN = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],
               6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
  var EC_M = 0;
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function(){ var x = 1;
    for(var i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 0x100) x ^= 0x11D; }
    for(var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; })();
  function gmul(a, b){ return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
  function rsGenPoly(n){
    var p = [1];
    for(var i = 0; i < n; i++){
      var q = [1, EXP[i]], r = new Array(p.length + 1).fill(0);
      for(var a = 0; a < p.length; a++) for(var b = 0; b < 2; b++) r[a + b] ^= gmul(p[a], q[b]);
      p = r;
    }
    return p;
  }
  function rsEncode(data, ecLen){
    var gen = rsGenPoly(ecLen), res = new Array(ecLen).fill(0);
    for(var i = 0; i < data.length; i++){
      var f = data[i] ^ res[0];
      res.shift(); res.push(0);
      if(f !== 0) for(var j = 0; j < ecLen; j++) res[j] ^= gmul(gen[j + 1], f);
    }
    return res;
  }
  function utf8(str){
    var out = [];
    for(var i = 0; i < str.length; i++){
      var c = str.charCodeAt(i);
      if(c < 0x80) out.push(c);
      else if(c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if(c >= 0xD800 && c <= 0xDBFF){
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function bchFormat(data){
    var d = data << 10;
    for(var i = 4; i >= 0; i--) if(d & (1 << (i + 10))) d ^= 0x537 << i;
    return ((data << 10) | d) ^ 0x5412;
  }
  function bchVersion(v){
    var d = v << 12;
    for(var i = 5; i >= 0; i--) if(d & (1 << (i + 12))) d ^= 0x1F25 << i;
    return (v << 12) | d;
  }
  function pickVersion(nBytes){
    for(var v = 1; v <= 10; v++){
      var b = RS_BLOCKS[v];
      var dataCw = b[2] * b[3] + b[4] * b[5];
      var hdr = 4 + (v < 10 ? 8 : 16);            /* ⚠️ v10 起字符计数用 16 位 */
      if(nBytes * 8 + hdr <= dataCw * 8) return v;
    }
    return 0;
  }
  function buildCodewords(bytes, v){
    var b = RS_BLOCKS[v];
    var dataCw = b[2] * b[3] + b[4] * b[5];
    var bits = [];
    var push = function(val, len){ for(var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4);                                                   /* byte 模式 */
    push(bytes.length, v < 10 ? 8 : 16);
    for(var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    var cap = dataCw * 8;
    for(var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while(bits.length % 8) bits.push(0);
    var pad = [0xEC, 0x11], k = 0;
    while(bits.length < cap) push(pad[k++ % 2], 8);
    var cw = [];
    for(var j = 0; j < bits.length; j += 8){
      var by = 0;
      for(var m = 0; m < 8; m++) by = (by << 1) | bits[j + m];
      cw.push(by);
    }
    var blocks = [], p = 0, ecLen = b[1];
    [[b[2], b[3]], [b[4], b[5]]].forEach(function(sp){
      for(var n = 0; n < sp[0]; n++){
        var d = cw.slice(p, p + sp[1]); p += sp[1];
        blocks.push({data: d, ec: rsEncode(d, ecLen)});
      }
    });
    var out = [], maxD = 0;
    blocks.forEach(function(x){ maxD = Math.max(maxD, x.data.length); });
    for(var i2 = 0; i2 < maxD; i2++)
      blocks.forEach(function(bl){ if(i2 < bl.data.length) out.push(bl.data[i2]); });
    for(var i3 = 0; i3 < ecLen; i3++) blocks.forEach(function(bl){ out.push(bl.ec[i3]); });
    return out;
  }
  function newMat(size, val){
    var a = [];
    for(var y = 0; y < size; y++){ var r = new Array(size); for(var x = 0; x < size; x++) r[x] = val; a.push(r); }
    return a;
  }
  function buildBase(codewords, v){
    var size = 17 + 4 * v;
    var m = newMat(size, 0), fn = newMat(size, false);
    var set = function(x, y, val){ m[y][x] = val; fn[y][x] = true; };
    var finder = function(fx, fy){
      for(var dy = -1; dy <= 7; dy++)
        for(var dx = -1; dx <= 7; dx++){
          var x = fx + dx, y = fy + dy;
          if(x < 0 || y < 0 || x >= size || y >= size) continue;
          var d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          set(x, y, (d === 2 || d === 4) ? 0 : 1);        /* d=3 外环深 / d=2 亮环 / d=4 分隔带 */
        }
    };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for(var t = 8; t <= size - 9; t++){
      set(t, 6, (t % 2 === 0) ? 1 : 0);
      set(6, t, (t % 2 === 0) ? 1 : 0);
    }
    var ap = ALIGN[v];
    for(var a = 0; a < ap.length; a++)
      for(var b2 = 0; b2 < ap.length; b2++){
        var cx = ap[a], cy = ap[b2];
        /* ⚠️ 只跳过压住三个定位图形的那三个；不可写成「中心已是功能格就跳」——
           那样会把落在定时行/列上的 v7+ 校准图形一起跳掉，v6 以下全对、v7 起全废。 */
        if((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
        for(var dy2 = -2; dy2 <= 2; dy2++)
          for(var dx2 = -2; dx2 <= 2; dx2++)
            set(cx + dx2, cy + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1 ? 1 : 0);
      }
    for(var i = 0; i <= 8; i++){ if(!fn[8][i]) set(i, 8, 0); if(!fn[i][8]) set(8, i, 0); }
    /* ⚠️ 右上横条与左下竖条都要占位；漏竖条 → 数据填进格式信息格，图样照旧好看但扫不出 */
    for(var jj = 0; jj < 8; jj++){
      if(!fn[8][size - 1 - jj]) set(size - 1 - jj, 8, 0);
      if(!fn[size - 1 - jj][8]) set(8, size - 1 - jj, 0);
    }
    if(v >= 7){
      var vb = bchVersion(v);
      for(var kk = 0; kk < 18; kk++){
        var bit = (vb >> kk) & 1;
        var vx = size - 11 + (kk % 3), vy = Math.floor(kk / 3);
        set(vx, vy, bit); set(vy, vx, bit);
      }
    }
    set(8, size - 8, 1);                                          /* 固定深色模块 */
    var total = codewords.length * 8, idx = 0;
    var bitAt = function(i){ return (codewords[i >> 3] >> (7 - (i & 7))) & 1; };
    var row = size - 1, dir = -1;
    for(var col = size - 1; col > 0; col -= 2){
      if(col === 6) col--;
      for(;;){
        for(var c = 0; c < 2; c++){
          var x2 = col - c;
          if(!fn[row][x2]){ m[row][x2] = (idx < total) ? bitAt(idx) : 0; idx++; }
        }
        row += dir;
        if(row < 0 || row >= size){ row -= dir; dir = -dir; break; }
      }
    }
    return {m: m, fn: fn, size: size};
  }
  function maskFn(k, y, x){
    switch(k){
      case 0: return (y + x) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (y + x) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return (y * x) % 2 + (y * x) % 3 === 0;
      case 6: return ((y * x) % 2 + (y * x) % 3) % 2 === 0;
      default: return ((y + x) % 2 + (y * x) % 3) % 2 === 0;
    }
  }
  function writeFormat(m, size, mask){
    var bits = bchFormat((EC_M << 3) | mask);
    var bit = function(i){ return (bits >> i) & 1; };
    for(var i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for(var j = 9; j < 15; j++) m[8][14 - j] = bit(j);
    for(var k = 0; k < 8; k++) m[8][size - 1 - k] = bit(k);
    for(var l = 8; l < 15; l++) m[size - 15 + l][8] = bit(l);
    m[size - 8][8] = 1;
  }
  function penalty(m, size){
    var p = 0, y, x, run;
    for(y = 0; y < size; y++){
      run = 1;
      for(x = 1; x < size; x++){
        if(m[y][x] === m[y][x - 1]) run++;
        else { if(run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if(run >= 5) p += 3 + (run - 5);
    }
    for(x = 0; x < size; x++){
      run = 1;
      for(y = 1; y < size; y++){
        if(m[y][x] === m[y - 1][x]) run++;
        else { if(run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if(run >= 5) p += 3 + (run - 5);
    }
    for(y = 0; y < size - 1; y++)
      for(x = 0; x < size - 1; x++){
        var c = m[y][x];
        if(c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
    var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    var seq = function(get){
      for(var s = 0; s <= size - 11; s++){
        var a = true, b = true;
        for(var t = 0; t < 11; t++){
          var v = get(s + t);
          if(v !== pat1[t]) a = false;
          if(v !== pat2[t]) b = false;
        }
        if(a) p += 40;
        if(b) p += 40;
      }
    };
    for(y = 0; y < size; y++) seq(function(t){ return m[y][t]; });
    for(x = 0; x < size; x++) seq(function(t){ return m[t][x]; });
    var dark = 0;
    for(y = 0; y < size; y++) for(x = 0; x < size; x++) if(m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return p;
  }
  function encode(text){
    var bytes = utf8(String(text));
    var v = pickVersion(bytes.length);
    if(!v) return null;
    var base = buildBase(buildCodewords(bytes, v), v);
    var best = null, bestP = Infinity, bestMask = 0;
    for(var mask = 0; mask < 8; mask++){
      var m = base.m.map(function(r){ return r.slice(); });
      for(var y = 0; y < base.size; y++)
        for(var x = 0; x < base.size; x++)
          if(!base.fn[y][x] && maskFn(mask, y, x)) m[y][x] ^= 1;
      writeFormat(m, base.size, mask);
      var pp = penalty(m, base.size);
      if(pp < bestP){ bestP = pp; best = m; bestMask = mask; }
    }
    return {version: v, size: base.size, mask: bestMask, modules: best};
  }
  root.KAL_QR = {encode: encode, utf8: utf8, pickVersion: pickVersion};
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ─────────────── 本模块对外出口 ─────────────── */
export { buildLegend, crc32, exportSvg, noteExported, pngBytesOf, renderForExport, zipStore };
