/* =====================================================================
   renderer.js —— SVG 谱面排版（分页 / 音位轴 / 页眉页脚）
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { setLastGeom } from './editor.js';
import { ST, attachLinkUrl, attachVals, sheetCount } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   4. 渲染：拇指琴专用谱（SVG）
   ===================================================================== */
/* PAD/HEAD_H 要装下页眉的三行小字：标题(+22) / 数据行1(+43) / 数据行2(+58) / 分隔线(+74)
   PANEL_ROWS：**老口径的兜底段行数**，现在只剩一个用处 —— drawRows 的 closing 默认值
   （「装不满一段就画收尾粗线」）。真正的分段行数改由 rowsPerCol() 按纸张反推，
   因为用户定稿「一栏 = 一段连续的行，栏内不许再切断」。
   RIGHT：幕布版右留白 = 小节号 + 简谱对照。文字最宽时（主旋律 6 字 + 伴奏 5 字）约 97px，
          所以取 108 留 11px 余量。**上限**：A4 去 12mm 边距可印宽 703px，
          21 键（列宽 25 × 21 列）时 W = 62 + RIGHT + 525，RIGHT 超过 116 就会溢出纸张。
   ★ RIGHT_OUT（用户 2026-09-18）：**打印 / 导出**时的右留白 —— 只放小节号。
     这一版把「简谱对照」从纸上拿掉（用户定稿），于是右边那 86px 空出来了，
     正好付给新增的「右侧信息栏」（二维码 / 附加信息 / 读谱方向 / logo）。
     ⚠️ 两者必须分开记：屏幕上的分页预览若开着简谱对照，仍要按 RIGHT 排（见 renderScore 的 deg）。 */
const RD = { ROW_H: 25, LEFT: 62, RIGHT: 108, RIGHT_OUT: 22, PAD: 18, PANEL_ROWS: 32, AXIS_H: 56, HEAD_H: 96 };
/* 简谱对照在**轨道右侧**的起笔 x（相对网格右缘 x0+gw 的偏移）：
   要先让开小节号（小节号 middle 锚在 +9，最多两位数 ≈ 占到 +16），所以从 +24 起。 */
const DEG_X = 24;
/* 行内文字基线：跟着行高走，行高改了不用到处改魔法数字 */
const BASE_Y = (y, extra) => y + RD.ROW_H / 2 + (extra === undefined ? 3.5 : extra);
const CW = len => len >= 21 ? 25 : 28;              // 轨道宽度
/* 符头圆直径 = 行高 × 这个比例（唯一真源）：drawNote 与图例都按它算，
   用户调符头大小时只改这一处。1 = 直径等于行高（相邻行的符头会上下相切）。 */
const NOTE_RATIO = 0.7;
/* 时值 → 符尾条数（八分 1 / 十六分 2 / 三十二分 3；附点先还原成不带点的时值）。
   drawNote（画单符尾）与 planBeams（连成横梁）共用这一份口径 ——
   两处各算一套的话，分组用的条数会和画出来的对不上。 */
const DOTTED_DURS = [0.1875, 0.375, 0.75, 1.5, 3];
const isDotted = d => DOTTED_DURS.some(x => Math.abs(x - d) < 1e-6);
const flagCount = d => {
  const b = isDotted(d) ? d / 1.5 : d;
  return b <= 0.125 ? 3 : b <= 0.25 ? 2 : b <= 0.5 ? 1 : 0;
};
/* 所有符干的**左端**统一落在「第 0 轨左缘再往左 STEM_OUT」处 ——
   即用户口径「符干延长到左边第一条轨道外，离第一轨再加一个行宽」。
   于是符干长度随音符所在列变化（越靠右越长），但左端对齐 →
   全部符尾排成一竖列，时值一眼可比。STEM_OUT 取行高，想再往外挪就改这里。 */
const STEM_OUT = RD.ROW_H;
/* 谱面字体族：等宽优先（网格对齐），中文兜底雅黑。
   text 的 font-family 属性与 <style> 共用这一份，改一处即可（注意属性值要过 escAttr） */
const FONT_STACK = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Microsoft YaHei",sans-serif';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n2 = v => Math.round(v * 100) / 100;
/* 属性值转义：tg() 一律用双引号包裹属性，值里只要出现一个 " 就会提前闭合标签，
   后面的词变成裸 token，导出的 .svg 直接成了非法 XML（浏览器打开报
   「Unexpected token inside opening tag」）。esc() 只管标签之间的文本，属性得单独过一遍。 */
const escAttr = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const tg = (n, a, inner) => '<' + n + ' ' + Object.entries(a).filter(([,v]) => v !== undefined)
        .map(([k,v]) => k + '="' + escAttr(v) + '"').join(' ') + '>' + (inner || '') + '</' + n + '>';
const rc = (x,y,w,h,fill,extra) => tg('rect', Object.assign({x:n2(x),y:n2(y),width:n2(w),height:n2(h),fill:fill}, extra||{}));
const ln = (x1,y1,x2,y2,st,sw,dash) => tg('line', {x1:n2(x1),y1:n2(y1),x2:n2(x2),y2:n2(y2),stroke:st,
        'stroke-width':sw,'stroke-dasharray':dash});
const ci = (cx,cy,r,fill,stroke,sw) => tg('circle', {cx:n2(cx),cy:n2(cy),r:n2(r),fill:fill,stroke:stroke,'stroke-width':sw});
const tx = (x,y,s,o) => {
  o = o || {};
  return tg('text', {x:n2(x), y:n2(y), 'font-size':o.size||11, 'font-weight':o.weight||400,
    fill:o.fill||'#1b1b19', 'text-anchor':o.anchor||'start',
    'font-family':FONT_STACK,
    transform:o.rotate}, esc(s));
};
const colX = (x0, col, colW) => x0 + col * colW;
/* SVG 里要内联字体族，导出后脱离本机也能保持等宽网格 */
const SVG_STYLE = '<style>text{font-family:' + FONT_STACK + '}' +
                  '.hl{pointer-events:none}</style>';

/* C 大调音级映射，用于轨道下方的简谱数字 */
const C_DEG = {0:'1',2:'2',4:'3',5:'4',7:'5',9:'6',11:'7'};
function degreeLabel(midi){
  const pc = ((midi % 12) + 12) % 12;
  if(C_DEG[pc] !== undefined) return C_DEG[pc];
  const lo = (pc + 11) % 12;
  return C_DEG[lo] !== undefined ? '#' + C_DEG[lo] : 'b' + C_DEG[(pc + 1) % 12];
}

/* 轨道底色（用户定稿）：深色 / 浅色两种，图例与本文件其它地方都引用这两个常量 */
const SHADE_DARK = '#e6e5de', SHADE_LIGHT = '#ffffff';
const COL_LINE = '#dcdbd3';                         // 轨道之间的细分隔线（要压得过深色底）

/* 深浅规则（唯一真源）：以中央键为起点向两侧交替，周期 3
   距中央 0 条 → 深色，1~2 条 → 浅色，3 条 → 深色，依此类推
   即「中间深，两边各两条浅，再往外一条深」，左右对称。
   谱面轨道和音位轴共用这一条规则 → 两处的深浅列严格一一对应。 */
const isShadeDark = (t, i) => Math.abs(i - t.center) % 3 === 0;

/* 轨道背景：整列铺满深浅底 */
function drawColumns(t, x0, yTop, yBot, colW, shade){
  let s = '';
  for(let i = 0; i < t.len; i++){
    const x = colX(x0, i, colW);
    s += rc(x, yTop, colW, yBot - yTop, (shade && isShadeDark(t, i)) ? SHADE_DARK : SHADE_LIGHT);
    s += ln(x, yTop, x, yBot, i === 0 ? '#c6c5bd' : COL_LINE, 1);
  }
  s += ln(x0 + t.len * colW, yTop, x0 + t.len * colW, yBot, '#c6c5bd', 1);
  return s;
}

/* 轨道下方的音位说明：音名（带八度点）+ 简谱数字
   底色与谱面轨道共用同一条深浅规则（isShadeDark）→ 音名一列一列正对着同名轨道，
   两处深浅严格对齐；shade 参数跟随「深色长条」开关，关掉时两边一起变白底。
   本曲没有用到的轨道，音名压灰以示区分 */
function drawAxis(t, x0, y0, colW, usedCols, shade){
  let s = '';
  const centerOct = t.notes[t.center].octave;
  const top = y0 - 9, bot = y0 + 47;
  for(let i = 0; i < t.len; i++){
    const x = colX(x0, i, colW), mid = x + colW / 2, nt = t.notes[i], on = usedCols.has(i);
    s += rc(x, top, colW, bot - top, (shade && isShadeDark(t, i)) ? SHADE_DARK : SHADE_LIGHT);
    s += ln(x, top, x, bot, i === 0 ? '#c6c5bd' : COL_LINE, 1);
    const rel = nt.octave - centerOct;
    for(let j = 1; j <= Math.abs(rel); j++){
      s += ci(mid, rel > 0 ? y0 + 6 - j * 4 : y0 + 43 + j * 4, 1.6, on ? '#6a6a64' : '#c0bfb9');
    }
    s += tx(mid, y0 + 21, nt.step, {size:11.5, weight:i === t.center ? 700 : 600,
            anchor:'middle', fill: on ? '#1b1b19' : '#b6b5af'});
    s += tx(mid, y0 + 34, degreeLabel(nt.midi), {size:9.5, anchor:'middle',
            fill: on ? '#7d7d77' : '#c3c2bc'});
  }
  s += ln(x0 + t.len * colW, top, x0 + t.len * colW, bot, '#c6c5bd', 1);
  return s;
}

/* 单个音符（用户定稿）：**一个正常音符逆时针转 90°**
   ① 符头：正圆，直径 = 行高 × NOTE_RATIO；
   ② 符干：与符头**正上方相切**的一根横线，**左端统一落在 stemX**（= 第 0 轨左缘再往左 STEM_OUT），
      所以右端贴着符头、左端全体对齐，长度随所在列变化；
   ③ 符尾：挂在符干左端、与符干**垂直**的短竖线（八分 1 条 / 十六分 2 条 / 三十二分 3 条），
      逐条向右错开 —— 与符干一起被转过来，不再是原来那两条斜线；
   ④ 附点：挪到符头左侧中部（符干在顶上，这块正好空着）；空心底 = 二分 / 全音符。
   beamed = 这个音已经和同一拍里的其他音**连成横梁**了（改由 planBeams 画），
   这时自己那几条符尾必须让位，否则符尾和横梁叠在一起。 */
