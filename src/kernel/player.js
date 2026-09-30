/* =====================================================================
   player.js —— Web Audio 试听与播放调度
   ⚠️ 本文件由 frontend/tools/extract_kernel.js 自动生成，请勿手工修改。
      唯一真源：kalimba-tab/index.html 的 <script id="s-*"> 块。
      重新生成：npm run kernel:extract
   段内代码逐字搬运；与原文件的差异只有下方 import 与文件尾的 export，
   以及 extract_kernel.js 中登记在案的补丁（P1/P2）。
   ===================================================================== */

import { buildCues, cueIndexAt, cueStartAt } from './layout.js';
import { ST } from './state.js';

/* ─────────────── 以下为段内原文（逐字搬运） ─────────────── */

/* =====================================================================
   6. 试听：卡林巴音色合成 + 播放时逐行高亮跟随
   ===================================================================== */
let AC = null, MASTER = null, rafId = 0, playing = false, hlRow = -1, hlBox = null;
let schedTimer = 0, schedRow = 0, schedCtx = null;   // 滑窗调度：定时器 / 行游标 / 本次播放上下文
const SCHED_LOOKAHEAD = 2.5;              // 只提前 2.5s 把音排进音频图（见 schedPump）
let starting = false;                     // 播放前的「预滚动」进行中（兼作可取消标志）
let followHold = 0;                       // 手动滚动后的短暂“让位”时间戳

const ensureAC = () => {
  if(!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if(AC.state === 'suspended') AC.resume();
  return AC;
};
/* 确保 AC 真正 running：浏览器自动播放策略下新创建的 AudioContext 默认 suspended，
   resume() 必须（在用户手势内）await 完成再调度，否则振荡器时钟冻结、被静音 ——
   表现就是「标签页亮着音频指示器、实际听不到声音」。 */
async function acReady(){
  const ac = ensureAC();
  if(ac.state === 'suspended'){
    try{ await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 300))]); }catch(e){}
  }
  return ac;
}

/* 单音：三角波基音 + 二次谐波 + 高频金属泛音，快速起音、三段式衰减。

   ★★ 延音只有**一条基准**：与「点音色栏轨道轴单点试听」逐字相同。
      做法不是把两边的系数调成一致，而是**取消时值参数**，让两条路径调同一个签名：
        · 试听   previewNote(midi)          → pluck(midi, now, NOTE_VOL, destination)
        · 播放   schedPump 里的每个音        → pluck(it.midi, when, vol, MASTER)
      谱面播放不再把 `it.dur * rowSec` 传进来。这样「一样」是**结构上保证**的，
      而不是靠两处公式保持同步 —— 后者迟早会漂移（本文件历史上正是这么漂的）。

   尾音长度迭代史（留着是为了不退回老写法）：
   ① 硬编码 1.85s 固定尾音 + 单段指数衰减：稠密谱（138BPM、行距 0.109s）平均 8.2 /
      峰值 16 个音同时响且尾部能量高 → 糊成一团。
   ② 尾音 = 时值 × 4 夹 [0.42, 1.85]：稠密谱清爽了，但短音全撞在 0.42s 下限上，
      成了「啪」一下的干音（狐姬零 937 音里 697 个 = 74% 被卡死）。
   ③ 尾音 = 时值 + TAIL_PAD，夹 [TAIL_MIN, TAIL_MAX]：长度够了，但**同一首曲子里
      长短音的余韵差别很大**，与试听听到的那一下不一致（用户反馈）。
   ④ 现在这版：长度不再看时值，恒为 TAIL_MIN~TAIL_MAX 之间（随音高轻微加权）。
      ★ 让「有金属余韵」和「不糊」能同时成立的**不是长度，而是包络**：
        主音段快落到 30%、余韵段缓落到 10%、再收到 0.0007，于是即使十几个音叠着，
        叠加的主要是低幅余韵 —— 实测 RMS 反而不升。 */
const TAIL_MIN  = 0.95;     // 地板余韵：再短的音也要有这么多金属尾
const TAIL_MAX  = 2.40;     // 天花板：再长的音也不至于盖住后面
const TAIL_PAD  = 0.85;     // 基准时值之外的固定余韵时长
const TAIL_BASE = 0.9;      // 基准时值（恒值，不随音符时值变化 —— 见上 ★★）
const TAIL_BODY = 0.42;     // 主音段时长（TAIL_BASE * 0.9 的封顶值）
const NOTE_VOL  = 0.22;     // 单音音量：试听与播放共用，保证听感一致
/* 尾音长度：**只看音高**（低音簧片余韵更长），与谁在调它、音符多长都无关。
   单独抽成函数是为了让探针能直接调用它，而不是各自抄一份公式 ——
   本文件历史上四处探针各抄一份，改包络时漏同步过一次，探针照样全绿但测的是旧音色。 */
