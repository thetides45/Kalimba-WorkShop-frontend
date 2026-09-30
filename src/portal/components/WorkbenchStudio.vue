<script setup>
import { onMounted } from 'vue';
import { mountStudio } from '@/kernel';

/**
 * 制谱工作台（整块嵌入，WBS 6）。
 * 本组件由 tools/extract_workbench.js 从 kalimba-tab/index.html 自动生成，请勿手改。
 * 模板 = 工作台 HTML 骨架，样式 = 工作台 CSS（全局选择器已用 .wb-host 隔离作用域），
 * 脚本 = 内核 studio 装配层（mountStudio → init）。
 */
onMounted(async () => {
  await mountStudio();
});
</script>

<template>
<div class="wb-host">
<header class="top">
  <div class="brand">
    <div class="logo">🛠️</div>
    <div>
      <h1>卡林巴转谱工坊</h1>
      <p>简谱 → 拇指琴专用谱 · 17 键 / 21 键 · 可点选、可试听</p>
    </div>
  </div>
  <div class="actions">
    <button class="btn icon" id="btnReset" title="复位：进度回到曲谱开头" aria-label="复位到开头"><svg viewBox="0 0 1024 1024" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M838.016 596.48a21.333333 21.333333 0 0 1 15.018667 26.154667 352.725333 352.725333 0 0 1-340.010667 259.84c-123.818667 0-236.629333-65.792-299.690667-167.637334v146.304a21.333333 21.333333 0 1 1-42.666666 0v-240.128a21.333333 21.333333 0 0 1 21.333333-21.333333c0.981333 0 1.834667 0.426667 2.730667 0.554667a20.906667 20.906667 0 0 1 20.565333 15.189333c37.674667 132.096 160.085333 224.384 297.728 224.384 139.52 0 262.4-93.866667 298.837333-228.309333a21.333333 21.333333 0 0 1 26.154667-15.018667z m-647.253333-144.042667a21.333333 21.333333 0 0 1-14.037334-26.709333 350.506667 350.506667 0 0 1 336.298667-247.210667 349.866667 349.866667 0 0 1 295.722667 162.090667V192a21.333333 21.333333 0 1 1 42.666666 0v240.042667c0 11.818667-9.514667 21.333333-21.333333 21.333333-0.853333 0-1.578667-0.384-2.432-0.469333-1.152-0.085333-2.133333-0.426667-3.285333-0.682667-1.109333-0.298667-2.218667-0.469333-3.242667-0.938667a21.077333 21.077333 0 0 1-12.586667-13.226666 308.224 308.224 0 0 0-295.509333-216.874667 308.010667 308.010667 0 0 0-295.552 217.216 21.333333 21.333333 0 0 1-26.709333 14.037333z"/></svg></button>
    <button class="btn primary" id="btnPlay">▶ 播放</button>
    <button class="btn" id="btnStop">■ 停止</button>
    <label class="bpm" id="bpmWrap" title="全曲播放速度（每分钟四分音符数）。导入的谱若没有速度标记（扫描谱常见），或听起来偏慢/偏快，直接改这里；点一下数字后可用 ↑ ↓ 微调。预览、页眉与反向导出的简谱会一起更新。">速度 <input id="bpmIn" type="number" min="20" max="300" step="1" inputmode="numeric" aria-label="速度 BPM"> BPM</label>
    <button class="btn" id="btnSvg">导出 SVG</button>
    <button class="btn" id="btnPng" title="按页分段导出：一页一张 PNG，多页自动打包成 zip；文件名取自曲名">导出 PNG</button>
    <button class="btn" id="btnPrint">打印 / 存 PDF</button>
  </div>
</header>