function drawNote(it, cx, cy, colW, stemX, beamed){
  const dotted = isDotted(it.dur);
  const base   = dotted ? it.dur / 1.5 : it.dur;
  const flags  = flagCount(it.dur);
  const hollow = base >= 2;
  const color  = it.bad ? '#b1542a' : '#1b1b19';
  /* 符头：正圆，直径 = 行高 × NOTE_RATIO（当前 0.7 → 25×0.7 = 17.5，r = 8.75）。
     注意符干长度、符尾长度都**不跟着缩**（它们由列宽决定），
     所以符头变小后符干看起来会更长、更突出，这是刻意的。 */
  const r = RD.ROW_H / 2 * NOTE_RATIO;
  let s = '';
  if(hollow) s += ci(cx, cy, r, 'none', color, 1.7);
  else       s += ci(cx, cy, r, color, 'none', 0);
  /* 符干：与符头正上方相切，右端落在本列中线 cx、左端落在 stemX。
     圆在切线高度上只剩 x=cx 这一个点，所以符干的右端必须落在 cx ——
     若还按旧版从「符头左缘」起笔（cx-r），整条符干会悬在半空、碰不到符头。 */
  const stemY = cy - r, ex = stemX;
  s += ln(cx, stemY, ex, stemY, color, 1.5);
  /* 符尾：垂直于符干往下垂，逐条向右错开 */
  const fl = colW * 0.6, gap = Math.max(4, colW * 0.17);
  if(!beamed) for(let k = 0; k < flags; k++)
    s += ln(ex + k * gap, stemY, ex + k * gap, stemY + fl, color, 1.5);
  if(dotted) s += ci(cx - r - 4.5, cy, Math.max(1.7, colW * 0.075), color);
  if(it.bad) s += ci(cx, cy, r + 2.5, 'none', '#b1542a', 1);
  return s;
}

/* =====================================================================
   符尾连接：把五线谱**再转 90°** 的同一件事
   五线谱里同一拍内的八分及更短音符共用**横梁**；本谱的时间轴本来就是竖的
   （行 = 时间，从下往上读），所以横梁也跟着转成**竖梁**：一条竖线把这一组
   音符的符干左端串起来。符干左端本来就全体对齐在 stemX，竖梁天然落在这条线上。

   分组规则（与五线谱一致）：
   ① 分组单位是**拍**，由拍号决定 —— 简单拍子（2/4 3/4 4/4 2/2）一拍 = 一个四分音符，
      复合拍子（6/8 9/8 12/8）一拍 = 一个附点四分音符。于是 4/4 每拍连 2 个八分、
      6/8 每拍连 3 个八分：音符数一样，连法不同。
   ② 组内**相邻两音之间的梁数 = min(两条符尾数)**，画成一根整梁 —— 这一级就算有着落了。
   ③ **每个音符的每一级最多只画一条线**。某一级若在这个音符的**左右两侧都没有梁**
      （前后邻居的时值都比它长，等级不够），就补一条**短尾**补上：
        · 长度 = **min(半个行高, 到那个邻居的净距)**（净距 = 两根符干的距离 = 相隔行数 × 行高）
        · 方向**一律朝「时间上更晚的下一个音」** —— 在默认的自底向上视图里就是朝上；
          组内最后一个音没得朝后，才朝前一个音。
      于是：
        · [十六 八 十六] → 两个十六分各补一条，都朝中间的八分（一上、一下）✓
        · [八 十六 八]   → 中间的十六分**只补一条**，朝后（朝上边那个八分）✓
        · [八 十六 十六] → 第一个十六分的第二级已被「两个十六之间那条梁」占住，不再补 ✓
      （早先写的是「逐对补、两边都补」，[八 十六 八] 会把中间那个十六分的第二级
        上下各画一条。只在单侧有邻居时才看不出问题，所以一直没暴露。）
   ④ 同拍内被空隙（休止、或时值更长的音）隔开的音符各自成组，跨不过去。
   ⑤ 剩下孤零零一个音时不连，照旧挂单符尾（五线谱同理：没伴儿连不了）。
   ⑥ 和弦（同一行多个音）共用一根符干，所以按**行**折算成一个符干端点，不重复计数。

   返回 {beamed:Set(行号), beams:[{x,y1,y2,w,color}]} —— beams 里既有整根的梁，
   也有「露半行」的短尾（两者画法完全一样，只是 y2 短一截）。拆成「先算计划、后画梁」
   两步，是因为梁要压在符干之上、而且被连进梁里的音符必须放弃自己的单符尾。 */
function planBeams(rows, opt){
  const {up, yTop, colW, stemX} = opt;
  const unit = opt.unit, empty = {beamed:new Set(), beams:[]};
  if(!rows.length || !unit) return empty;
  const n = rows.length, yOf = k => yTop + (up ? (n - 1 - k) : k) * RD.ROW_H;
  const r0 = RD.ROW_H / 2 * NOTE_RATIO;
  const [N, D] = opt.meter || [4, 4];
  const beatQ = ((N > 3 && N % 3 === 0) ? 3 : 1) * (4 / D);   // 一拍 = 多少个四分音符
  /* ① 逐行折成一个「符干端点」：和弦共用符干，一行只算一次 */
  const ents = [];
  rows.forEach((row, k) => {
    const fls = row.items.map(it => flagCount(it.dur)).filter(f => f > 0);
    if(!fls.length) return;                     // 本行全是四分及更长，没有符尾可连
    ents.push({
      k, flags: Math.min.apply(null, fls),
      span: Math.max(1, Math.round(Math.max.apply(null,
              row.items.map(it => it.dur || unit)) / unit)),   // 这个音占几行
      y: yOf(k) + RD.ROW_H / 2 - r0,            // = 本行符干的 y
      bad: row.items.some(it => it.bad),
      beat: Math.floor(row.idx * unit / beatQ + 1e-9)
    });
  });
  const beamed = new Set(), beams = [];
  const gap = Math.max(4, colW * 0.17);
  /* ② 同拍 + 时间上紧挨着 → 同一组。碰到换拍、或中间空了行，就收一组 */
  let run = [];
  const flush = () => {
    if(run.length > 1){
      run.forEach(e => beamed.add(e.k));
      /* 第一趟：相邻两音之间，公共的那几级画**整根梁**（梁数 = min(两条符尾数)） */
      for(let i = 0; i + 1 < run.length; i++){
        const a = run[i], b = run[i + 1], lv = Math.min(a.flags, b.flags);
        const col = (a.bad || b.bad) ? '#b1542a' : '#1b1b19';
        for(let k = 0; k < lv; k++)             // 主梁稍粗，次级梁细一点
          beams.push({x: stemX + k * gap, y1: a.y, y2: b.y, w: k ? 1.6 : 2, color: col});
      }
      /* 第二趟：补短尾。判据是「这一级有没有人画」——某一级只要左右任一侧的梁覆盖到
         这个音符，就已经有着落；两侧都没有才补一条。这样**每个音符的每一级最多一条线**。
         方向一律朝「时间上更晚的下一个音」（默认自底向上视图里就是朝上）；
         组内最后一个音没有下一个，才朝前一个音。 */
      for(let i = 0; i < run.length; i++){
        const e = run[i], pv = run[i - 1], nx = run[i + 1], nb = nx || pv;
        if(!nb) continue;
        /* 前一根梁覆盖到第几级、后一根梁覆盖到第几级，取大的那个就是「已有落着的最高级」 */
        const covered = Math.max(pv ? Math.min(pv.flags, e.flags) : 0,
                                 nx ? Math.min(e.flags, nx.flags) : 0);
        const col = (e.bad || nb.bad) ? '#b1542a' : '#1b1b19';
        for(let k = covered; k < e.flags; k++){
          /* 短尾长度 = min(半个行高, 到邻居的净距)：净距是两根符干之间的距离。
             常规相隔 1 行时净距 25px、半个行高 12.5px，取小仍是 12.5 —— 即定稿的
             「露半个行高」；这条上限保证短尾**永远伸不到邻居跟前**（行距若被调小、
             或将来允许音符落在半行以内，它会自动收短，不会顶上去）。 */
          const stub = Math.min(RD.ROW_H / 2, Math.abs(nb.y - e.y));
          const dy = Math.sign(nb.y - e.y) * stub;
          beams.push({x: stemX + k * gap, y1: e.y, y2: e.y + dy, w: k ? 1.6 : 2, color: col});
        }
      }
    }
    run = [];
  };
  ents.sort((a, b) => a.k - b.k).forEach(e => {
    const p = run[run.length - 1];
    if(p && (e.beat !== p.beat || e.k > p.k + p.span)) flush();
    run.push(e);
  });
  flush();
  return {beamed, beams};
}

/* 一段连续的行（整谱连续模式下就是全部行；分页模式下是一页）
   opt.closing：本段末尾是否画收尾粗线（默认为“装不满一页才画”）
   opt.unit / opt.meter：符尾连接（planBeams）要靠它们判断「哪几个音属于同一拍」 */