function pluckTail(midi){
  return Math.max(TAIL_MIN, Math.min(TAIL_MAX, TAIL_BASE + TAIL_PAD + Math.max(0, 72 - midi) * 0.014));
}
function pluck(midi, when, vol, dest){
  /* ★ 音频上下文从 dest 反推（AudioNode.context），而不是一律用全局 AC：
     这样探针能把**真实的 pluck** 渲染进 OfflineAudioContext 做逐样本比对，
     不必再手抄一份音频图 —— 手抄的那份正是游走于「假绿」边缘的东西。
     真实路径不受影响：MASTER / ac.destination 的 context 就是 AC。 */
  const ac = (dest && dest.context) || ensureAC();
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const tail    = pluckTail(midi);
  const body    = TAIL_BODY;                                             // 主音段
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.005);
  g.gain.exponentialRampToValueAtTime(vol * 0.30, when + body);
  g.gain.exponentialRampToValueAtTime(vol * 0.10, when + body + (tail - body) * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0007, when + tail);
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(4600, when);
  filt.frequency.exponentialRampToValueAtTime(1150, when + Math.min(0.35, body + 0.1));
  filt.frequency.exponentialRampToValueAtTime(700, when + tail);         // 余韵越拖越暖

  const add = (type, freq, amp) => {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
    const gg = ac.createGain(); gg.gain.value = amp;
    o.connect(gg); gg.connect(g); o.start(when); o.stop(when + tail + 0.06);
  };
  add('triangle', f, 1); add('sine', f * 2.004, 0.26); add('sine', f * 5.42, 0.05);

  g.connect(filt); filt.connect(dest);
}

/* 当前行高亮（只负责点亮，滚动交给 followScroll） */
function setHighlight(idx){
  if(idx === hlRow) return;
  hlRow = idx;
  document.querySelectorAll('#svgHost rect.hl').forEach(r => r.setAttribute('opacity', 0));
  hlBox = null;
  if(idx < 0) return;
  const box = document.querySelector('#svgHost rect.hl[data-row="' + idx + '"]');
  if(!box) return;
  box.setAttribute('opacity', 1);
  hlBox = box;
}

/* 谱面重绘后（切分页预览、改显示选项）高亮 DOM 已被替换，把它重新贴回当前行 */
function onRedrawn(){
  const cur = hlRow;
  hlRow = -2;                       // 绕过 setHighlight 的“同一行不重复设置”短路
  if(cur < 0) return;
  setHighlight(cur);
  if(playing) followScroll(true);   // 暂停时也把高亮贴回去，只是不抢滚动
}

/* 滚动跟随：把当前行推到预览视口的垂直中线上。
   —— 用缓动（用户要的顺滑）：每帧朝目标收敛 30%，所以滑动是「快进慢停」的，
      不匀速；快到时直接落位（滚动位置会被浏览器取整，纯缓动会永远停在离目标 1~2px 处）。
   —— 缓动不会拖慢高亮的节拍：高亮行号的推进是**按时间算的**（见 play()），
      缓动只影响谱面滑动的观感，高亮该亮哪一格、亮多久完全由音符时值决定。
   scrollTop 仍由浏览器自动夹在 [0, max] —— 开头自然停在第一个音、结尾自然滑到最后一个音。 */
const FOLLOW_EASE = 0.30;                              // 每帧收敛比例
function followScroll(force){
  const stage = document.getElementById('stage');
  if(!stage || !hlBox) return;
  if(!force && performance.now() < followHold) return;   // 用户刚手动滚过 → 先不抢
  const rs = stage.getBoundingClientRect(), rb = hlBox.getBoundingClientRect();
  if(!rs.height) return;
  const contentY = rb.top + rb.height / 2 - rs.top + stage.scrollTop;  // 行中心在整卷内容中的 y
  const target   = contentY - rs.height / 2;                          // 让它居中所需的 scrollTop
  const d = target - stage.scrollTop;
  if(force || Math.abs(d) < 1.5) stage.scrollTop = Math.round(target);
  else                           stage.scrollTop += d * FOLLOW_EASE;
}