<main class="main">
  <aside class="panel left">
    <div class="group row2">
      <div>
        <label for="tuningSel">琴型（音位表）</label>
        <select id="tuningSel">
          <option value="k17">17 键（C 调）</option>
          <option value="k21">21 键（C 调）</option>
          <option value="custom">自定义…</option>
        </select>
      </div>
      <div>
        <label for="keySel">调号 1 =</label>
        <select id="keySel"></select>
      </div>
    </div>

    <div class="group" id="customWrap" style="display:none">
      <label for="customTuning">自定义音位表（左 → 右，音名+八度）</label>
      <textarea id="customTuning" style="min-height:64px"></textarea>
    </div>

    <div class="group">
      <label for="modeSel">读谱方式</label>
      <select id="modeSel">
        <option value="movable">首调模式 · 1 对齐中心键（推荐）</option>
        <option value="fixed">固定调模式 · 按调号算实际音高</option>
      </select>
    </div>

    <div class="group row3">
      <button class="btn" id="btnBack" title="将当前琴谱反向导出为简谱文本，并填回「简谱输入」框，可直接在此基础上继续修改">↩ 谱面转换</button>
      <button class="btn" id="btnFit">⤢ 移调</button>
      <button class="btn primary" id="btnParse">↻ 生成琴谱</button>
    </div>

    <div class="group">
      <details class="spec" id="foldJianpu" open>
        <summary>简谱输入</summary>
        <div class="body">
          <textarea id="src" spellcheck="false"></textarea>

          <details class="spec spec-sub">
            <summary>简谱语法速查</summary>
            <div class="body">
              <table>
                <tr><td>1 2 3 4 5 6 7</td><td>音级（1 = 调号主音）</td></tr>
                <tr><td>0</td><td>休止符，不弹</td></tr>
                <tr><td>.1 &nbsp; ..1</td><td>低八度 / 低两个八度</td></tr>
                <tr><td>1' &nbsp; 1''</td><td>高八度 / 高两个八度</td></tr>
                <tr><td>#4 &nbsp; b7</td><td>升号 / 降号</td></tr>
                <tr><td>1_ &nbsp; 1__</td><td>八分音符 / 十六分音符</td></tr>
                <tr><td>1.</td><td>附点（时值 ×1.5）；若后面紧跟别的音，请加空格：<kbd>5. 6</kbd></td></tr>
                <tr><td>1- &nbsp; -</td><td>延长一拍（延音线），可写在音符后，也可单独写</td></tr>
                <tr><td>6_5_ &nbsp; 1232</td><td>连写：一个空格里可以写好几个音</td></tr>
                <tr><td>[1 3 5]</td><td>同一拍同时弹（双音 / 滑音）</td></tr>
                <tr><td>|</td><td>小节线</td></tr>
                <tr><td># 或 //</td><td>整行注释</td></tr>
              </table>
              <p class="tiny" style="margin-top:8px">
                文件头指令（每行一条）：<br>
                <kbd>title: 曲名</kbd> <kbd>key: 1=C</kbd> <kbd>meter: 4/4</kbd> <kbd>tempo: 66</kbd><br>
                <kbd>tuning: 17</kbd>（琴型 17/21） <kbd>mode: movable</kbd>（首调/固定调）<br>
                <kbd>direction: up</kbd>（从下往上/从上往下） <kbd>transpose: 0</kbd>（移调半音数）<br>
                ★ 后四条「谱面转换」会自动写出来，点「生成琴谱」时自动加载回去。<br>
                多条谱行 = 多个声部，按小节与拍位自动对齐合并（主旋律 + 伴奏写两行即可）。
              </p>
            </div>
          </details>
        </div>
      </details>
    </div>

    <div class="group">
      <details class="spec" id="foldMidi">
        <summary>MIDI 导入</summary>
        <div class="body">
          <p class="tiny">导入 .mid / .midi 文件，自动识别主旋律所在通道，按实际音高映射到琴键。识别不对时可在下方切换通道，谱子会重新生成。</p>
          <div class="row3" style="margin-top:8px">
            <button class="btn" id="btnMidiFile">⤓ 选择 MIDI</button>
          </div>
          <input type="file" id="midiFile" accept=".mid,.midi,audio/midi,audio/x-midi" style="display:none">
          <p class="tiny" id="midiMsg" style="margin-top:8px"></p>
          <div id="midiChWrap" style="display:none; margin-top:10px; font-size:12.5px; color:var(--ink2);">
            <div id="midiChRows"></div>
          </div>
        </div>
      </details>
    </div>

    <div class="group">
      <details class="spec" id="foldXml">
        <summary>MusicXML 导入</summary>
        <div class="body">
          <p class="tiny">把 MuseScore / Guitar Pro 等导出的谱导入，按实际音高映射到琴键；超出音域的琴键点「⤢ 移调」调整。支持 .xml 与压缩的 .mxl，自动识别 UTF-8 / UTF-16 / GBK 编码。</p>
          <label class="tog" style="margin-top:10px"><input type="checkbox" id="xmlMain" checked> 仅保留主旋律</label>
          <div class="row3" style="margin-top:8px">
            <button class="btn" id="btnXmlFile">⤓ 选择文件</button>
            <button class="btn" id="btnXmlSample">载入示例</button>
          </div>
          <input type="file" id="xmlFile" accept=".xml,.mxl,application/xml" style="display:none">
          <p class="tiny" id="xmlMsg" style="margin-top:8px"></p>
        </div>
      </details>
    </div>
  </aside>

  <section class="panel right">
    <div class="toolbar">
      <div class="seg" id="dirSeg">
        <button data-v="up" class="on">时间 ↑ 从下往上</button>
        <button data-v="down">时间 ↓ 从上往下</button>
      </div>
      <div class="seg" id="unitSeg">
        <button data-v="auto" class="on">精度 自动</button>
        <button data-v="0.5">八分</button>
        <button data-v="0.25">十六分</button>
      </div>
      <button class="btn" id="btnEdit">✎ 点选编辑</button>
      <div class="seg" id="durSeg">
        <button data-v="4">全</button>
        <button data-v="2">二分</button>
        <button data-v="1" class="on">四分</button>
        <button data-v="0.5">八分</button>
        <button data-v="0.25">十六分</button>
      </div>
      <div class="spacer"></div>
      <label class="tog"><input type="checkbox" id="optDegree"> 简谱对照</label>
      <label class="tog"><input type="checkbox" id="optMark" checked> 深色长条</label>
      <div class="togCol">
        <label class="tog" title="仅用于预览打印时的分页位置；导出与打印始终按页分段"><input type="checkbox" id="optPaged"> 分页预览</label>
        <button class="btn" id="btnAttach" title="标题 / 作者进每页页眉；作者链接生成二维码、附加信息竖排 —— 二者与「读谱方向」「logo 占位」一起排在每页右侧的信息栏里。改动只在「分页预览」下看得见版式效果">附加设置</button>
      </div>
      <span class="badge" id="stat"></span>
    </div>
    <div class="workRow">
      <div class="stageWrap">
        <div class="stage" id="stage"><div id="svgHost"></div><div id="axisBar" title="点某一列可试听该琴键 · 深色块 = 轨道底色（与谱面同一套深浅规则）· 灰色音名 = 本曲没用到的琴键"></div></div>
        <div id="progBar" title="播放进度：灰色 = 已经播过的一段 · 深色游标 = 当前进度 · 按住上下拖动可跳到任意位置（拖动时会自动暂停，并显示当前位置的时间）。上往下读时进度自上而下走，自下往上读则相反（与谱面同向）。"><div class="trk"><div class="fil"></div><div class="thm"></div></div><div class="tip"><b></b><span></span></div></div>
      </div>
      <aside id="attach" aria-label="附加设置">
        <div class="atHead"><span>附加设置</span><span class="spacer"></span><button class="atX" id="btnAttachClose" title="收起" aria-label="收起附加设置">×</button></div>
        <div class="atBody">
          <label class="atF"><span>标题</span><input id="atTitle" type="text" placeholder="默认取谱面里的曲名"></label>
          <label class="atF"><span>作者</span><input id="atAuthor" type="text" placeholder="默认空"></label>
          <label class="atF"><span>作者链接</span><input id="atLink" type="text" placeholder="默认空"></label>
          <label class="atF"><span>附加信息</span><textarea id="atNote" placeholder="默认空"></textarea></label>
          <div class="atQR" id="atQR">
            <div class="qrBox" id="qrBox"></div>
            <div class="qrEmpty" id="qrEmpty">输入作者链接可预览</div>
            <div class="qrUrl" id="qrUrl"></div>
          </div>
          <div class="atHint">标题 / 作者印在每页页眉；二维码与附加信息排在每页右侧的信息栏（勾「分页预览」即可看到版式）。</div>
        </div>
      </aside>
    </div>
    <div class="warnbox" id="warnbox"></div>
    <div class="legend" id="legend"></div>
  </section>