function drawRows(rows, t, x0, colW, yTop, st, opt){
  const n = rows.length, gw = t.len * colW;
  const closing = opt && opt.closing !== undefined ? opt.closing : (n < RD.PANEL_ROWS);
  const up = st.direction === 'up';
  const yOf = k => yTop + (up ? (n - 1 - k) : k) * RD.ROW_H;
  /* 横线要画在「这一行的时间起点」那一侧：
       从上往下读 → 行的起点是上边线 yOf(k)
       从下往上读 → 行的起点是下边线 yOf(k) + ROW_H
     两者差一整行。画错的话，从下往上读时小节线会落进小节**内部**：
     第 0 行的上边线恰好紧贴第一个音符，看起来就像「第一个音被单独划成一节，
     后面的音符整体后挪了一拍」。 */
  const yLine = k => yOf(k) + (up ? RD.ROW_H : 0);
  let s = '';

  /* ① 行线、小节号、简谱对照 */
  for(let k = 0; k < n; k++){
    const row = rows[k], y = yOf(k), yl = yLine(k);
    if(row.isBarStart)       s += ln(x0, yl, x0 + gw, yl, '#1b1b19', 1.3);
    else if(row.isBeatStart) s += ln(x0, yl, x0 + gw, yl, 'rgba(27,27,25,0.16)', 1);
    else                     s += ln(x0, yl, x0 + gw, yl, 'rgba(27,27,25,0.07)', 0.7);
    /* 小节号贴着自己那条线，并落在**本小节之内**（从下往上读时小节在线的上方）。
       ★ 用户 2026-09-18：「小节序号用黑色且调大字号」——原来 11.5px 浅灰（#c3c2bc），
         打印缩到 50% 后只有 5.75px、还是一抹灰，纸上基本看不见。
         现在 14px 纯黑（HEAD_INK 同一个近黑）：纸上 7px ≈ 1.9mm，翻谱时一眼能找到小节。
       ⚠️ 字号一动，RD.RIGHT_OUT 就要跟着核：middle 锚在 x0+gw+9，
          14px 两位数半宽 ≈ 7.7 → 右缘 x0+gw+16.7 < RIGHT_OUT(22) 之内 ✓；
          三位数（100+ 小节）≈ 11.6 → 右缘 +20.6，仍在本栏内。 */
    if(row.isBarStart) s += tx(x0 + gw + 9, up ? yl - 6 : BASE_Y(yl, 4), String(row.measure + 1),
                              {size:14, weight:600, anchor:'middle', fill:HEAD_INK});
    /* noDeg：**打印 / 导出**时整块不画（用户 2026-09-18「打印时去掉简谱对照部分」）。
       ★ 只在输出通道收掉：屏幕上的分页预览仍按 st.optDegree 照画 ——
         用户要的是「纸上没有」，不是「预览里也没有」。 */
    if(st.optDegree && !(opt && opt.noDeg)){
      /* 简谱对照：主旋律深色、伴奏浅灰。**放在轨道右侧**（原来在网格左侧、右对齐）：
         符干统一往左伸到第 0 轨外之后，左侧那块地方被符干和符尾占满，
         简谱数字再留在那儿就会和符干叠字，所以整块搬到右边。
         两段改成**左对齐**（起点固定在 x0+gw+DEG_X），顺序也跟着镜像：
         主旋律贴网格、伴奏在它右边，两眼一扫还是「先主后伴」。 */
      const byV = {};
      row.items.forEach(it => (byV[it.voice] = byV[it.voice] || []).push(it.label));
      const cut = (str, mx) => str.length > mx ? str.slice(0, mx) + '…' : str;
      const main  = cut((byV[0] || []).join(' '), 6);
      const other = cut((byV[1] || []).join(' '), 5);
      const wOf = (str, sz) => str.length * sz * 0.62;
      const dx = x0 + gw + DEG_X;                  // 轨道右侧、让开小节号之后
      if(main){
        s += tx(dx, BASE_Y(y, 3), main, {size:10.5, anchor:'start', fill:'#4c4c47'});
        if(other) s += tx(dx + wOf(main, 10.5) + 6, BASE_Y(y, 3), other,
                          {size:9, anchor:'start', fill:'#b6b5af'});
      } else if(other){
        s += tx(dx, BASE_Y(y, 3), other, {size:9, anchor:'start', fill:'#b6b5af'});
      } else if(row.rest){
        s += tx(dx, BASE_Y(y, 3), '0', {size:10.5, anchor:'start', fill:'#c8c7c1'});
      }
    }
  }
  /* 收尾粗线画在「这一段的时间末端」：从下往上读时末端在上边 */
  if(closing) s += ln(x0, up ? yTop : yTop + n * RD.ROW_H,
                      x0 + gw, up ? yTop : yTop + n * RD.ROW_H, '#1b1b19', 1.3);

  /* ② 中央粗线：压在行线之上、音符之下，才不会被行线切成虚线 */
  s += ln(colX(x0, t.center, colW), yTop, colX(x0, t.center, colW), yTop + n * RD.ROW_H, '#1b1b19', 2);

  /* ③ 播放高亮层 + 音符。符尾连接的计划必须先算：被连进竖梁里的音要让位、不画单符尾。
     注意 beamed 里存的是**本页的局部行号 k**，不是 row.idx（全局行号）——
     第 0 页两者刚好相等，第 2 页起就全错位，症状是「梁画了、音符自己的符尾又画了一遍」。 */
  const bp = planBeams(rows, {up, yTop, colW, stemX: x0 - STEM_OUT,
                              unit: opt && opt.unit, meter: opt && opt.meter});
  for(let k = 0; k < n; k++){
    const row = rows[k], y = yOf(k);
    s += rc(x0, y, gw, RD.ROW_H, 'rgba(47,111,95,0.17)', {opacity:0, class:'hl', 'data-row':row.idx});
    row.items.forEach(it => { s += drawNote(it, colX(x0, it.col, colW) + colW/2, y + RD.ROW_H/2,
                                            colW, x0 - STEM_OUT, bp.beamed.has(k)); });
  }
  /* ④ 竖梁画在音符之后：压在符干之上，接点看不出来 */
  bp.beams.forEach(b => { s += ln(b.x, b.y1, b.x, b.y2, b.color, b.w); });
  return s;
}

/* 页眉里的「标题 / 卡林巴专用谱 / 从哪往哪读」一律加粗，统一走这一个字重。
   为什么写 700 而不是 650：本机字体栈里中文落在微软雅黑，它只有 Regular / Bold
   两个字面，所以 600 起就会被浏览器匹配到 Bold（实测 600 = 650 = 700，墨量完全相同）。
   但导出后的 SVG/PNG 可能被别的渲染器打开，部分实现只认 400 / 700 两档、
   见到 650 会退回常规字面 —— 用 700 才能在「屏幕预览 = 导出文件」两侧都稳。 */
const HEAD_BOLD = 700;
/* 同样这三处的墨色：跟正文同一个近黑（首页曲名本来就是它），续页原来是一整片浅灰，
   打印出来「标题」比谱面还淡、单张纸拿起来认不出是哪首，用户定稿要求一并压黑。 */
const HEAD_INK = '#1b1b19';
/* 注意 gy：本页顶部在「整张纸」里的 y。页眉里的每一个 y 都要写成 gy + 偏移，
   因为整页内容随后会被 <g transform="translate(0,-gy)"> 整体搬回原点 ——
   直接写 RD.PAD+22 的话，续页的页眉会被这层 transform 顶出页面（量到 y = -gy 附近），
   打印出来第 2 页起就只剩空白页眉带。 */
/* （原 sheetLabel() 已在 2026-09-18 的改版里删掉：纸号不再「多张才印」——
   照片上它和「（接上页）」并排常驻在页尾右侧，第 1 张也印「第 1 / N 张」。
   逻辑搬进 drawPageFoot，只剩那一处，不再需要独立函数。） */

/* =====================================================================
   页眉 / 页脚（用户 2026-09-18 按照片重排）
   一张纸现在分三段：
     ① 页眉带：**标题 + 作者**（原来是「曲名 + 两行谱面数据 + 键数说明」）
     ② 栏区　：双栏曲谱 ＋ 右侧信息栏（二维码 / 附加信息 / 读谱方向 / logo）
     ③ 页脚带：**曲谱信息**（左） ＋ **x键卡林巴专用谱**（正中最） ＋ **第 N / M 张**（右）
   ★ 为什么把谱面数据从页眉搬到页脚：照片上页眉只剩「标题 / 作者」两条 ——
     曲名与作者回答「这张纸是什么」，属于抬头；调号拍号速度回答「这张谱怎么读」，
     属于脚注。分开之后页眉不再挤两行小字，作者也有地方放。
   ★ 页眉带高度**没有变**（仍是 RD.PAD + HEAD_H = 114）：只换内容不换高度，
     否则每张纸的栏区起点会漂、分页点跟着变。
   ★ 三个函数共用同一个 geo 对象（由 renderScore 算好传进来，唯一真源）：
       geo.W        纸宽（= SHEET.PRINT_W）
       geo.gy       本张纸顶部在整张 svg 里的 y（页眉里每个 y 都要写成 gy + 偏移）
       geo.hl/hr    页眉带左右边界（纸面坐标）
       geo.fl/fr    页脚带的左右边界
       geo.yFoot    页脚基线 y
       geo.a        附加信息 {title, author, note, qr}
       geo.pi/total 张号（从 0 起）/ 总张数
       geo.print    是否打印版式（false = 屏幕上的连续预览，走老版式，逐像素不变） */
function drawPageHead(grid, t, st, geo){
  const {meta, unit, semis} = grid;
  const P = geo.gy + RD.PAD;                    // 本页页眉带的基准 y

  /* ---------- 连续预览：老版式（标题 + 两行谱面数据 + 键数） ---------- */
  if(!geo.print){
    const gridTok = '1/' + (4 / unit);          // 时间格 = 几分音符（4/4 下）
    const l1 = ['1=' + meta.keyName, meta.meter[0] + '/' + meta.meter[1], meta.tempo + ' BPM'];
    const l2 = ['最小格 ' + gridTok + ' 音符', '共 ' + grid.nMeasures + ' 小节'];
    if(semis) l2.push('已移调 ' + (semis > 0 ? '+' : '') + semis + ' 半音');
    let s = tx(RD.LEFT, P + 22, meta.title, {size:17, weight:HEAD_BOLD, fill:HEAD_INK});
    s += tx(RD.LEFT, P + 43, l1.join('   ·   '), {size:12, fill:'#8b8b85'});
    s += tx(RD.LEFT, P + 58, l2.join('   ·   '), {size:12, fill:'#8b8b85'});
    s += tx(geo.W - RD.RIGHT, P + 22, t.len + '键卡林巴专用谱',
            {size:11, anchor:'end', fill:HEAD_INK, weight:HEAD_BOLD});
    s += ln(RD.LEFT, P + 74, geo.W - RD.RIGHT, P + 74, '#eeede8', 1);
    return s;
  }

  /* ---------- 打印 / 导出：只有标题 + 作者 ---------- */
  /* 标题走 attachVals().title（没填就回落到谱面里的曲名 —— 由 attachVals 侧统一决定，
     这里不再自己判断，免得两处口径漂）。 */
  const title = (geo.a && geo.a.title) || meta.title;
  /* ★ 首页 17px / 续页（运行页眉）**13px**：续张字号小一号让位给内容，且与首页标题同一基线（翻页不跳）。
     ⚠️ 别写死成 17 —— 这一行被两支探针同时盯着（sheet 的「运行页眉 13px」+ head 的「续页标题字号」）。 */
  let s = tx(geo.hl, P + 22, title,
             {size: geo.pi === 0 ? 17 : 13, weight:HEAD_BOLD, fill:HEAD_INK});
  /* 作者：空就不占位（照片上「作者」是一条实打实的横条，没填就整行不出）。
     ⚠️ 但**页眉带高度不动**，所以标题下面空不空，栏区起点都一样。 */
  const au = (geo.a && geo.a.author) || '';
  if(au) s += tx(geo.hl, P + 45, au, {size:12, fill:'#8b8b85'});
  s += ln(geo.hl, P + 74, geo.hr, P + 74, '#eeede8', 1);
  return s;
}