/* 手动滚屏时暂时让位，松开 1.5s 后自动回到跟随 */
(function(){
  const stage = document.getElementById('stage');
  if(!stage) return;
  const hold = () => { followHold = performance.now() + 1500; };
  stage.addEventListener('wheel', hold, {passive:true});
  stage.addEventListener('pointerdown', hold);
  stage.addEventListener('touchstart', hold, {passive:true});
})();

/* ---------- 播放控制 ----------
   playPos = 记忆播放位置（秒，曲谱时间轴上的位置）。「暂停」只停声音、记住位置，
   再点「播放」就从这里接上；只有「停止」和「复位」会把它清回 0。
   START_LEAD = 曲谱前的缓冲：第一个音之前先空 0.5 秒，音频与高亮共用这一个提前量。
   它的作用是等 AudioContext 起转（首次创建时时钟要过一小会儿才稳），0.5 秒够用。 */
let playPos = 0;
const START_LEAD = 0.5;

function syncPlayBtn(){
  const b = document.getElementById('btnPlay');
  if(b) b.textContent = playing ? '❚❚ 暂停' : '▶ 播放';
  /* 复位按钮只在「暂停了、而且确实有进度」时出现；播放中或进度为 0 时收起来 */
  const r = document.getElementById('btnReset');
  if(r) r.classList.toggle('on', !playing && playPos > 0.01);
  syncProg();                            // 进度条跟着这三态走：播放中 / 暂停 / 复位
}

/* ---------- 竖向播放进度条：贴在滚动条左边，浮在谱面之上 ----------
   用户诉求（2026-09-17）：「在曲谱预览窗口的滑动条左边，加一个竖向的进度条，
   显示当前进度。上往下放曲谱时，进度上往下走，反之同理，走过的部分显示灰色。
   这个进度条要跟音名一样悬浮在曲谱上」。
   —— 「进度」= **播放进度**（与复位按钮的「进度回到曲谱开头」同一个含义）。
      播放时谱面本来就自动跟随，所以它平时和滚动条游标基本同步；
      但手动滚屏时只有滚动条会动 —— 这是刻意的：这两根尺子量的不是一回事。
   —— 「走过的部分」= 已播过的那一段（灰），未播的留浅底，当前进度一枚深色游标。
   —— 「悬浮」= `#stage` 的**兄弟节点**（放进 `.stageWrap` 绝对定位），所以既不占谱面
      位置、也不随谱面滚走，和悬浮音位轴是同一路的「钉在预览区」观感。
   ⚠️ 条内位置一律写成**百分比**：播放的 rAF 每帧都会调 syncProg，
      一帧读一次布局会反复触发重排（所以把「读布局」单独关进 progPlace）。 */
const PROG = {on:false, right:-1, frac:-1, up:null};

/* 全曲秒数：与 play() 同一个口径（末尾空白行不算，用最后一个音的时值收尾）。
   按 (grid, tempo, unit) 记忆 —— setTempo 是**原地改** grid.meta.tempo，
   只比对象引用会把旧速度缓存下来（症状：改完速度，进度条的比例不动）。 */
let progCache = {g:null, tempo:0, unit:0, total:0};
function progTotal(){
  const g = ST.grid;
  if(!g) return 0;
  const tp = g.meta.tempo || 88;
  if(progCache.g === g && progCache.tempo === tp && progCache.unit === g.unit) return progCache.total;
  const rowSec = g.unit * (60 / tp);
  const cues = buildCues(g, rowSec);
  const total = cues.length ? Math.min(g.rows.length * rowSec, cues[cues.length - 1].end) : 0;
  progCache = {g:g, tempo:tp, unit:g.unit, total:total};
  return total;
}

/* 竖向滚动条占了多宽：offsetWidth − clientWidth 里还含左右边框，要减掉 */
function stageScrollbarW(st){
  const cs = getComputedStyle(st);
  const bw = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  return Math.max(0, st.offsetWidth - st.clientWidth - bw);
}

/* 贴住滚动条左侧。会读布局 → 只在重绘 / resize / 首次显示时调。
   右边距 = 滚动条净宽 + 右边框 + 5px 缝（从 .stageWrap 的右缘量起，
   而滚动条是贴在**边框内侧**的，所以那 1px 边框要一起算进去）。 */
function progPlace(){
  const bar = document.getElementById('progBar'), st = document.getElementById('stage');
  if(!bar || !st) return;
  const brw = parseFloat(getComputedStyle(st).borderRightWidth) || 0;
  const r = Math.round(stageScrollbarW(st) + brw + 5);
  if(r !== PROG.right){ bar.style.right = r + 'px'; PROG.right = r; }
}