</main>

</div>
</template>

<style>
.wb-host{
  --bg:#F9F7F5; --panel:#FFFFFF; --ink:#3E2B1E; --ink2:#8A7A6D; --ink3:#B3A79A;
  --line:#EDE7DE; --line2:#E5DCC9; --accent:#5D4432; --accent2:#EFE7DE;
  --warn:#C05A3E; --warn-bg:#FBEDE6; --dot:#3E2B1E; --radius:10px;
}
.wb-host *{box-sizing:border-box}

.wb-host{min-height:100vh;
  background:var(--bg); color:var(--ink);
  font:14px/1.55 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wb-host button,.wb-host select,.wb-host textarea,.wb-host input{font-family:inherit;font-size:13px;color:inherit}
.wb-host h1,.wb-host h2,.wb-host h3,.wb-host p,.wb-host ul{margin:0}

/* ---------- 顶栏 ---------- */
.top{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:14px 20px; background:var(--panel); border-bottom:1px solid var(--line);
  position:sticky; top:0; z-index:20;
}
.brand{display:flex; align-items:center; gap:12px}
.logo{
  width:36px; height:36px; border-radius:9px; background:var(--accent2); color:var(--accent);
  display:grid; place-items:center; font-size:18px; flex:none;
}
.brand h1{font-size:15px; font-weight:650; letter-spacing:.2px}
.brand p{font-size:12px; color:var(--ink3)}
.actions{display:flex; gap:8px; flex-wrap:wrap}
.wb-host .btn{
  border:1px solid var(--line2); background:#fff; color:var(--ink2);
  padding:7px 13px; border-radius:8px; cursor:pointer; white-space:nowrap;
  transition:.14s background,.14s color,.14s border-color;
}
.wb-host .btn:hover{background:#EFE7DE; color:var(--ink)}
.wb-host .btn.primary{background:var(--accent); border-color:var(--accent); color:#fff}
.wb-host .btn.primary:hover{background:#4A3627}
.wb-host .btn.on{background:var(--accent2); border-color:#DDD2C4; color:var(--accent)}
.wb-host .btn:disabled{opacity:.4; cursor:not-allowed}
/* 复位按钮：只在「暂停且进度>0」时出现，插在播放按钮左边（默认 display:none 不占位，
   所以没进度时播放按钮左边不会留一块空白） */
.wb-host .btn.icon{display:none; align-self:stretch; align-items:center; justify-content:center; padding:6px 12px; line-height:0}
.wb-host .btn.icon svg{display:block}
.wb-host .btn.icon.on{display:inline-flex}
/* 速度（BPM）：全曲唯一的播放速度源。
   ★ 存在的理由：扫描谱（Audiveris / PhotoScore 出的 MusicXML）整份**没有任何速度标记**，
   物理上无法知道原曲多快 —— 这时只能落到默认 88 BPM，用户听感就是「太慢」。
   所以给一个显式入口：改这里 = 改 ST.grid.meta.tempo，播放（rowSec）、页眉的
   「88 BPM」、反向导出简谱的 tempo: 行三处同时跟着变，不会各说一套。
   高度靠 align-self:stretch 撑到与相邻按钮齐平（和 .btn.icon 同款处理）。 */
.bpm{
  display:inline-flex; align-items:center; gap:5px; align-self:stretch;
  font-size:11.5px; color:var(--ink2); white-space:nowrap;
  border:1px solid var(--line2); border-radius:8px; padding:0 10px; background:#fff;
}
.bpm input{
  /* 宽度只够 2~3 位数、居中：早先给 44px 右对齐时「88」被推到框右侧，
     与左边的「速度」之间空出一大截（实测 21px，≈1.8 个字），看着像两个互不相干的元素。
     居中后左右各留一点空白，读起来是「速度 88 BPM」一个整体。 */
  width:26px; border:0; background:transparent; color:var(--ink); font:inherit;
  text-align:center; padding:0; outline:none;
  appearance:textfield; -moz-appearance:textfield;
}
.bpm input::-webkit-outer-spin-button,
.bpm input::-webkit-inner-spin-button{-webkit-appearance:none; margin:0}
.bpm input:focus{color:var(--accent)}

/* ---------- 布局 ---------- */
.main{display:flex; align-items:flex-start; gap:0; min-height:calc(100vh - 66px)}
.panel{background:var(--panel)}
.left{
  width:392px; flex:none; border-right:1px solid var(--line); padding:18px;
  position:sticky; top:66px; max-height:calc(100vh - 66px); overflow:auto;
}
.right{flex:1; min-width:0; padding:18px 22px 60px}

/* ---------- 表单 ---------- */
.group{margin-bottom:16px}
.group>label{display:block; font-size:12px; font-weight:600; color:var(--ink2); margin-bottom:6px}
select,input[type=text],textarea{
  width:100%; border:1px solid var(--line2); background:#fff; border-radius:8px;
  padding:8px 10px; outline:none; transition:.15s border-color,.15s box-shadow;
}
select:focus,input:focus,textarea:focus{border-color:#E5DCC9; box-shadow:0 0 0 3px #EFE7DE}
/* 「目前识别为【…】通道」里的内联下拉：宽度自适应、不占满整行 */
select.inline{
  width:auto; display:inline-block; max-width:190px; padding:3px 6px;
  font-size:12px; font-weight:600; color:var(--accent); vertical-align:baseline;
}
/* MIDI 通道行：每行一个下拉，行尾一个纯图标按钮（＋ 新增 / － 移除），悬停才变色 */
.chLine{margin-top:5px; white-space:nowrap}
.chLine:first-child{margin-top:0}
/* ★ 两行的前缀字数不同（「目前识别为」5 字 / 「新增通道」4 字），不撑齐的话两个【
   左缘会差一个字宽、看着像没对齐 —— 给短的那个补齐到 5 字宽（12.5px 字号下 ≈ 62.5px）。 */
.chLead{display:inline-block; min-width:63px}
.iconbtn{
  border:none; background:none; padding:2px 3px; margin-left:4px; cursor:pointer;
  color:#8A7A6D; vertical-align:-4px; line-height:0; border-radius:5px;
  transition:.15s color,background-color;
}
.iconbtn:hover{color:var(--accent); background:#EFE7DE}
.iconbtn[disabled]{color:#E5DCC9; cursor:default; background:none}
.iconbtn.chDel{color:#8A7A6D}
.chIcon{width:13px; height:13px; display:block}
textarea{
  min-height:270px; resize:vertical; font:12.5px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  white-space:pre; overflow-wrap:normal; overflow-x:auto;
}
.row2{display:grid; grid-template-columns:1fr 1fr; gap:10px}
.row3{display:flex; flex-wrap:wrap; gap:8px}
.row3 .btn{flex:1 1 auto; min-width:96px; text-align:center}
.tiny{font-size:11.5px; color:var(--ink3); line-height:1.7}
kbd{
  background:#F9F7F5; border:1px solid var(--line2); border-bottom-width:2px; border-radius:4px;
  padding:0 4px; font:11px/1.6 ui-monospace,Menlo,Consolas,monospace; color:var(--ink2);
}
details.spec{border:1px solid var(--line); border-radius:8px; padding:0 10px; background:#FFFFFF}
details.spec>summary{cursor:pointer; font-size:12px; font-weight:600; color:var(--ink2); padding:9px 0; outline:none}
details.spec .body{padding:2px 0 12px; border-top:1px dashed var(--line)}
details.spec table{width:100%; border-collapse:collapse; font-size:11.5px}
details.spec td{padding:3px 0; vertical-align:top; color:var(--ink2)}
details.spec td:first-child{width:96px; color:var(--ink); font-family:ui-monospace,Menlo,Consolas,monospace}
/* 嵌套在「简谱输入」里的子折叠块：虚线细框、无底色，弱化层级 */
details.spec.spec-sub{border:1px dashed var(--line); background:transparent; margin-top:10px}

/* ---------- 谱面工具条 ---------- */
.toolbar{
  display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px;
  padding-bottom:12px; border-bottom:1px solid var(--line);
}
.toolbar .seg{display:flex; border:1px solid var(--line2); border-radius:8px; overflow:hidden}
.toolbar .seg button{border:0; background:#fff; padding:6px 11px; cursor:pointer; color:var(--ink2); font-size:12.5px}
.toolbar .seg button+button{border-left:1px solid var(--line2)}
.toolbar .seg button.on{background:var(--accent2); color:var(--accent); font-weight:600}
/* 时值选择（全/二分/四分…）只在「点选编辑」开启时才有意义：
   未开启时整组压灰 + 真禁用，避免点了没反应还不知道为什么 */
.toolbar .seg.off{opacity:.5; border-color:var(--line)}
.toolbar .seg.off button{cursor:not-allowed}
.toolbar .seg.off button.on{background:#F9F7F5; color:var(--ink3)}
.toolbar label.tog{display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink2); cursor:pointer; user-select:none}
/* 「附加设置」按钮要落在「分页预览」的**正下方**（用户 2026-09-17）：
   把这两个包进一个纵向 flex，按钮就永远贴在它下面，不受工具条其它元素影响。 */
.toolbar .togCol{display:flex; flex-direction:column; align-items:flex-start; gap:5px}
.toolbar .spacer{flex:1}
.stage{
  background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px;
  /* ★ height:100% = 「跟着 .stageWrap 的高度走」，而不是「按内容长」。
     只靠 .workRow 的 flex stretch 是拉不平的：stretch 拉的是**弹性子项**
     （.stageWrap 与 #attach），而 .stage 是 .stageWrap 里的普通块。
     预览比侧栏高时看不出来（侧栏被拉平），**一旦侧栏比预览高（短谱 / 空谱）就不跟了**
     —— 1440 视口下实测差 53.8px。配上两边共用的 max-height，任何情况都等高。 */
  height:100%; overflow:auto; max-height:calc(100vh - 190px);
}
.stage.edit-mode{border-color:#DDD2C4; box-shadow:inset 0 0 0 1px #EFE7DE}
#svgHost svg{display:block}
/* 分页视图：一页 = 一个 .pg 块（内含本页整张 SVG），页与页之间靠外边距隔开。
   打印时由 @media print 换成强制分页 —— 绝不能让浏览器去切「一整张超长图」，
   它的切点是按纸张高度硬算的，会落在页中间：第 3 页顶部的内容会跑到第 2 页底部。 */
/* ⚠️ width:max-content 是必须的：.pg 默认按容器宽度撑开，而里面的 SVG 是固定纸宽
   （17 键 670 / 21 键 703）—— 容器比纸窄时纸的框就只围住左半张、右半张裸在框外；
   容器比纸宽时框又比纸宽出一截。写 max-content 让框**永远正好贴合纸张**。 */
#svgHost .pg{margin:0 0 12px; outline:1px solid var(--line); width:max-content}
#svgHost .pg:last-child{margin-bottom:0}
/* 悬浮音位轴：钉在预览区底部，滚到哪儿都能看见音名。
   左右不留 padding、不用边框（改用 box-shadow 描边），才能和谱面的轨道列严格对齐。 */
#axisBar{
  position:sticky; bottom:5px; z-index:6; width:max-content; display:none;
  margin-top:8px; padding:5px 0 4px; border-radius:10px;
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  box-shadow:0 0 0 1px #EDE7DE, 0 8px 18px rgba(27,27,25,.08);
  cursor:pointer; user-select:none;
}
#axisBar.on{display:block}
#axisBar svg{display:block}
/* 点选编辑时让开鼠标，别把「在底部几行点格子」抢成试听 */
.stage.edit-mode #axisBar{pointer-events:none}

/* ---------- 竖向播放进度条（用户 2026-09-17 定稿）----------
   位置：**贴着滚动条左边**、浮在谱面之上 —— 既不占谱面位置，也不随谱面滚走，
   与悬浮音位轴同属「钉在预览区」的浮层（用户原话「跟音名一样悬浮在曲谱上」）。
   灰色 = **已经播过**的一段，浅色 = 还没播的，深色小游标 = 当前进度所在。
   ⚠️ 条内位置一律用百分比表达（见 syncProg）：播放的 rAF 每帧都会写它，
      一帧读一次布局会反复触发重排。 */
/* flex:1 1 auto = 在 .workRow 里占满「侧栏之外」的全部宽度（见下方「附加设置侧栏」） */
.stageWrap{position:relative; min-width:0; flex:1 1 auto}
#progBar{
  /* ⚠️ top/bottom 必须写：绝对定位 + 里面全是 position:absolute 的子元素 → 不写就是 0 高
     （探针第一次跑就是「条高 0px」，页面上根本看不见这条） */
  position:absolute; top:10px; bottom:10px; right:0; z-index:7; width:10px; display:none;
  /* 可拖：按住上下拖 = 跳到那个进度（见 syncProg 下面那段「拖动进度条」）。
     整条只有 10px 宽，但它落在预览区右侧留白上，不会挡住谱面网格与编辑命中。 */
  pointer-events:auto; cursor:grab; touch-action:none; user-select:none;
  border-radius:6px; background:rgba(255,255,255,.92);
  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  box-shadow:0 0 0 1px #EDE7DE, 0 6px 16px rgba(27,27,25,.08);
}
#progBar.on{display:block}
#progBar.drag{cursor:grabbing}
#progBar .trk{position:absolute; left:3px; right:3px; top:5px; bottom:5px;
  border-radius:2px; background:rgba(27,27,25,.06)}
#progBar .fil{position:absolute; left:0; right:0; border-radius:2px; background:#B3A79A}
#progBar .thm{position:absolute; left:50%; width:10px; height:3px; margin-left:-5px;
  border-radius:2px; background:#3E2B1E; transform:translateY(-50%)}
/* 拖动中：游标加粗一点点，给个「抓住了」的反馈（不改位置映射，纯视觉） */
#progBar.drag .thm{height:5px}
/* 拖动时的时间气泡（用户 2026-09-17 追加）。
   ⚠️ 挂在条的**左边**（right:100%+8px）：条的右边就是预览区边缘，出去会被截掉一半。
   ⚠️ 纵向位置不在这里猜 —— 由 progTip 直接把 .thm 的 style.top 抄过来，
      所以 up / down 两个方向都不用分支（少一份方向映射的拷贝，就少一处能漂的地方）。
   贴住游标的那 10px 越界不用担心：条上下各留 10px，气泡半个身位正好落在预览区内。 */
#progBar .tip{
  position:absolute; right:calc(100% + 8px); top:0; transform:translateY(-50%);
  padding:2px 6px; border-radius:5px; white-space:nowrap; pointer-events:none;
  font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.2px; font-variant-numeric:tabular-nums;   /* 数字等宽 → 拖动时气泡不会左右抖 */
  background:#3E2B1E; color:#fff; box-shadow:0 2px 8px rgba(27,27,25,.18);
  opacity:0; transition:opacity .12s ease;
}
#progBar.drag .tip{opacity:1}
#progBar .tip b{font-weight:650; color:#fff}                  /* 当前时间 */
#progBar .tip span{color:rgba(255,255,255,.6)}                /* 「 / 总时长 」 */

/* ---------- 附加设置侧栏（用户 2026-09-17）----------
   位置：**谱面预览区（连同它右边的滚动条）的右边**，与预览区并排、**等高**。
   ★ 为什么必须另起 .workRow 包一层，而不是把侧栏塞进 .stageWrap：
     #progBar 是 .stageWrap 内绝对定位 right:0 的浮层，JS 还会按
     「滚动条净宽 + 右边框 + 5px 缝」去写它的 right（见 progPlace）。
     把侧栏塞进 .stageWrap，条的定位上下文就被撑到侧栏右缘 —— 条会跑到侧栏**右边**去。
     所以 .stageWrap 只装「谱面 + 条」，侧栏做它的**兄弟节点**。
   ★ 等高怎么保证：.workRow 是 flex 行 + align-items:stretch，两个子项各自再受
     同一个 max-height 上限（.stage 本来就有）——
     于是「谁高谁定行高，另一个自动拉平」，**不需要 JS 去同步像素**。
   ⚠️ 这些字段**目前只落在侧栏里**，还没接到底部打印页脚（用户明确说先不做）。
      以后真要印页脚，请从 attachVals() 取值，别另开一份状态。 */
.workRow{display:flex; align-items:stretch; gap:10px; min-width:0}
#attach{
  flex:0 0 224px; display:none; flex-direction:column; min-width:0;
  background:var(--panel); border:1px solid var(--line); border-radius:12px;
  max-height:calc(100vh - 190px);      /* 与 .stage 同一个上限 → 两者永远等高 */
  overflow:hidden;                      /* 圆角要裁住内部滚动区，否则滚动时方角会戳出来 */
}
#attach.on{display:flex}
#attach .atHead{
  flex:none; display:flex; align-items:center; gap:8px;
  padding:9px 10px 9px 12px; border-bottom:1px solid var(--line);
  font-size:12.5px; font-weight:600; color:var(--ink);
}
#attach .atHead .spacer{flex:1}
#attach .atX{
  flex:none; border:0; background:transparent; cursor:pointer; color:var(--ink3);
  font-size:15px; line-height:1; padding:2px 5px; border-radius:5px;
}
#attach .atX:hover{background:#F9F7F5; color:var(--ink)}
#attach .atBody{
  flex:1 1 auto; overflow:auto; padding:12px;
  display:flex; flex-direction:column; gap:11px;
}
#attach .atF{display:flex; flex-direction:column; gap:5px; font-size:11.5px; color:var(--ink3)}
#attach input[type=text],#attach textarea{
  width:100%; padding:6px 8px; border:1px solid var(--line2); border-radius:7px;
  font-size:12.5px; line-height:1.6; font-family:inherit;
  color:var(--ink); background:#fff;
}
#attach input[type=text]:focus,#attach textarea:focus{
  outline:none; border-color:var(--accent); box-shadow:0 0 0 2px var(--accent2);
}
/* ⚠️ 全局那条 textarea 规则是给「简谱输入」写死的（min-height:270px + 等宽 + white-space:pre），
   不覆盖掉的话「附加信息」会被撑到 270px 高，直接把侧栏顶穿。 */
#attach textarea{
  min-height:54px; max-height:150px; resize:vertical;
  white-space:pre-wrap; overflow-wrap:anywhere; overflow-x:hidden;
}
#attach .atHint{margin-top:auto; padding-top:6px; font-size:11px; color:var(--ink3); line-height:1.65}
/* ---------- 作者链接二维码（用户 2026-09-17）----------
   「附加信息」下方。链接为空 / 不合法时不通铺一个空白方块，而是**换成一句提示**
   —— 否则用户看到一个空框，不知道是自己没填还是功能坏了。 */
#attach .atQR{
  display:flex; flex-direction:column; align-items:center; gap:7px;
  padding:10px 10px 9px; border:1px solid var(--line); border-radius:9px; background:#fff;
}
#attach .atQR .qrBox{
  width:128px; height:128px; flex:none;
  display:none; align-items:center; justify-content:center;
}
#attach .atQR .qrBox svg{width:100%; height:100%; display:block; border-radius:3px}
#attach .atQR.on .qrBox{display:flex}
#attach .atQR .qrEmpty{
  font-size:11.5px; color:var(--ink3); text-align:center; line-height:1.7;
  padding:22px 4px;
}
#attach .atQR.on .qrEmpty{display:none}
#attach .atQR .qrUrl{
  display:none; font-size:10.5px; color:var(--ink3); text-align:center; line-height:1.5;
  word-break:break-all; max-width:100%;
}
#attach .atQR.on .qrUrl{display:block}
.badge{font-size:11.5px; color:var(--ink3)}
.warnbox{
  margin-top:14px; background:var(--warn-bg); border:1px solid #FBEDE6; color:var(--warn);
  border-radius:9px; padding:10px 13px; font-size:12.5px; display:none;
}
.warnbox.on{display:block}
.warnbox b{font-weight:650}
.legend{margin-top:16px; display:flex; gap:22px; flex-wrap:wrap}
.legend .item{display:flex; align-items:center; gap:8px; font-size:12px; color:var(--ink2)}
.legend svg{flex:none}
/* 明确打印纸张为 A4 —— 否则浏览器默认按 Letter 排版，
   一页 32 行（1002px ≈ 265mm）会被挤成两页、第二页只剩几行 */
@page{size:A4; margin:12mm}
@media print{
  .top,.left,.toolbar,.legend,.warnbox{display:none !important}
  .main{display:block}
  .right{padding:0}
  .stage{border:0; padding:0; max-height:none; overflow:visible}
  /* 附加设置侧栏是**界面**，不进打印。以后要把它的内容做成页脚，是另写页脚，
     不是把这个侧栏印出来。 */
  .workRow{display:block}
  #attach{display:none !important}
  #axisBar{display:none !important}
  #progBar{display:none !important}
  /* 一页一块、块尾强制分页：分页点由我们说了算，不再让浏览器去切超长图。
     最后一块要撤掉 break-after，否则末尾会多出一张空白页。 */
  #svgHost{margin:0}
  #svgHost .pg{margin:0; outline:0; break-after:page; page-break-after:always}
  #svgHost .pg:last-child{break-after:auto; page-break-after:auto}
}
</style>