/* 页脚带：左「曲谱信息」/ 中「x键卡林巴专用谱」/ 右「第 N / M 张」，**每张纸都印**。
   ★ 曲谱信息从页眉搬过来时**从两行压成一行**：FOOT_H 只有 30px，
     两行 11px 文字（行距 ~14）会把页脚带撑破、进而顶溢页。
   ★ 三样都不再带「点在哪根长条就弹哪根」—— 用户 2026-09-18 明确去掉这条提示。
     读谱方向也不在这里：它搬进了右侧信息栏（见 drawSidebar）。
   ★ 三样锚的是**纸**（geo.fl / fc / fr = 纸左轨 / 纸面正中 / 可印区右缘），
     **不跟曲谱动** —— 用户 2026-09-18 最终口径：
       「页尾不跟曲谱动」 + 「页眉也钉住」→ 页眉页脚是纸张家具，曲谱自己动。
     三个数是用户逐个点过的：曲谱信息 19.5、键数 351.5、页码右端 691。
     （中间那段为什么是 351.5 而不是左右两段的中点：后者会随左边那串数据的长度
       左右晃，逐张看会以为页码在自己动。锚纸面正中就永远不动。）
   ⚠️ 上一轮我一度把它改成锚「曲谱墨迹框」，理由是「页尾不会跟着曲谱动」——
     那条理解是**错的**，别再改回去。曲谱的横向位置会因单栏居中 / 侧栏自适应 / 21 键
     而变，页脚跟着变就会逐张横跳。详见 renderScore 里 hdrL/footL 那一段的推演。 */
function drawPageFoot(grid, t, st, geo){
  const {meta, semis} = grid;
  const y = geo.yFoot;
  /* ================= 左段「曲谱信息」的横向预算（数全是实测的，别改回去估） =================
     字号 11px、本机字体栈（`ui-monospace, …, "Microsoft YaHei", sans-serif`）下实测字宽：
     **CJK ≈ 13px/字，半角 ≈ 7px/字**。

     可用宽度是**硬**的：中段钉在纸面正中（351.5）、左段钉在纸左轨（19.5），
     两者都是用户定死的位置，所以左段最多只能占
         351.5 − 45.05（中段半个字宽）− 19.5 = **286.95px**。
     中段那件「x键卡林巴专用谱」实测 90.1px，占 306.45 … 396.55。

     ① 「最小格 1/x 音符」**没有**放进这一行 —— 不是漏了，是**放不下**：
        含最小格 + 移调（+ 共 2 小节）实测 **379.9px** → 右端 399.4，直接压上中段。
        剔掉它才把左段压回预算内。
     ② 「共 N 小节」在**带移调时让位**（用户 2026-09-18 定夺）：
        不带移调 184.2px（余量 103.2px，宽裕）；
        带移调 **282.5px**（余量只剩 **4.9px** —— 纸样上「半音」和「17键」连成一个词，
        照过纸确认是真缺陷，不是「数字紧但还能看」）；
        让位后 **207.2px**（余量 **80.2px**）。
        挤掉哪一项的判据：「已移调」不能摘（移调量直接决定按哪根条，演奏必需），
        小节数是参考信息、翻页需求页码已覆盖 → 摘它（省约 75px）。
     ⚠️ 旧注释里写的「带移调 276.5px → 留 10px 余量」「预算 ≤ 280px」**都是估的、且偏乐观**：
        真值分别是最坏 282.5px / 余量 4.9px。别再按旧数字推。
     ⚠️ 也别想靠「收窄分隔符」省地方：SVG 默认 `xml:space="default"` 会折叠连续空白，
        `'  ·  '` 与 `' ·  '` 渲染**逐像素相同**（实测两串都 282.53px、差 0.00）——
        那条路是 no-op。省地方只能减内容或减字号（字号 11 是用户特意调大的，不动）。 */
  const l1 = ['1=' + meta.keyName, meta.meter[0] + '/' + meta.meter[1], meta.tempo + ' BPM'];
  if(semis) l1.push('已移调 ' + (semis > 0 ? '+' : '') + semis + ' 半音');
  else      l1.push('共 ' + grid.nMeasures + ' 小节');
  let s = tx(geo.fl, y, l1.join('  ·  '), {size:11, fill:'#8b8b85'});
  s += tx(geo.fc, y, t.len + '键卡林巴专用谱',
          {size:11, anchor:'middle', fill:'#8b8b85'});
  /* 承上标记与纸号并排（照片上就是「（接上页）第 1 / 4 张」这样连写的）。
     第 1 张不写「（接上张）」—— 没有上一张可接。
     ★ 锚点从 geo.fr（可印区右缘）**再退回 SHEET.INK_OVER**：end 锚只保证字宽盒贴齐右缘，
       而末字「张」的墨迹比字宽盒宽 1px（实测，见 SHEET.INK_OVER 的标定表）。
       退回这 1px 之后，**墨迹**正好落在可印区右缘上 —— 于是 foot 探针那条
       「右段右端不越出可印区」可以保持**严格判据**（不靠放宽容差蒙过去）。
       ⚠️ geo.fr 就是可印区右缘，与页眉分隔线的右端（geo.hr）**是两件事**：
          后者要躲右侧信息栏、会随侧栏宽度变；这里一律钉在 691。 */
  s += tx(geo.fr - SHEET.INK_OVER, y,
          (geo.pi > 0 ? '（接上张）　' : '') + '第 ' + (geo.pi + 1) + ' / ' + geo.total + ' 张',
          {size:11, anchor:'end', fill:'#a9a8a2'});
  return s;
}

/* ---------- 右侧信息栏（用户 2026-09-18 定稿）----------
   照片上的两栏都是从上到下：二维码 → 附加信息 → 读谱方向 → logo。
   ★ 二维码与附加信息**可选**（没填就没有），读谱方向与 logo 常驻。
   ★ 排版是「上贴顶、下贴底、中间那份吃剩下的」：二维码钉在栏顶，
     读谱方向 + logo 钉在栏底 —— 照片里左右两版的 logo 底边在同一高度，
     说明底部这一组是**对齐栏底**的，不是从上往下顺排下来的。
     于是「附加信息」拿到的是夹在中间的那段；低于 46px 就整块不画 ——
     宁可不显示，也不画一个把文字压成一条线的假框。 */
function drawSidebar(st, sb){
  const {x, y, w, h} = sb, pad = 7, gap = 8, LINE = '#dcdbd3';
  let s = '', cur = y;
  /* ① 二维码：正方形、铺满栏宽（白底 + 细边框，纸上才不会和曲谱糊在一起）。
     ★ 先画后判：qrInk 画不出来时返回**空串**（链接超容量 / 方块小于 8px），
       这时**不能**留下那个白底方框 —— 否则纸上是一个什么都不含的白方块。
       （正常路径下 attachForPrint() 已经把「画不出来的链接」挡掉了，
         这里是第二道防线：让「有没有内容」和「画不画框」永远同进同退。
         `cur` 不推进 —— 没占地方，下面的附加信息自然可以往上顶、拿到更多高度。） */
  if(sb.qr){
    const ink = qrInk(sb.qr, x + pad, cur + pad, w - pad * 2);
    if(ink){
      s += rc(x, cur, w, w, '#fff', {stroke:LINE, 'stroke-width':1, rx:4});
      s += ink;
      cur += w + gap;
    }
  }
  const logoH = 30, dirH = 92;
  const logoY = y + h - logoH;
  const dirY  = logoY - gap - dirH;
  /* ② 附加信息：竖排、多列从左往右（用户定稿「垂直、从左至右」） */
  if(sb.note && cur + 46 <= dirY - gap){
    const nh = dirY - gap - cur;
    s += rc(x, cur, w, nh, '#fff', {stroke:LINE, 'stroke-width':1, rx:4});
    s += vText(sb.note, x + w / 2, cur + 13, {
      size: 10.5,
      rows: Math.max(1, Math.floor((nh - 16) / 12.2)),
      cols: Math.max(1, Math.floor((w - 12) / 11.8)),
      fill: '#6a6a64'
    });
  }
  /* ③ 读谱方向：竖排四个字 + 一个指向「时间前进方向」的箭头。
     箭头必须跟着实际方向翻 ——「从下往上读」时时间往上走，箭头就朝上。
     用户 2026-09-18：「右下角的读谱方向按实际变更」。 */
  s += vText('读谱方向', x + w / 2, dirY + 11, {size:10.5, rows:4, cols:1, fill:'#8b8b85'});
  const ax = x + w / 2, up = st.direction === 'up';
  s += ln(ax, dirY + 60, ax, dirY + dirH - 4, '#1b1b19', 1.4);
  s += tg('path', {d:'M' + n2(ax) + ' ' + n2(up ? dirY + 60 : dirY + dirH - 4) +
                     'l-3.4 ' + (up ? 4.8 : -4.8) + 'h6.8z', fill:'#1b1b19'});
  /* ④ logo 占位：虚线框 + 淡字 —— 用户「logo部分留个空位，以后再做」。
     画成虚线而不是实线，是为了跟真内容（附加信息框）区分开：
     一眼能看出「这里还没做」，不会误以为是排错版了。 */
  s += rc(x, logoY, w, logoH, 'none',
          {stroke:'#e2e1db', 'stroke-width':1, 'stroke-dasharray':'3 3', rx:4});
  s += tx(x + w / 2, logoY + logoH / 2 + 3.5, 'logo',
          {size:10, anchor:'middle', fill:'#c3c2bc'});
  return s;
}

/* 竖排文字：字符自上而下堆叠，一列排满后**往右**接下一列。
   ★ 用户 2026-09-18 明确「垂直、从左至右」—— 传统中文竖排是从右往左接列，
     要的是相反那种，所以**不能**用 writing-mode:vertical-rl（它正是从右往左）。
     手写每一格的位置，方向、行高、截断全在自己手里，也免了导出 .svg 时
     writing-mode 在各渲染器上不一致的麻烦。
   ★★ 2026-09-22 两个修正（用户报「21 键换 3 行、17 键换 4 行就跑到框外」）：
     ① **整块按实际列数居中**。旧写法每列 x = `cx + col*cw`，是从**框的正中**起
        只往右接列 —— 所有列只用掉框的右半边，列一多必然甩出框外；
        而且**即使不越界也是偏右的**（21 键 3 列时：右边只剩 2.7px、左边空 25.8px）。
        实测（17 键 + 二维码，框宽 96）：旧写法 4 列刚好、第 5 列越界 +4.8px；
        居中后 7 列都装得下，左右内缩各 24.5px。
     ② **装不下就补省略号**，且判据看**落位结果**而不是字数。旧写法是
        「字数 > rows×cols 就截断 + 补 '…'」，可换行符不占字数却要占列 ——
        于是「字数没超、列已经超」时**静默丢字且不显示省略号**
        （实测 21 键 6 段：输入 18 字、画出 12 字、无 '…'，用户只会以为程序吃字）。 */