/* force = 重绘 / resize 之后强制重新贴边（分页预览会让滚动条出现或消失，宽度会变） */
function syncProg(force){
  const bar = document.getElementById('progBar'), st = document.getElementById('stage');
  if(!bar || !st) return;
  if(force) PROG.right = -1;
  const total = progTotal();
  if(total <= 0){                        // 没谱面 / 没有能播的音 → 收起来
    if(PROG.on){ bar.classList.remove('on'); PROG.on = false; }
    return;
  }
  if(force || !PROG.on) progPlace();
  if(!PROG.on){ bar.classList.add('on'); PROG.on = true; PROG.frac = -1; PROG.up = null; }
  const frac = Math.max(0, Math.min(1, playPos / total));
  const up = ST.st.direction === 'up';   // 自下往上读：时间从底部往上走
  if(frac === PROG.frac && up === PROG.up) return;   // 值没变就别写样式（60fps）
  PROG.frac = frac; PROG.up = up;
  const at = up ? 1 - frac : frac;       // 游标位置：0 = 轨道最上端
  const fil = bar.querySelector('.fil'), thm = bar.querySelector('.thm');
  /* 灰段永远从「起点那一端」铺到游标：向下读时起点在上端，向上读时起点在下端 */
  if(fil){ fil.style.top = (up ? at * 100 : 0) + '%'; fil.style.height = (frac * 100) + '%'; }
  if(thm) thm.style.top = (at * 100) + '%';
}

/* ---------- 拖动进度条 = 跳到那个进度（用户 2026-09-17 补充）----------
   用户原话：「给进度条加上拖动功能，拖动时先自动暂停，然后高光移到预览窗口中间，
   对应目前进度的音符。高光位置不用锁死，跟正常播放一样，有一定上下幅度」。
   三件事，逐条对应：
     ① 「先自动暂停」：按下那一刻就走 pausePlayback（停声音、按钮切回「▶ 播放」），
        进度留着 —— 紧接着被这次 seek 覆盖，所以「记忆播放」不会残留旧位置。
     ② 「高光对应目前进度的音符」：setHighlight(cues[cueIndexAt(cues, playPos)].idx)，
        与播放的 tick **同一个映射**，不另写一套（写两套迟早漂）。
     ③ 「移到窗口中间 / 不用锁死 / 有上下幅度」：滚动**复用 followScroll**（缓动 30%/帧、
        不 force），和播放时的 tick 一模一样 —— 所以拖动快时高光会落在中线上下一点，
        松手后再自己缓缓收到中间；谱面首尾由浏览器夹在 [0, max]，高光自然偏离中线。
        刻意**不**在按下时 force 落位：那才是「锁死」，和用户要的观感相反。
   ②′（同日追加）「拖动时显示时间气泡」：见 fmtClock / progTip —— 纯视觉层，
        不改任何映射；气泡的纵向位置**抄游标**而不是自己再算一遍方向。 */
let progDrag = false, progDragRaf = 0, progDragTitle = '';

/* 指针 y → 进度（0~1）：与 syncProg 的位置映射**互为逆运算**
   （down：条的上端 = 0%，up：条的上端 = 100%；轨道是 .trk，上下各留 5px 内边距）。
   ⚠️ 量 .trk 的 rect 而不是 #progBar 的：游标/fil 的百分比都是相对 .trk 定的，
      拿整条的 rect 会把那 5px 内边距算进去（差值 = 进度 5/条高 ≈ 0.6%，拖着会「跟手不准」）。
   ★ 夹紧在这里做一处（指针拖到条外就算「拖到那一端」），下游的 progSeek **不要**再夹一遍：
     两处重复的守卫会让「去掉其中一处」不产生任何行为变化（上一轮实测：就这么白放过一个变异）。 */
function progFracAt(clientY){
  const bar = document.getElementById('progBar');
  const trk = bar && bar.querySelector('.trk');
  if(!trk) return 0;
  const r = trk.getBoundingClientRect();
  if(!r.height) return 0;
  const at = Math.max(0, Math.min(1, (clientY - r.top) / r.height));   // 从上端往下量
  return ST.st.direction === 'up' ? 1 - at : at;
}

/* 拖动中的跟随循环：每帧一次 followScroll（缓动），与播放时 tick 里的那一句同款。
   松手后**不立刻停** —— 继续跑到「贴住中线」为止，否则一次「按下即抬起」的点击
   会把高光留在离中线半路的位置（缓动一帧只走 30%）。收敛即停，不留空转的 rAF。 */