function vText(str, cx, yTop, o){
  o = o || {};
  const size = o.size || 10.5, lh = size * 1.16, cw = size * 1.12;
  const rows = Math.max(1, o.rows || 999), cols = Math.max(1, o.cols || 999);
  const all = Array.from(String(str));
  /* 落位：单趟走完，记下每个字属于哪列哪行；装不下的记「丢过东西」。
     ⚠️ 别把它拆成「先算一遍、再画一遍」两趟 —— 步进逻辑写两遍必然漂移。 */
  const placed = [];
  let row = 0, col = 0, dropped = false;
  all.forEach(ch => {
    if(ch === '\n' || ch === '\r'){ col++; row = 0; return; }
    if(row >= rows){ col++; row = 0; }
    if(col >= cols){ dropped = true; return; }   // 真装不下：丢掉，但下面会补省略号
    placed.push({ch: ch, col: col, row: row});
    row++;
  });
  if(dropped && placed.length) placed[placed.length - 1].ch = '…';
  /* ★ 居中按**实际画出来的列数** used，不是按容量 cols：
     按 cols 居中，三列的文字会被当成七列那样摆，整体左移一大截、还从**左边**顶出框
     （写这版时先踩到了：21 键 6 段时左越界 +3.7px）。 */
  let used = 1;
  placed.forEach(p => { if(p.col + 1 > used) used = p.col + 1; });
  const x0 = cx - (used - 1) * cw / 2;
  return placed.map(p => tx(x0 + p.col * cw, yTop + p.row * lh, p.ch,
                            {size:size, fill:o.fill, anchor:'middle'})).join('');
}

/* 矩阵 → 深色格拼成的 path.d + 含静区的边长 n。**全工程唯一一份实现**：
   界面侧栏（qrSvg）与纸面信息栏（qrInk）都调它，两条通道因此**结构上不可能漂**。
   ★ 为什么非要抽出来（而不是两边各写一份 + 注释提醒）：静区格数（q=4）与格子写法
     （`h1v1h-1z`）是二维码正确性的要害，改的时候只会改到"手上那一份"，
     另一份静默漂移；更糟的是**探针各看自己那条通道，两边都会是绿的**。
     这和音频那条「两条路径调同一个签名」是同一个理由。
   静区 4 格是规范值 —— 不够时扫码器找不到边界。 */
function qrPathD(link){
  const r = (typeof KAL_QR !== 'undefined') ? KAL_QR.encode(link) : null;
  if(!r) return null;
  const q = 4, n = r.size + q * 2;
  let d = '';
  for(let iy = 0; iy < r.size; iy++)
    for(let ix = 0; ix < r.size; ix++)
      if(r.modules[iy][ix]) d += 'M' + (ix + q) + ' ' + (iy + q) + 'h1v1h-1z';
  return {d:d, n:n};
}

/* 把二维码矩阵画进给定的纸面方块（纸面通道）。
   为什么输出**内联 <g>** 而不是像 qrSvg 那样输出嵌套 <svg>：
   嵌套 svg 在部分导出 / 打印管线里会被当外部图像丢掉，直接画 path 最稳。
   矩阵为空（链接不合法 / 超过 v10 容量）时返回 ''。 */
function qrInk(link, x, y, px){
  const m = qrPathD(link);
  if(!m || px <= 8) return '';
  const k = px / m.n;
  return tg('g', {transform:'translate(' + n2(x) + ',' + n2(y) + ') scale(' + n2(k) + ')'},
    tg('rect', {width:m.n, height:m.n, fill:'#fff'}) +
    tg('path', {d:m.d, fill:'#1b1b19', 'shape-rendering':'crispEdges'}));
}

/* 打印版式要用的附加信息。**唯一入口是 attachVals() / attachLinkUrl()**
   （见 s-ui 里那条注释：别另存一份状态，双份一定会漂）。
   s-render 比 s-ui 先执行，但 renderScore 只在运行时被调用，那时两个函数都已就位；
   仍然加 typeof 兜底 —— 免得将来有人在脚本加载中途调一次渲染就整页白屏。 */
function attachForPrint(){
  let v = {title:'', author:'', note:'', link:''};
  if(typeof attachVals === 'function'){ try { v = attachVals(); } catch(e){} }
  let qr = '';
  if(v.link && typeof attachLinkUrl === 'function'){ try { qr = attachLinkUrl(); } catch(e){ qr = ''; } }
  /* ★ 「链接语法合法」≠「二维码画得出来」。
     链接超过容量上限（byte 模式 / EC-M / v10 = 213 字节）时 qrPathD() 返回 null，
     而 qrInk() 是**静默返回空串**的 —— 可 drawSidebar 已经按「有二维码」画了白底方框、
     还占掉 96px 栏宽（标题与作者陪着往左让）。纸上于是出现一个**什么都不含的白方块**。
     界面侧 attachQR() 的口径是「画不出来就整块隐藏」，这里**必须与它一致**，
     否则同一个链接屏幕上没有、纸上一个空格子。
     代价：每次渲染多算一次 encode（实测约 3ms，渲染本身走 180ms 防抖，可忽略）。
     ⚠️ 别把这条判据挪进 drawSidebar —— 那样栏宽在 renderScore 里已经按 96 定过了，
        再改就来不及，还会让「侧栏宽度算式」和「画什么」两处口径分家。 */
  if(qr && !qrPathD(qr)) qr = '';
  return {title: v.title || '', author: v.author || '', note: v.note || '', qr: qr};
}

/* 排版到第几行（末尾多余的行不参与分页）：
   ① 先找到最后一个「有音符 / 休止」的行，再加上这个音自身时值占的行数
      —— 结尾的二分音符要留出它的时值空间；
   ② 再向上对齐到**小节边界**。这一步不能省：截在小节中间的话，最后一小节会比
      别的小节矮一截，小节线间隔忽大忽小，看着就像「小节划分错了」。
   分页与「分成几页」提示共用它，两处口径必须一致。 */
function layoutRowCount(rows, unit, perMeasure){
  let last = 1;
  rows.forEach((r, i) => {
    if(!r.items.length && !r.rest) return;
    let span = 1;
    r.items.forEach(it => { span = Math.max(span, Math.round((it.dur || unit) / unit)); });
    last = Math.max(last, i + span);
  });
  last = Math.min(last, rows.length);
  if(perMeasure > 1) last = Math.ceil(last / perMeasure) * perMeasure;
  return Math.max(1, Math.min(rows.length, last));
}

/* 打印 / 导出的密度：轨道行高与列宽都缩到 50%，一张**竖向 A4** 上排成**双栏流**
   —— 用户两轮定稿：
     ① 「竖向 A4，空的部分接着连续放曲谱。左边第一列放满后，放右边第二列。」
     ② 「第一列曲谱不被阻断……中间不要断要连续，没位置后转到右边第二列继续，
        音名在下端标一次，每列标一次。不要再在曲谱左上角标注页码。」
   于是本轮相对上一版的关键改动：**一栏 = 一段连续的行**。
       左栏 从栏顶/栏底连续排满 ➜ 排不下才换右栏 ➜ 两栏满 ➜ 下一张纸
   上一版是「一栏里再堆 2 段、每段各带一个音位轴 + 左上角页码」——那正是用户看到的
   「还是 2×2」：一栏里明明有两截、两个轴、两个页码。现在每栏**只有一段**、
   **只画一个音位轴**、**没有段页码**（纸号一律报在页眉里）。
   实现上仍然**不改 RD、不改任何绘制函数**，把每一栏整块套一层
   <g transform="translate(ox,oy) scale(z)">：符尾连梁、音符字形、小节线
   都在栏自己的坐标系里照旧算，缩放交给浏览器。于是
     ① 代码里仍然是行高 25 / 列宽 28，只是显示成 12.5 / 14；
     ② 「符尾连接」逻辑零改动（用户明确要求）—— 栏内行是连续的，梁照常在拍内成组；
     ③ 页眉画在缩放组**之外** → 仍是全尺寸、可读；
     ④ 栏**没有外框**（用户点名去掉）—— 分隔靠留白，不靠线。
   音位轴的位置**跟随读谱方向**（用户定稿「上端或下端出现一次，跟随设定」）：
     从下往上读 → 轴在栏的**下端**（读者从轴那一端起读）
     从上往下读 → 轴在栏的**上端**
   纵向预算（z = 0.5，行高 25，unit=0.5 的 4/4 曲子里一小节 = 8 行）：
     页眉 18+74 = 92  →  栏顶留 4  →  行区 n×25×0.5  →  轴距 20×0.5 = 10  →  轴 56×0.5 = 28
     A4 可用高 1031.8，减去页眉 96 与纸底 8 → 栏高 927.8 → 最多 n = 71 行；
     再向下对齐小节 → **64 行/栏**（= 8 小节），一张纸 = 2 栏 = 128 行。
     纸高 = 96 + (64×25+20+56)×0.5 + 8 = 942px ≤ 1031.8 ✓
   横向：一栏缩后 = (62+108+17×28)×0.5 = 323px（21 键 347.5），两栏 + 栏距 ≤ 703px。 */
const PRINT_ZOOM = 0.5;
const SHEET = {
  COLS: 2,                        // 一张纸横排 2 栏（左栏满了接右栏）
  BOT_PAD: 8,                     // 纸底留白
  /* 页脚带宽（用户 2026-09-17：把「点哪根 / 读谱方向 / 页码」从页眉搬到页尾）。
     ★ 它**必须**同时从 rowsPerCol 的 avail 里扣掉，否则谱面还按原高度排满，
       页脚再压下来就把纸顶成溢页，而不是「自动少排一行」。
     ★ 30px 是算过的：扣掉后 fit = 68，任何谱的 rpc ≤ 68 → 纸高 ≤ 96+888+30+8 = 1022
       ≤ PRINT_H(1031.8)，任何情况下都不会溢页。 */
  FOOT_H: 30,
  TOP_GAP: 4,                     // 页眉分隔线到栏区顶的距离
  COL_GUT_MAX: 24,                // 两栏之间（A4 可印宽内自适应）
  COL_GUT_MIN: 8,                 // 要腾地方给右侧信息栏时，栏距最多压到这里
  PRINT_W: 703,                   // A4 去 12mm 边距的可印宽
  PRINT_H: 1031.8,                // A4 去 12mm 边距的可印高
  /* ---------- 右侧信息栏（用户 2026-09-18 定稿，见 drawSidebar）----------
     宽度是**算出来的**，不是定值：A4 可印宽先减掉两栏曲谱与栏距，剩多少给多少，
     再夹到 [SIDE_MIN, SIDE_WANT.*]。用户定稿的取舍顺序是
     「两栏曲谱的间隙收窄一点 ＋ 侧栏自动收窄」—— 曲谱尺寸不动，只动间隙与侧栏。
       · SIDE_WANT.qr    有二维码 → 96（21 键时只放得下 ~64，二维码约 13mm，仍可扫）
       · SIDE_WANT.note  只有附加信息 → 76（竖排文字，不需要二维码那么宽）
       · SIDE_WANT.plain 都没有 → 58（只放「读谱方向 + logo」两样常驻内容）
     ★ 窄到 SIDE_MIN 以下就不画侧栏了 —— 与其塞一条挤成纸片的栏，不如把空间还给曲谱。
       什么时候会触发：**分页预览 + 简谱对照打开**时（那块地方被简谱对照占了）。 */
  SIDE_GAP: 10,
  SIDE_MIN: 52,
  SIDE_WANT: {qr: 96, note: 76, plain: 58},
  EDGE: 12,                       // 侧栏右缘到可印区右边的留白
  /* ---------- 纸左轨（用户 2026-09-18 定稿）----------
     ★ 页眉的标题 / 作者 / 分隔线左端、页脚那一条的左端，**都钉在这一条竖线上**，
       从此**不随曲谱动**。用户两条反馈合起来就是这条规则：
         「页尾不跟曲谱动」 + 「页眉也钉住」——
       曲谱自己可以居中（只有一栏的短曲）或被自适应右推（侧栏窄的时候），
       但页眉页脚是**纸张家具**，一格都不许跟着跑。
     ★ 取值 19.5 = 「无附加信息 · 17 键」时曲谱区的左缘（也就是那一版的 ox0）。
       挑这个数是为了把**最常见的那一版逐像素冻结**下来：钉住之后，无附加信息那一版的
       页眉页脚与改动前完全一致，只有原先会漂的几种（加二维码 / 21 键 / 单栏短曲）
       才回到这条轨道上来。
     ⚠️ 它是**冻结值**，不是从曲谱几何推出来的 —— 曲谱宽度常量变了它也不跟着变，
        这正是「家具不跟曲谱」的意思。别哪天顺手把它改回 ox0。 */
  RAIL_L: 19.5,
  /* ---------- 字形墨迹外扩（右对齐文字专用）----------
     ★ 为什么需要它：SVG 里 text-anchor="end" 只保证**字宽盒（em）**的右端落在锚点上，
       CJK 字形的**墨迹**可以比字宽盒还宽 —— 于是「锚点 = 可印区右缘」时，
       最后一个字的墨迹会探出可印区一点点。

     ★ 实测（11px、本机字体栈 FONT_STACK，一次同锚点不同内容的标定）：
         内容                  锚点   getBBox 右端      Δ      字宽盒  墨迹
         "1/3" "1" "ABC"       300    300.000        0.000   ——     ——
         "张"                  300    301.000       +1.000   11   13
         "17键卡林巴专用谱"      300    300.986       +0.986   89.1 90.1
         "共 80 小节"           300    300.000        0.000   57.2 58.2
       → 外扩量由**最后一个字的字形**决定（ASCII 为 0，`张` 为 1），与锚点位置无关。

     ★ 所以：把 SHEET.EDGE 从 12 调到 13 是**治不好**的 —— 锚点挪多少，墨迹跟着挪多少，
       Δ 恒为 +1。正确做法是给右对齐的锚点留出这一截（见 drawPageFoot）。

     ★ 页脚右段恒以「张」结尾（第 N / M 张），故取 1px。哪天字体栈换了、
       某个字的字面更宽，foot 探针那条「右段右端不越出可印区」会立刻打红 —— 这是**故意**的。 */
  INK_OVER: 1
};
/* 行区与音位轴的间距（原来写死在 drawAxis 调用处） */
const AXIS_GAP = 20;

/* 一栏装多少行 = 「栏高 ÷ 行高」，再**向下对齐到小节边界**。
   为什么必须对齐小节：栏尾把一个 8 行的小节劈成两半（7 行留在本栏、1 行丢到下一栏）
   在谱面上看起来就是个错误 —— 下一栏顶上孤零零一行、梁也被切断。
   老代码的 32 行其实也是这么来的（unit=0.5 的 4/4 里 32 = 4 小节），只是写死了；
   现在改成按纸张反推，于是「栏装满」这件事自动跟随 PRINT_ZOOM / AXIS_H / 纸张尺寸。
   写成函数而不是硬编码：打印、导出、状态栏文案共用这一个口径
   （三处若各算一次，迟早会对不上 —— 上一版就在这里踩过）。 */
function rowsPerCol(rpm){
  /* ⚠️ 页脚带（FOOT_H）也要扣掉 —— 见 SHEET.FOOT_H 的注释。少扣这一项，页脚会顶成溢页。 */
  const avail = SHEET.PRINT_H - (RD.PAD + 74 + SHEET.TOP_GAP) - SHEET.FOOT_H - SHEET.BOT_PAD;
  const fit = Math.floor((avail / PRINT_ZOOM - AXIS_GAP - RD.AXIS_H) / RD.ROW_H);
  const m = Math.max(1, rpm || (ST.grid && ST.grid.rowsPerMeasure) || 1);
  return Math.max(1, m > fit ? fit : Math.floor(fit / m) * m);
}

/* 主渲染
   opt.paged = true  → 按 rowsPerCol() 行切**栏**（一栏 = 一段连续的行），
                       再把栏按**双栏流**（左栏满了接右栏）拼到「一张竖向 A4」上
                       （导出 SVG/PNG / 打印 / 分页预览共用这一份）
   opt.paged = false → 整谱连成一整张、100% 尺寸（屏幕连续预览用）。
                       连续预览不需要跟纸张打交道，保持原来的大图更好核对细节，
                       所以 50% 密度只作用在 paged 上。
   opt.split = true  → 每张纸单独出一张 SVG（返回 pages[]），供分页视图 / 打印用；
                       不传则把所有纸竖着叠成一整张 SVG（返回 svg 字符串），供 SVG/PNG 导出。
   opt.forOutput = true → 这次渲染是给「纸 / 文件」的（真打印、导出 SVG / PNG），不是屏幕。
                       唯一的作用是**收掉简谱对照**（用户 2026-09-18「打印时去掉简谱对照部分」，
                       并明确「屏幕上的分页预览仍要保留」）。见下面 deg 的注释。
   两种模式的**纸内内容是同一份**，所以屏幕上核对分页位置 = 打印出来的样子
   （唯一例外就是简谱对照：它只在纸上消失，屏幕预览照旧）。 */