function progFollow(){
  progDragRaf = 0;
  const st = document.getElementById('stage');
  if(!st) return;
  const before = st.scrollTop;
  followScroll();
  const settled = Math.abs(st.scrollTop - before) < 0.6;
  if(progDrag || !settled) progDragRaf = requestAnimationFrame(progFollow);
}

/* 秒 → "m:ss"（拖动气泡用）。**取整不能改成四舍五入或向上取整**：
   向上取整会让拖到曲尾时显示的时间比总时长还大（45.68 → 0:46 > 0:45）。 */
function fmtClock(s){
  s = Math.max(0, Math.min(359999, Number(s) || 0));
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/* 拖动时的时间气泡：「当前 / 总时长」。
   ★ 纵向位置**直接抄 .thm 的 style.top**（syncProg 刚写过的那个值）—— 不在这里再写一遍
     `up ? 1-frac : frac`：方向映射已经有 syncProg 与 progFracAt 两处，第三份拷贝一旦
     哪天方向规则变了就会「气泡和游标分家」，还得再加一条断言去盯着它。
   （纯视觉：不读写 playPos 以外的任何状态，也不改映射。） */
function progTip(){
  const bar = document.getElementById('progBar');
  if(!bar) return;
  const tip = bar.querySelector('.tip'), thm = bar.querySelector('.thm');
  if(!tip || !thm) return;
  const total = progTotal();
  const at = Math.max(0, Math.min(total, playPos));
  const cur = tip.querySelector('b'), all = tip.querySelector('span');
  if(cur) cur.textContent = fmtClock(at);
  if(all) all.textContent = ' / ' + fmtClock(total);
  tip.style.top = thm.style.top || '0%';
}

/* 跳到 clientY 对应的进度（按下与拖动都走这里） */
function progSeek(clientY){
  const total = progTotal();
  if(total <= 0) return;
  /* ★ 夹紧只在 progFracAt 里做一处（指针拖到条外就算「拖到那一端」），这里不要再来一遍 */
  playPos = progFracAt(clientY) * total;
  const g = ST.grid;
  if(g){
    const rowSec = g.unit * (60 / (g.meta.tempo || 88));
    const cues = buildCues(g, rowSec);
    if(cues.length) setHighlight(cues[cueIndexAt(cues, playPos)].idx);   // 高光 = 这一秒正在响的那一行
  }
  followHold = 0;              // 拖动就是在掌舵，别被「刚手动滚过、先让位 1.5s」挡住
  syncPlayBtn();               // 按钮文案 / 复位按钮 / 进度条三处一起同步（它内部会调 syncProg）
  progTip();                   // 再把气泡的数字与位置跟上（必须**排在 syncPlayBtn 之后**：
                               // 它抄的是 syncProg 刚写进 .thm 的 top，早一步就抄到上一帧的值）
  if(!progDragRaf) progFollow();
}

function progDragStart(e){
  if(e.button !== undefined && e.button !== 0) return;   // 只认主键（触屏 / 触控笔的 button 也是 0）
  if(progTotal() <= 0) return;
  e.preventDefault();
  progDrag = true;
  const bar = document.getElementById('progBar');
  if(bar){
    bar.classList.add('drag');
    /* 拖动期间暂时摘掉悬停提示：原生 tooltip 在「悬停片刻再按下」时会赖着不走，
       正好压在我们自己的时间气泡上面。hasAttribute 兼当「别摘两次」的守卫
       （没抬起又按一次会把 title 存成空串，那就真丢了）。抬起时在 progDragEnd 里装回去。 */
    if(bar.hasAttribute('title')){
      progDragTitle = bar.getAttribute('title') || '';
      bar.removeAttribute('title');
    }
    try{ bar.setPointerCapture(e.pointerId); }catch(err){}   // 拖出条外也要收到 move / up
  }
  /* ① 先暂停：正在响就停掉、正在预滚动也一并取消（haltAudio 里会把 starting 清掉） */
  if(playing || starting) pausePlayback();
  progSeek(e.clientY);         // ②③ 跳到按下的位置 + 高光跟随（内部会同步按钮与进度条）
}

function progDragEnd(e){
  if(!progDrag) return;
  progDrag = false;
  const bar = document.getElementById('progBar');
  if(bar){
    bar.classList.remove('drag');                          // 气泡随之淡出（可见性挂在 .drag 上）
    if(progDragTitle){ bar.setAttribute('title', progDragTitle); progDragTitle = ''; }
    try{ bar.releasePointerCapture(e.pointerId); }catch(err){}
  }
  if(!progDragRaf) progFollow();   // 收尾：把高光缓缓收到窗口中间（收敛即停）
}

(function(){
  const bar = document.getElementById('progBar');
  if(!bar) return;
  bar.addEventListener('pointerdown', progDragStart);
  bar.addEventListener('pointermove', function(e){
    if(!progDrag) return;
    e.preventDefault();
    progSeek(e.clientY);
  });
  bar.addEventListener('pointerup', progDragEnd);
  bar.addEventListener('pointercancel', progDragEnd);
  /* 兜底：没拿到 pointer capture 时（合成事件 / 个别浏览器），指针在别处抬起也要收尾 */
  window.addEventListener('pointerup', function(e){ if(progDrag) progDragEnd(e); });
})();

/* 只停声音与动画，保留 playPos 供「记忆播放」接着放 */
function haltAudio(){
  starting = false;                       // 预滚动中被打断也要停
  if(schedTimer){ clearInterval(schedTimer); schedTimer = 0; }   // 停滑窗调度，否则会往已断开的图里继续加节点
  schedCtx = null;
  if(rafId){ cancelAnimationFrame(rafId); rafId = 0; }
  if(MASTER && AC){
    const m = MASTER;
    try{
      m.gain.cancelScheduledValues(AC.currentTime);
      m.gain.setValueAtTime(m.gain.value, AC.currentTime);
      m.gain.linearRampToValueAtTime(0.0001, AC.currentTime + 0.15);
    }catch(e){}
    setTimeout(() => { try{ m.disconnect(); }catch(e){} }, 420);
  }
  MASTER = null; playing = false;
}

/* 复位：进度归零、清掉高亮、复位按钮收起（scrollBack = 顺手把谱面滚回开头） */
function resetProgress(scrollBack){
  starting = false;                 // 预滚动也一并取消（此时 playing 还是 false，haltAudio 拦不住）
  if(playing) haltAudio();          // 万一在播放中被复位，先把声音停掉再说
  playPos = 0;
  setHighlight(-1);
  if(scrollBack){
    const stage = document.getElementById('stage');
    if(stage) stage.scrollTop = 0;
    followHold = 0;
  }
  syncPlayBtn();
}

/* 暂停：先把进度对回「当前正在响的那个音」的起点，再停声音 */
function pausePlayback(){
  const g = ST.grid;
  if(g){
    const rowSec = g.unit * (60 / (g.meta.tempo || 88));
    const cues = buildCues(g, rowSec);
    if(cues.length) playPos = cueStartAt(cues, playPos);
  }
  haltAudio();
  syncPlayBtn();
}

function stopPlayback(){
  haltAudio();
  resetProgress(true);
}

/* 谱面内容变了（重新生成 / 手动点选编辑）→ 播放立刻停、进度作废，
   否则记忆位置会指向一个已经不存在的音 */
function invalidatePlayback(){
  if(playing) haltAudio();
  resetProgress(false);
}

/* 播放前的「预滚动」：先把起始行滑到预览中线，滑到位了再开声。
   自底向上读谱时 row 0 画在整卷最底部，而预览初始停在顶端 —— 若直接开声，
   开头几个音会在谱面还在下滑时就放掉（用户反馈的问题）。
   starting 兼作「预滚动进行中」与「可取消」标志：停止/复位/重绘会把它清掉。 */
function preRollToRow(idx, then){
  const stage = document.getElementById('stage');
  const box = document.querySelector('#svgHost rect.hl[data-row="' + idx + '"]');
  if(!stage || !box){ then(); return; }
  const rs = stage.getBoundingClientRect(), rb = box.getBoundingClientRect();
  if(!rs.height){ then(); return; }
  /* 起始行已经完全在视口里 → 没什么要等的，直接开声（自上而下、以及续播时多半走这里） */
  if(rb.top >= rs.top - 1 && rb.bottom <= rs.bottom + 1){ then(); return; }
  const contentY = rb.top + rb.height / 2 - rs.top + stage.scrollTop;   // 行中心在整卷内容中的 y
  const maxTop   = Math.max(0, stage.scrollHeight - stage.clientHeight); // 浏览器会夹到这个上限
  const tgt      = Math.max(0, Math.min(Math.round(contentY - rs.height / 2), maxTop));
  if(Math.abs(tgt - stage.scrollTop) < 2){ stage.scrollTop = tgt; then(); return; }  // 已经在位 → 直接开声
  let done = false;
  const finish = () => { if(done) return; done = true; then(); };   // 只触发一次
  const from0 = stage.scrollTop, t0 = performance.now();
  /* 时长按距离自适应：以「几个视口高」计量 —— 挪一点点就快（200ms 起），
     跨整卷的远跳才放慢（上限 620ms），既不拖沓也不至于像瞬移。 */
  const dist = Math.abs(tgt - from0), screens = dist / rs.height;
  const DUR = Math.round(Math.max(200, Math.min(620, 200 + screens * 90)));
  const step = () => {
    if(!starting || done) return;                          // 被取消
    const t = Math.min(1, (performance.now() - t0) / DUR);
    const e = 1 - Math.pow(1 - t, 3);                      // easeOutCubic：快起慢停
    stage.scrollTop = from0 + (tgt - from0) * e;
    if(t < 1) requestAnimationFrame(step);
    else { stage.scrollTop = tgt; finish(); }
  };
  requestAnimationFrame(step);
  /* 兜底：后台标签页里 rAF 会被节流甚至不跑，没有这一手 play() 会永远不发声 */
  setTimeout(() => { if(starting && !done){ stage.scrollTop = tgt; finish(); } }, DUR + 260);
}

/* 滑窗调度：把「即将响」的行排进音频图，随播放推进不断补。
   ★ 为什么不一次把整首排完（原来就是这么写的）：每个音要建 7 个音频节点
     （3 振荡器 + 3 增益 + 1 滤波器），MIDI 导入的曲子动辄 600+ 音 → 一次性 4000+
     节点、1800+ 个振荡器同时挂在音频图上，音频线程每 128 采样遍历一遍就顶不住，
     缓冲欠载 → 用户听到的「撕裂感 / 咔咔声」。改成滑窗后稳态只有几十个节点。
   ★ 上下文（grid/rowSec/t0）放在 schedCtx 里：暂停/停止时 haltAudio 会置空，
     定时器即使多跑一拍也不会往废图里加节点。 */
function schedPump(){
  const C = schedCtx, ac = AC;
  if(!C || !ac || !playing) return;
  const el    = ac.currentTime - C.t0;            // 谱面时间轴上的当前位置
  const until = el + SCHED_LOOKAHEAD;             // 只排到这个时刻之前
  while(schedRow < C.grid.rows.length){
    const s = schedRow * C.rowSec;
    if(s > until) break;                          // 还不够近，等下一拍
    const when = C.t0 + s;
    const r = C.grid.rows[schedRow];
    if(r.items.length && when >= ac.currentTime){
      /* ★ 不传音符时值：延音与「单点试听」共用同一个 pluck 签名（见 pluck 顶部 ★★） */
      const vol = r.items.length > 1 ? 0.15 : NOTE_VOL;
      r.items.forEach(it => pluck(it.midi, when, vol, MASTER));
    }
    schedRow++;
  }
}

/* 真正开声：把整条曲谱按 from 秒「前卷」，音频与高亮共用同一个 AudioContext 时钟 */
function startPlayback(grid, cues, rowSec, total, from){
  const ac = ensureAC();
  /* ★ 总线只做一个增益节点，不做任何动态处理 —— 这样「谱面播放的音」与
     「点音色栏单点试听的音」是**同一条波形**（试听直接把 pluck 接到 destination）。
     曾经挂过 DynamicsCompressor 当安全阀，实测它做不到透明（三个配置都试了）：
       -8dB/knee12/ratio8  → 单音 +0.95dB、延迟 ~9.8ms
       -6dB/knee0 /ratio8  → 单音 +2.40dB、延迟 ~6ms
        0dB/knee0 /ratio20 → 单音 -0.75dB、延迟 ~9.8ms
     既改电平又加延迟，而它要防的事并没有发生：裸叠加实测峰值 简谱 0.46 / 狐姬零 0.46 /
     6 音和弦 0.71（全部削波样本 0）—— 离 1.0 还有余量，安全阀本来就不介入。
     若将来真要过载保护，请用「按同时音数分级降增益」这类**确定性、无延迟**的手段，
     别再挂压缩器：它的前视延迟与膝点会让播放与试听的音对不上。 */
  MASTER = ac.createGain(); MASTER.gain.value = 1;
  MASTER.connect(ac.destination);
  const LEAD = START_LEAD;
  /* t0 = 曲谱第 0 秒对应的音频时刻。减掉 from 相当于「把整条曲谱往前卷 from 秒」，
     于是第 from 秒的音恰好落在 currentTime + LEAD —— 即 START_LEAD 秒缓冲之后。 */
  const t0 = ac.currentTime + LEAD - from;

  /* 起播：游标从 from 落在的那一行开始，只在 [el, el+LOOKAHEAD] 窗口里排音 */
  schedRow = Math.max(0, Math.floor(from / rowSec));
  schedCtx = {grid, rowSec, t0, total};
  /* ★ playing 必须先置 true 再 pump：schedPump 有「非播放中直接返回」的守卫，
     顺序反过来会让首批音排不进去、只能等 120ms 定时器 —— 而定时器若被后台节流到 1s，
     起播缓冲只有 0.5s，开头几个音就会因「when 已经过去」被永久跳过（开头不响）。 */
  playing = true; playPos = from;
  schedPump();
  if(schedTimer) clearInterval(schedTimer);
  /* 120ms 一拍：音频线程的调度有 2.5s 余量，即使后台标签页把定时器节流到 1s 也不会断音 */
  schedTimer = setInterval(schedPump, 120);
  syncPlayBtn();
  const startCue = cueIndexAt(cues, from);
  followHold = 0;
  const tick = () => {
    if(!playing) return;
    /* ★ 关键：用 ac.currentTime 而不是 performance.now()。
       首播时 AudioContext 刚创建、其时钟相对于 performance.now() 有启动延迟，
       两套时钟错位 ≈ 一拍（用户反馈的「高光慢一拍」，暂停重放后 AC 已在走，错位消失）。
       改用与音频同一个时钟，首播/续播都严格对齐。 */
    const el = ac.currentTime - t0;                  // 曲谱时间轴上的位置（缓冲期 < from）
    schedPump();                                     // 前台再补一次，比 interval 更密
    playPos = Math.max(playPos, Math.min(el, total));
    /* 缓冲期先亮「起始行」（而不是熄灭）：既避免开头闪一下，也保证预滚动有目标框 */
    setHighlight(el < from - 1e-6 ? cues[startCue].idx : cues[cueIndexAt(cues, el)].idx);
    followScroll();
    syncProg();                                      // 竖向进度条跟着播放走（只写样式，不读布局）
    if(el >= total + 0.3){ stopPlayback(); return; }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

async function play(){
  const grid = ST.grid;
  if(!grid || !grid.rows.length) return;
  if(playing){ pausePlayback(); return; }          // 再点一次 = 暂停（记住位置，不是停止）
  if(starting) return;                             // 预滚动中，忽略重复点击
  starting = true;                                 // 先上锁防重入，再等 AC 就绪
  await acReady();                                 // 确保 AudioContext 真正 running（绕过自动播放策略）
  const spb = 60 / (grid.meta.tempo || 88);        // 每拍秒数
  const rowSec = grid.unit * spb;
  const cues = buildCues(grid, rowSec);
  if(!cues.length) return;
  /* 总时长以最后一个音的时值收尾，末尾的空白行不再空转 */
  const total = Math.min(grid.rows.length * rowSec, cues[cues.length - 1].end);
  const from  = Math.max(0, Math.min(playPos, total - 0.02));   // 记忆播放：从上次停下的地方接上
  const idx   = cues[cueIndexAt(cues, from)].idx;

  setHighlight(idx);                               // 先点亮起始行，预滚动才有目标框
  followHold = 0;
  preRollToRow(idx, () => { starting = false; startPlayback(grid, cues, rowSec, total, from); });
}

/* 单音试听（点轨道轴时用）。★ 这是延音的**基准音色**：谱面播放走的就是同一句 pluck。 */
async function previewNote(midi){
  const ac = await acReady();
  pluck(midi, ac.currentTime + 0.02, NOTE_VOL, ac.destination);
}

/* ─────────────── 本模块对外出口 ─────────────── */
export { AC, FOLLOW_EASE, MASTER, NOTE_VOL, PROG, SCHED_LOOKAHEAD, START_LEAD, TAIL_BASE, TAIL_BODY, TAIL_MAX, TAIL_MIN, TAIL_PAD, acReady, ensureAC, fmtClock, followHold, followScroll, haltAudio, hlBox, hlRow, invalidatePlayback, onRedrawn, pausePlayback, play, playPos, playing, pluck, pluckTail, preRollToRow, previewNote, progCache, progDrag, progDragEnd, progDragRaf, progDragStart, progDragTitle, progFollow, progFracAt, progPlace, progSeek, progTip, progTotal, rafId, resetProgress, schedCtx, schedPump, schedRow, schedTimer, setHighlight, stageScrollbarW, startPlayback, starting, stopPlayback, syncPlayBtn, syncProg };