function renderScore(grid, t, st, opt){
  const paged = !!(opt && opt.paged);
  const split = !!(opt && opt.split);
  const forOutput = !!(opt && opt.forOutput);
  const colW = CW(t.len), x0 = RD.LEFT;
  const Wfull = RD.LEFT + RD.RIGHT + t.len * colW;      // 100% 时一张谱的宽（连续预览用）
  /* 栏 = 一段连续的行。连续预览只有 1 栏；paged 时每 rowsPerCol 行一栏 */
  const rpc = rowsPerCol(grid.rowsPerMeasure);
  const panels = [];
  if(paged){
    const end = layoutRowCount(grid.rows, grid.unit, grid.rowsPerMeasure);
    for(let i = 0; i < end; i += rpc){
      panels.push(grid.rows.slice(i, Math.min(i + rpc, end)));
    }
  } else {
    panels.push(grid.rows.slice());          // 连续模式：全部行一栏
  }
  if(!panels.length) panels.push([]);

  /* ---------- 连续预览：单段、100%（排版与老版本逐像素一致） ---------- */
  if(!paged){
    const n = panels[0].length;
    const yTop = RD.PAD + RD.HEAD_H, yBot = yTop + n * RD.ROW_H;
    const h = yBot + 14 + RD.PAD;
    let inner = drawPageHead(grid, t, st,
                             {W: Wfull, gy: 0, hl: RD.LEFT, hr: Wfull - RD.RIGHT,
                              a: null, print: false, pi: 0, total: 1});
    inner += drawColumns(t, x0, yTop, yBot, colW, st.optMark);
    inner += drawRows(panels[0], t, x0, colW, yTop, st,
                      {closing: true, unit: grid.unit, meter: grid.meta.meter});
    setLastGeom({panels: [{yTop, yBot, startIdx: 0, n, g0: 0, h,
                          gx0: x0, colWz: colW, rowHz: RD.ROW_H,
                          ox: 0, oy: 0, z: 1, w: Wfull, panelH: h}],
                colW, x0, W: Wfull, H: h, single: false});   // 连续预览没有「单栏居中 / 序号」那套
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wfull + ' ' + h +
                '" width="' + Wfull + '" height="' + h + '">' + SVG_STYLE + inner + '</svg>';
    return {svg, width: Wfull, height: h};
  }

  /* ---------- 打印 / 导出：50% 密度 + 竖向 A4 双栏流 + 右侧信息栏 ---------- */
  const z = PRINT_ZOOM;
  const a = attachForPrint();
  /* ★ 简谱对照**在屏幕上要留位置、在纸上不留**（用户 2026-09-18）。
     它占的右侧带宽和「右侧信息栏」是**同一块地方**，两者天然互斥：
       · 真打印 / 真导出（forOutput）→ 不画简谱对照，右留白收到 RIGHT_OUT，腾给信息栏；
       · 屏幕分页预览且开着简谱对照 → 仍按 RIGHT 排，信息栏自动让位（见下面的 SIDE_MIN 判定）。
     这就是用户那句「只在真正打印/导出时去掉」的落点：预览还是老样子，纸上才是新版式。 */
  const deg = !!(st.optDegree && !forOutput);
  const WfullP = RD.LEFT + (deg ? RD.RIGHT : RD.RIGHT_OUT) + t.len * colW;
  const zW = WfullP * z;                                // 一栏缩放后的宽
  /* 一栏本体（100% 坐标）：行区 + 行区与轴之间的间距 + 音位轴。
     这里的 rowsH 是**满栏**行区高，只用来定**纸张高度**；每栏实际用多高见循环里的 `rh`
     —— 末栏不满时栏本体要跟着收短，否则音位轴会被甩到纸底（用户报的那个图）。 */
  const rowsH  = rpc * RD.ROW_H;                        // 满栏行区高
  const localH = rowsH + AXIS_GAP + RD.AXIS_H;          // 满栏本体高
  const panelH = localH * z;                            // 满栏本体缩放后的高
  /* 音位轴在**读谱起点**那一端：从下往上读 → 轴在下端；从上往下读 → 轴在上端。
     drawAxis 的笔迹是 y0−9 … y0+47（正好 AXIS_H = 56），所以：
       轴在下端 → y0 = rh + AXIS_GAP，行区从 0 起；
       轴在上端 → y0 = 9（笔迹刚好贴住栏顶），行区从 AXIS_H + AXIS_GAP 起。
     两个分支的本体高 locH 完全相同 → 一栏的总高与朝向无关，纸张高度不会随朝向变化。 */
  const up      = st.direction === 'up';
  const rowsTop = up ? 0 : RD.AXIS_H + AXIS_GAP;        // 行区在栏内的起点
  /* ---------- 右侧信息栏：宽度是算出来的，不是定值（用户 2026-09-18）----------
     取舍顺序按用户定稿：**先把栏距收窄，再收侧栏**，曲谱尺寸一律不动。
     算式（W = 703 可印宽、EDGE = 12 右留白）：
         2×zW + 栏距 + SIDE_GAP + 侧栏 ≤ W − EDGE
     17 键（zW = 280）：栏距 24 时侧栏还剩 97 → 够 96（有二维码）✓
     21 键（zW = 304.5）：栏距要压到 8 才挤得出 64 → 二维码 ≈ 50px ≈ 13mm，仍可扫
     分页预览 + 简谱对照（zW 更大）→ 侧栏算出来 < SIDE_MIN → 整条不画，把地方还给简谱对照 */
  const sideWant = a.qr ? SHEET.SIDE_WANT.qr : a.note ? SHEET.SIDE_WANT.note : SHEET.SIDE_WANT.plain;
  const fitSide = g => SHEET.PRINT_W - SHEET.EDGE - (zW * SHEET.COLS + g) - SHEET.SIDE_GAP;
  let colGut = SHEET.COL_GUT_MAX;
  let sideW  = Math.min(sideWant, fitSide(colGut));
  if(sideW < sideWant){                                 // 栏距先让位
    colGut = Math.max(SHEET.COL_GUT_MIN, colGut - (sideWant - sideW));
    sideW  = Math.min(sideWant, fitSide(colGut));
  }
  if(sideW < SHEET.SIDE_MIN) sideW = 0;                 // 挤成一条纸片还不如不画
  const sideGap = sideW ? SHEET.SIDE_GAP : 0;

  /* ★ 整份谱**只有一栏**时（《小星星》这种短曲）：那一栏在曲谱区里**水平居中**；
     多栏 / 多张时按「两栏 + 栏距」这块基准宽算同一个居中量，于是逐张的栏位严丝合缝
     （用户第三次定稿：「第一页只有一栏时，不显示序号，且曲谱居中。多页曲谱时，
      最后一栏靠左不居中」——「末栏靠左」现在由基准宽自动满足：末栏只有 c=0，
      按两栏基准居中后它自然落在偏左的那一格上）。
     ⚠️ 判据是**总栏数 = 1**，不是「本张只有一栏」。
     ⚠️ 居中基准是**整块基准宽 compW**，不是「纸宽 − 一栏宽」—— 后者会把两栏的谱
        排到右半边去（探针 L 段盯的就是这个中心点）。 */
  const single = panels.length === 1;
  const W = SHEET.PRINT_W;                              // 分页版式一律铺满 A4 可印宽
  /* 曲谱区右界：右侧信息栏存在时，先把它和它的留白让出来 */
  const scoreRight = W - SHEET.EDGE - (sideW ? sideW + sideGap : 0);
  const compW = single ? zW : zW * SHEET.COLS + colGut * (SHEET.COLS - 1);
  /* 曲谱块在 [0, scoreRight] 里居中 → 「没填附加信息、侧栏只剩 58px」那一路，
     富余的空间自然把曲谱整体往右推一点（用户 2026-09-18「曲谱往右挪一点，自适应」）。
     全是算出来的：17 键 / 21 键 / 有无二维码各走各的，不用手工调。
     ⚠️ 单栏是**例外**：按**轨道网格**在整张纸上居中（老口径，用户第三次定稿
        「第一页只有一栏时曲谱居中」）。单栏时右侧留白很大，若也按 [0,scoreRight] 居中，
        可见的谱面会整体偏左、右边空出一大块，反而看不出「居中」—— 这一条有探针盯着
        （sheet 探针的「单栏墨迹中心 = 纸中」）。 */
  const ox0 = single
    ? Math.max(0, (W - t.len * colW * z) / 2 - x0 * z)
    : Math.max(0, (scoreRight - compW) / 2);
  /* 栏区起点 = 页眉分隔线（PAD+74）再往下一点；栏高已由 rowsPerCol 反推好 */
  const colTop = RD.PAD + 74 + SHEET.TOP_GAP;
  /* 一张纸的高 = 页眉带 + 栏区 + **页脚带** + 纸底留白（定值，逐张一致）。
     页脚带排在 panelH 与 BOT_PAD 之间。 */
  const H = colTop + panelH + SHEET.FOOT_H + SHEET.BOT_PAD;
  const perSheet = SHEET.COLS;                          // 一张纸 2 栏
  const sheetCount = Math.max(1, Math.ceil(panels.length / perSheet));
  /* ================= 页眉页脚 = **纸张家具**，钉在纸上，不跟曲谱动 =================
     用户 2026-09-18 最后定稿的两句：「页尾不跟曲谱动」「页眉也钉住」——
     合并成一条规则：**曲谱可以自己动（单栏居中 / 被自适应右推），家具一格都不动**。

     页眉：
       · 标题 / 作者 / 分隔线左端 = SHEET.RAIL_L（见常量表里那条「纸左轨」）
       · 分隔线右端 = 有信息栏时停在栏左缘再往左 10px；没有信息栏时拉到可印区右缘。
         ⚠️ 这一端**必须**随信息栏变 —— 线拉到二维码底下会糊成一片（有探针盯着）。
            它是「避让侧栏」，不是「跟曲谱」，两者别混。

     页脚那一条（用户定的三个数：19.5 / 351.5 / 691）：
       · 左端 = SHEET.RAIL_L = 19.5，与页眉标题同一条竖线；
       · 中点 = W / 2 = 351.5 是**纸面正中**，不是「左右两段的中点」——
         后者会随左边那串数据的长度左右晃，逐张看会以为页码在自己动；
       · 右端 = W − SHEET.EDGE = 691（可印区右缘），纸号锚点再退回 SHEET.INK_OVER。

     ★★ 为什么**不**锚曲谱框（上一轮我改成锚曲谱墨迹，是错的，记在这里免得再来一次）：
       曲谱的横向位置本身是**会变**的 —— 单栏短曲按轨道网格居中（ox0 跑到 201.5）、
       侧栏窄时整块被右推（ox0 由 19.5 变 0.5）、21 键又换一套宽度。
       页脚若跟着它，这三种情况下页脚会各自横跳；多页谱的**末页**常常只剩一栏，
       更会出现「同一份谱翻页时页脚左右移」的观感缺陷。家具必须逐张、逐配置一致。 */
  const hdrL = SHEET.RAIL_L;
  const hdrR = sideW ? (W - SHEET.EDGE - sideW - 10) : (W - SHEET.EDGE);
  const footL = SHEET.RAIL_L, footC = W / 2, footR = W - SHEET.EDGE;

  let y = 0; const geom = [], pageBody = [];
  for(let si = 0; si < sheetCount; si++){
    /* 页眉 / 页脚 / 信息栏共用同一个 geo（唯一真源，见 drawPageHead 的注释）。
       页脚基线贴着**满栏**栏区底算（colTop + panelH 逐张一致）—— 用本张实际栏高的话，
       同样几样字在不同张上忽高忽低，翻页时会觉得页码在跳。 */
    const geo = {W, gy: y, hl: hdrL, hr: hdrR, fl: footL, fc: footC, fr: footR,
                 yFoot: y + colTop + panelH + SHEET.FOOT_H * 0.62,
                 a, print: true, pi: si, total: sheetCount};
    let inner = drawPageHead(grid, t, st, geo) + drawPageFoot(grid, t, st, geo);
    /* 右侧信息栏：**每张纸一份**，纵向铺满栏区（panelH 是满栏高，逐张一致）。
       横坐标与曲谱块无关 —— 它钉在可印区右边（右留白 SHEET.EDGE）。 */
    /* data-side 只是给探针一个把手：版式里**只有这一块**是纸张家具之外的矩形
       （二维码框 / 附加信息框 / logo 占位框），探针要区分「框住曲谱的外框」
       和「信息栏里的框」，靠这个属性比靠坐标猜稳得多。 */
    if(sideW) inner += tg('g', {'data-side': 1},
                          drawSidebar(st, {x: W - SHEET.EDGE - sideW, y: y + colTop,
                                           w: sideW, h: panelH, qr: a.qr, note: a.note}));
    for(let c = 0; c < perSheet; c++){                  // c = 栏号（0 = 左栏，1 = 右栏）
      const gi = si * perSheet + c;                     // 全局栏号
      if(gi >= panels.length) break;
      const p = panels[gi];
      /* 单栏：那一栏在曲谱区里居中；多栏：按栏号横排（c=0 靠左），基准都是 ox0。
         ⚠️ `single` 时 ox0 是按**一栏宽**算的居中量（compW = zW），别拿它去乘栏号。 */
      const ox = single ? ox0 : ox0 + c * (zW + colGut);
      const oy = colTop + y;                            // 栏左上角（整张 svg 的 y）
      /* ★ 栏本体（轨道带 + 行区 + 音位轴）**跟着本栏实际行数收短**。
         用户报的图：短曲只有一栏、末端那栏不满，原来却按满栏高 68 行撑开 ——
         音位轴被甩到纸底附近、离最后一小节老远，中间一大片空轨道，看着像「拉太长了」。
         改成「向上对齐」：行区高 = 本栏实际行数 × 行高，音位轴紧贴行区末端。
         ⚠️ 纸张高度 H 仍按**满栏**算（见上面 rowsH）—— 逐张尺寸必须一致，分页点才不会漂。 */
      const rh   = p.length * RD.ROW_H;                 // 本栏实际行区高
      const locH = rh + AXIS_GAP + RD.AXIS_H;           // 本栏本体高（满栏时就等于 localH）
      const axY  = up ? rh + AXIS_GAP : 9;              // 音位轴 y0：随朝向换端，但都贴着行区
      /* 栏本体：整块交给 scale 缩 —— 下面的绘制调用与「连续预览」那支完全相同，
         只有行区起点换成了栏内的 rowsTop。
         注意这里**不再画段页码**：用户定稿「曲谱左上角那个页码不是准确的页码」。
         一栏就是一段连续的行，栏内不做任何切断（「第一列曲谱不被阻断」的落点）。 */
      let body = drawColumns(t, x0, rowsTop, rowsTop + rh, colW, st.optMark);
      body += drawRows(p, t, x0, colW, rowsTop, st,
                       {closing: gi === panels.length - 1,
                        unit: grid.unit, meter: grid.meta.meter,
                        noDeg: forOutput});      // 纸上不画简谱对照（用户 2026-09-18）
      body += drawAxis(t, x0, axY, colW, grid.usedCols, st.optMark);
      /* data-panel 只是给探针/调试用的把手：拿到这个 <g> 就能按**网格坐标**读图元
         （缩放是 transform 干的，属性值仍是 100% 的行高 25 / 列宽 28）。 */
      inner += tg('g', {transform: 'translate(' + n2(ox) + ',' + n2(oy) + ') scale(' + z + ')',
                        'data-panel': gi, 'data-zoom': z}, body);
      /* ★ 栏序号：白底圆圈 + 数字（用户两轮定稿）。
         ① 直径 = **音位轴带高**（AXIS_H×z = 28px）的 **90% × 80% = 72%** → 20.16px
            （第一轮定 90% = 25.2px，第二轮「改为原来的 80%」）；
         ② 描边 1.1px（第二轮「圈可以再细一点」，原 1.6px）；
            描边 / 直径 = 5.5%，比第一轮的 6.3% 更细 —— 缩小后仍保持「细圈」观感；
         ③ 圆心与音位轴**垂直居中**（轴笔迹恒为 y0−9 … y0+47，中点 = y0+19），
            所以朝向一换圆圈就跟着轴跑到栏的另一端（「跟随音位轴」）；
         ④ 圆心水平落在栏左留白（RD.LEFT×z = 31px）的**正中央** ——
            圆右缘 = 25.6 < 网格左缘 31，既不压第一格、也不出纸；
         ⑤ 序号是**跨页连续**的栏号：左栏 ①、右栏 ②、下一页第一栏 ③（gi 是全局栏号）；
         ⑥ **整份谱只有一栏时不画序号** —— 只有一栏就无所谓「第几栏」，
            而且那一栏已经居中了，圆圈戳在左留白里反而把居中的观感拽偏（第三次定稿）。
         ⚠️ 必须画在缩放组**之外** —— 放进 body 里会被 scale(z) 缩成半个圆。
         用 <g data-colno> 包起来只是给探针一个把手（存的是**栏号**，从 1 起）。 */
      const cR = RD.AXIS_H * z * 0.36;                  // 半径（直径 = 轴带高 × 0.72）
      const cX = ox + RD.LEFT * z / 2;
      const cY = oy + (axY + 19) * z;
      const cNum = String(gi + 1);
      /* 字号跟着圆缩到 80%（一位 12 / 两位 10.5 / 三位 9）——
         三位数宽 ≈ 3×0.55×9 = 14.9 < 圆内径 17.96，不会顶出圆外 */
      const cSize = cNum.length > 2 ? 9 : cNum.length > 1 ? 10.5 : 12;
      if(!single)
        inner += tg('g', {'data-colno': gi + 1},
          ci(cX, cY, cR, '#ffffff', '#1b1b19', 1.1) +
          tx(cX, cY + cSize * 0.36, cNum,
             {size: cSize, weight: 600, anchor: 'middle', fill: '#1b1b19'}));
      /* 点选编辑要用它把「纸内的一点」反算回「第几行第几列」——
         gx0/colWz/rowHz 都是**纸面坐标**下的一格尺寸（列宽 14 / 行高 12.5）。
         yTop/yBot 是**行区**（不含音位轴）：轴在上端时行区整体下移 rowsTop。 */
      geom.push({yTop: oy + rowsTop * z, yBot: oy + (rowsTop + p.length * RD.ROW_H) * z,
                 startIdx: gi * rpc, n: p.length,
                 g0: y, h: H, gx0: ox + x0 * z, colWz: colW * z, rowHz: RD.ROW_H * z,
                 ox, oy, z, w: zW, gridHz: p.length * RD.ROW_H * z, panelH: locH * z,
                 rowsTop, axisY: axY, rowsH: rh, fullRowsH: rowsH, full: p.length === rpc});
    }
    pageBody.push(inner);
    y += H + 10;
  }

  const style = SVG_STYLE;
  const wrap = (inner, g0, h) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + h +
    '" width="' + W + '" height="' + h + '">' + style +
    '<g transform="translate(0,' + (-g0) + ')">' + inner + '</g></svg>';

  setLastGeom({panels: geom, colW, x0, W, H: y - 10, zoom: z, sheetH: H,
              rowsPerCol: rpc, colGut, rowsH, up, single,
              /* 新版式（2026-09-18）的横向几何，给探针与调试用 */
              sideW, sideGap, ox0, compW, scoreRight, panelH, colTop, deg, forOutput, attach: a,
              /* 页眉页脚的**纸轨**（用户 2026-09-18 定稿：家具不跟曲谱动）。
                 探针要断言「不跟曲谱动」就得有这几个数，且必须**直接暴露常量与算式**，
                 不能让探针自己重推一遍（重推等于把实现抄一份，实现错了两边一起错）。 */
              hdrL, hdrR, railL: SHEET.RAIL_L, footL, footC, footR});
  if(split){
    const pages = pageBody.map((b, si) => ({
      svg: wrap(b, si * (H + 10), H),
      width: W, height: H, y0: si * (H + 10)
    }));
    return {pages, width: W, height: y - 10, split: true};
  }
  const body = pageBody.map(b => tg('g', {}, b)).join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + (y - 10) +
              '" width="' + W + '" height="' + (y - 10) + '">' + style + body + '</svg>';
  return {svg, width: W, height: y - 10};
}

/* ---------------------------------------------------------------------
   悬浮音位轴：紧凑版（只有音名 + 简谱数字 + 八度点），高度 56px
   和谱面共用 x0 / colW，所以它和谱面的轨道列是同一套坐标，天然对齐。
   --------------------------------------------------------------------- */
const AXIS_BAR_H = 58, AXIS_BAR_PAD = 12;
/* 悬浮轴里的音名：底色同样走 isShadeDark(t, i)，和谱面轨道深浅一一对齐（跟着开关走）；
   没用到的轨道音名压灰，一眼能分清「这曲会用到哪几根」 */
function drawAxisBarTracks(t, x0, y0, colW, usedCols, shade){
  let s = '';
  const centerOct = t.notes[t.center].octave;
  const top = y0 - 9, bot = y0 + 41;
  for(let i = 0; i < t.len; i++){
    const x = colX(x0, i, colW), mid = x + colW / 2, nt = t.notes[i], on = usedCols.has(i);
    s += rc(x, top, colW, bot - top, (shade && isShadeDark(t, i)) ? SHADE_DARK : SHADE_LIGHT);
    s += ln(x, top, x, bot, i === 0 ? '#c6c5bd' : COL_LINE, 1);
    const rel = nt.octave - centerOct;
    for(let j = 1; j <= Math.abs(rel); j++){
      s += ci(mid, rel > 0 ? y0 + 3 - j * 3.4 : y0 + 34 + j * 3.4, 1.5, on ? '#6a6a64' : '#c0bfb9');
    }
    s += tx(mid, y0 + 15, nt.step, {size:11, weight:i === t.center ? 700 : 600,
            anchor:'middle', fill: on ? '#1b1b19' : '#b6b5af'});
    s += tx(mid, y0 + 30, degreeLabel(nt.midi), {size:9, anchor:'middle',
            fill: on ? '#7d7d77' : '#c3c2bc'});
  }
  s += ln(x0 + t.len * colW, top, x0 + t.len * colW, bot, '#c6c5bd', 1);
  return s;
}
/* 只截取「轨道区 + 左右 12px」这一条，白底才不会比轨道宽出一大截；
   SVG 内部仍用谱面的 x0 / colW 坐标，再靠 marginLeft 把它推回原位 → 列严格对齐。 */
function axisBarSvg(t, usedCols, shade){
  const colW = CW(t.len), x0 = RD.LEFT;
  const vx = x0 - AXIS_BAR_PAD, vw = t.len * colW + AXIS_BAR_PAD * 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vx + ' 0 ' + vw + ' ' + AXIS_BAR_H +
         '" width="' + vw + '" height="' + AXIS_BAR_H + '">' + SVG_STYLE +
         ln(x0, 2, x0 + t.len * colW, 2, '#eeede8', 1) +
         drawAxisBarTracks(t, x0, 13, colW, usedCols, shade) + '</svg>';
}
const AXIS_BAR_OFFSET = () => RD.LEFT - AXIS_BAR_PAD;

/* ─────────────── 本模块对外出口 ─────────────── */
export { AXIS_BAR_H, AXIS_BAR_OFFSET, AXIS_BAR_PAD, AXIS_GAP, BASE_Y, COL_LINE, CW, C_DEG, DEG_X, DOTTED_DURS, FONT_STACK, HEAD_BOLD, HEAD_INK, NOTE_RATIO, PRINT_ZOOM, RD, SHADE_DARK, SHADE_LIGHT, SHEET, STEM_OUT, SVG_STYLE, attachForPrint, axisBarSvg, ci, colX, degreeLabel, drawAxis, drawAxisBarTracks, drawColumns, drawNote, drawPageFoot, drawPageHead, drawRows, drawSidebar, esc, escAttr, flagCount, isDotted, isShadeDark, layoutRowCount, ln, n2, planBeams, qrInk, qrPathD, rc, renderScore, rowsPerCol, tg, tx, vText };
