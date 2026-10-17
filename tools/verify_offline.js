/* =====================================================================
   verify_offline.js —— 离线产物链一致性校验（`npm run offline:verify`）
   ---------------------------------------------------------------------
   校验整条产物链每一跳都和真源对得上：
     kalimba-tab/index.html              唯一真源（单文件，手写）
       └─[extract_kernel]→ src/kernel/*.js
            └─[build_offline]→ public/offline/kalimba-tab.html
                 └─[sync_composer]→ ../web-vue/public/composer.html

   为什么要这个脚本：
     离线版**故意不走 Vite 打包**（只按依赖序把模块正文拼成一个经典 <script>），
     好处是「产物 vs 源文件」可直接 diff，代价是**没有任何东西自动保证产物是最新的**。
     2026-10-06 就踩了这个坑：真源已是 `100vh - 209px`，而 offline 产物与
     线上制谱页还停在 `190px`，落后一个版本。
     （当时线上制谱页是 `web/composer.html`；2026-10-10 前端主线切到 Vue 版后，
      该派生文件的落点改为 `web-vue/public/composer.html`。）

   实现要点（⚠️ 别改回去「重跑构建再比对」）：
     本机 Node **不能 spawn 任何外部程序**（execFileSync/spawnSync 一律 EBUSY），
     所以这里不调用 build_offline.js，而是**在进程内把期望结果原样重建一遍**再比对。
     重建逻辑是 build_offline.js / sync_composer.js 的**镜像**：那两处一改动，
     本文件必须同步改（下面对应段落都有标记）。

   ④ 重提取对比（2026-10-13 补，堵住产物链**根部**的缺口）：
     ② ③ 两段的期望值都是**读 src/kernel 重建**出来的 —— 也就是拿 src/kernel
     验它自己。于是「src/kernel 是不是当前真源的提取产物」这一跳从来没被验过：
     改了真源的 <script> 块却忘了跑 kernel:extract，只要之后重建过离线产物，
     门禁照样全绿。现在补上：在**临时目录**重跑一次提取，再与仓库 src/kernel 逐文件比。
     ⚠️ 同样受「不能 spawn」限制，所以走**进程内动态 import** 生成器，并给它一套
        临时 argv（否则它会按默认值把结果写回仓库的 src/kernel/，自己覆盖自己）。
        extract_kernel.js 的输出不含时间戳、是确定性的，这条对比才有意义。

   判定口径：**内容为准，不看时间戳**。「新鲜」= 重建结果与磁盘产物逐字节相同。

   用法：
     node tools/verify_offline.js
     node tools/verify_offline.js [源 index.html]
     node tools/verify_offline.js --offline=<产物> --composer=<派生文件>   # 用于自检
   退出码：0 = 全部一致；1 = 有不一致（可直接用作 CI 门禁）。
   ===================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of args) {
  const m = /^--([a-z-]+)=(.*)$/.exec(a);
  if (m) flags[m[1]] = m[2]; else positional.push(a);
}

const SRC = positional[0] ? path.resolve(positional[0])
  : path.resolve(ROOT, '..', '..', 'kalimba-tab', 'index.html');
const KDIR = path.resolve(ROOT, 'src', 'kernel');
const OFFLINE = flags.offline ? path.resolve(flags.offline)
  : path.resolve(ROOT, 'public', 'offline', 'kalimba-tab.html');
const COMPOSER = flags.composer ? path.resolve(flags.composer)
  : path.resolve(ROOT, '..', 'web-vue', 'public', 'composer.html');

/* ---- 镜像 build_offline.js：装配序（被依赖的在前）---- */
const ORDER = ['foundation', 'state', 'core', 'parser', 'layout', 'renderer',
  'editor', 'player', 'exporter', 'studio'];

/* ---- 镜像 build_offline.js：7 个内核 script 块 ---- */
const SCRIPT_RE = /<script id="(s-[a-z]+)">[\s\S]*?<\/script>\n?/g;
const REAL_KERNEL_MARK_START = '<script>\n';
const REAL_KERNEL_MARK_END = '<\/script>';

/* ---- 镜像 sync_composer.js：**三处**注入 ----
   ⚠️⚠️ 这一节必须与 `kalimba-workshop/tools/sync_composer.js` 的对应常量**逐字符一致**
       （它是产物链的期望值）。那边每加/改一处注入，这里就得跟着改 ——
       2026-10-16 就漂过一次：sync 加了第三处（站内导航入口）与主题里的离线提示样式，
       而本文件还在按「两处」拼期望值，门禁于是报了一条假红。
       ⚠️ 为什么不直接 require 那边：① 本文件是 ESM、那边是 CJS；
       ② 更关键的是**那边不在 git 里**（在 kalimba-workshop/tools/，而本文件在 frontend/ 仓库），
          引它会让门禁在别人 checkout 后直接挂掉。所以只能镜像，靠这条注释维系同步。 */
const HEAD_ANCHOR = '<title>卡林巴转谱工坊 · 简谱 → 拇指琴专用谱</title>';
const HEAD_TAGS = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<meta name="theme-color" content="#5D4432">',
  '<link rel="icon" href="icons/icon-192.png" type="image/png">',
  '<link rel="apple-touch-icon" href="icons/icon-192.png">',
].join('\n');
const BODY_ANCHOR = '</script></body>';
const THEME = [
  '</script>',
  '<style>',
  '/* =====================================================================',
  '   V3 主题覆盖（拇指琴谷 · 木质暖色 + 珊瑚点缀）',
  '   —— 仅重定义 CSS 变量，不新增/修改任何规则，制谱功能零变化。',
  '      变量名沿用工作台原有令牌，故所有引用它们的样式自动换色。',
  '   ===================================================================== */',
  ':root{',
  '  --bg:#F9F7F5; --panel:#FFFFFF;',
  '  --ink:#3E2B1E; --ink2:#8A7A6D; --ink3:#B3A79A;',
  '  --line:#EDE7DE; --line2:#E5DCC9;',
  '  --accent:#5D4432; --accent2:#EFE7DE;',
  '  --warn:#C05A3E; --warn-bg:#FBEDE6; --dot:#3E2B1E;',
  '}',
  '/* ③ 站内导航入口的样式：复用 .btn 的底子，弱化成次要样式（不抢「播放 / 导出」的焦点）。 */',
  '.btn.back-site{background:transparent; border-color:transparent; color:var(--ink2);',
  '  text-decoration:none; display:inline-flex; align-items:center}',
  '.btn.back-site:hover{background:var(--accent2); color:var(--accent)}',
  '/* ③-b 离线降级提示（只在「地址栏是首页、却拿到制谱器」时出现，见下面脚本的说明） */',
  '.offline-tip-mask{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(62,43,30,.42);',
  '  display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}',
  '.offline-tip{background:var(--panel);color:var(--ink);border-radius:14px;padding:22px 24px;',
  '  max-width:420px;box-shadow:0 18px 48px rgba(62,43,30,.24)}',
  '.offline-tip .ot-t{font-size:15px;font-weight:650;margin-bottom:8px}',
  '.offline-tip .ot-d{font-size:13px;line-height:1.75;color:var(--ink2)}',
  '.offline-tip .ot-a{margin-top:16px;text-align:right}',
  '</style>',
  '<script>',
  '/* ③ 离线时把「回拇指琴谷」藏起来。',
  '   原因：断网点它会导航到首页，而 Service Worker 的离线降级又把首页交回本页',
  '   （首页 → composer.html，见 web-vue/public/sw.js 的 navigate 分支）—— 表现成「点了没反应」。',
  '   与其留一个死链接，不如直接藏掉；网络恢复（online 事件）再显示出来。',
  '   ⚠️ 这是**宿主环境**的判断：只有挂在站点里的这份产物才有「回门户」和「有没有网」的概念，',
  '      内核（双击即用的本地单文件）里没有，所以放注入层而不是内核。 */',
  '(function () {',
  '  /* 「本页是被离线降级跳来的」：地址栏停在站点首页，却拿到了制谱器。',
  '     有网时 SW 返回的是真正的首页；用户自己打开 /composer.html 时路径也不同 —— 判据很干净。',
  '     ⚠️ 不能只看 navigator.onLine：它不可靠（连着无网路由器时仍是 true，但请求全失败）。 */',
  '  var isRoot = (location.pathname === "/" || location.pathname === "/index.html");',
  '',
  '  /* ---------- 顶栏「回拇指琴谷」：离线或本页是被降级跳来的 → 藏掉 ----------',
  '     那种情况下点它会导航到首页，而 SW 又把首页交回本页（首页 → composer.html），',
  '     表现成「点了没反应」。与其留个死链接，不如藏掉；恢复联网（online 事件）再显示。',
  '     ⚠️ 这里用 `if (a) { ... }` 包住而**不是** `if (!a) return`：',
  '        下面还有弹窗要做 —— 别让「按钮没注入成功」把弹窗一起带走。 */',
  '  var a = document.getElementById("backSite");',
  '  if (a) {',
  '    var sync = function () {',
  '      a.style.display = (navigator.onLine === false || isRoot) ? "none" : "";',
  '    };',
  '    sync();',
  '    window.addEventListener("online", sync);',
  '    window.addEventListener("offline", sync);',
  '  }',
  '',
  '  /* ---------- 离线降级提示（2026-10-16 用户要求）---------- */',
  '  if (!isRoot) return;',
  '  var mask = document.createElement("div");',
  '  mask.className = "offline-tip-mask";',
  '  mask.setAttribute("role", "alertdialog");',
  '  mask.innerHTML = \'<div class="offline-tip">\'',
  '    + \'<div class="ot-t">离线模式</div>\'',
  '    + \'<div class="ot-d">检测到当前为离线模式，已自动跳转至预加载的制谱页。在联网时刷新即可回到首页。</div>\'',
  '    + \'<div class="ot-a"><button type="button" class="btn primary" id="otOk">知道了</button></div>\'',
  '    + \'</div>\';',
  '  document.body.appendChild(mask);',
  '  var okBtn = document.getElementById("otOk");',
  '  if (okBtn) okBtn.addEventListener("click", function () {',
  '    if (mask.parentNode) mask.parentNode.removeChild(mask);',
  '  });',
  '})();',
  '</script></body>',
].join('\n');
const ACTIONS_ANCHOR = '<div class="actions">';
const ACTIONS_WITH_BACK = [
  ACTIONS_ANCHOR,
  '    <!-- ★ 由 tools/sync_composer.js 注入，别手改本文件（下次同步会覆盖） -->',
  '    <a class="btn back-site" id="backSite" href="/" target="_top" title="回到拇指琴谷首页">← 回拇指琴谷</a>',
].join('\n');

/* ======================= 断言与报告 ======================= */
const rows = [];
let fails = 0;
const ok = (name, extra = '') => rows.push({ ok: true, name, extra });
const bad = (name, detail = '', hint = '') => {
  fails++;
  rows.push({ ok: false, name, extra: detail, hint });
};

/** 首个差异偏移 + 两行上下文，用于把「哪里旧了」说清楚。 */
function diffSpot(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return null;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40))
    .replace(/\\n/g, '\\n').slice(0, 160);
  const line = a.slice(0, i).split('\n').length;
  return { offset: i, line, aCtx: ctx(a), bCtx: ctx(b) };
}

function sameBytes(name, actual, expected, hint) {
  if (actual === expected) { ok(name, `${expected.length} 字节`); return true; }
  const spot = diffSpot(expected, actual);
  bad(name,
    spot ? `期望 ${expected.length} 字节 / 实际 ${actual.length} 字节，首差在第 ${spot.line} 行（偏移 ${spot.offset}）`
      : `期望 ${expected.length} 字节 / 实际 ${actual.length} 字节`,
    hint);
  if (spot) {
    rows.push({ ok: true, name: '    └ 期望片段', extra: spot.aCtx });
    rows.push({ ok: true, name: '    └ 实际片段', extra: spot.bCtx });
  }
  return false;
}

const stripEsm = (code, file) => {
  let out = code
    .split('\n')
    .filter(l => !/^\s*import\s+[\s\S]*from\s+['"][^'"]+['"];\s*$/.test(l)
      && !/^\s*export\s*\{[^}]*\};\s*$/.test(l)
      && !/^\s*export\s+default\s/.test(l))
    .join('\n');
  const leaves = out.split('\n').filter(l => /^\s*(import|export)\s/.test(l));
  if (leaves.length) throw new Error(file + ' 仍有未剥离的 ESM 语句：' + leaves.slice(0, 3).join(' | '));
  return out;
};

/* ======================= ① 真源与内核模块 ======================= */
if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到内核真源：' + SRC);
  process.exit(1);
}
const srcHtml = fs.readFileSync(SRC, 'utf8');

const blocks = [];
{
  const re = new RegExp(SCRIPT_RE.source, 'g');
  let m;
  while ((m = re.exec(srcHtml))) blocks.push({ id: m[1], start: m.index, end: m.index + m[0].length });
}
if (blocks.length === 7) ok('真源含 7 个 <script id="s-*"> 块', blocks.map(b => b.id).join(' '));
else bad('真源含 7 个 <script id="s-*"> 块', `实到 ${blocks.length} —— 构建设计被改动，请先同步本脚本的镜像逻辑`,
  '真源形状变了，build_offline.js 也会一样报错，先对齐两者');

/* 块数不对就到此为止：下面的「外壳 = 去掉 script 块的前后两段」会取到错位的边界，
   继续比下去只会产出**误导性**的结论（看着像产物坏了，其实是本脚本解析不了）。 */
if (blocks.length !== 7) {
  report();
  process.exit(1);
}

const shellPrefix = srcHtml.slice(0, blocks[0].start);
const shellSuffix = srcHtml.slice(blocks[blocks.length - 1].end);

const missing = ORDER.filter(id => !fs.existsSync(path.join(KDIR, id + '.js')));
if (missing.length) {
  bad('src/kernel/ 十个模块齐全', '缺少 ' + missing.join(', '), '先跑 npm run kernel:extract');
} else {
  ok('src/kernel/ 十个模块齐全', ORDER.join(' '));
}

/* 重建期望的内核正文（镜像 build_offline.js 第 2 段） */
let expectedKernel = null;
if (!missing.length) {
  const parts = [];
  const sizes = [];
  for (const id of ORDER) {
    const body = stripEsm(fs.readFileSync(path.join(KDIR, id + '.js'), 'utf8'), id + '.js');
    parts.push('/* ================= ' + id + '.js ================= */\n' + body.trim() + '\n');
    sizes.push(`${id}:${body.trim().split('\n').length}行`);
  }
  expectedKernel = parts.join('\n')
    + '\n/* ===== 装配收尾：原 s-ui 末尾的 init() 调用 ===== */\ninit();\n';

  if (/^\s*(import|export)\s/m.test(expectedKernel)) {
    bad('重建内核正文无残留 ESM 语句');
  } else {
    ok('重建内核正文无残留 ESM 语句', sizes.length + ' 个模块');
  }
  if (expectedKernel.trimEnd().endsWith('init();')) ok('内核收尾的 init() 装配调用在位');
  else bad('内核收尾的 init() 装配调用在位', '重建结果末尾不是 init();');
}

/* ======================= ② 离线产物 ======================= */
if (!expectedKernel) {
  report();
  process.exit(1);
}
const expectedOffline = shellPrefix + REAL_KERNEL_MARK_START + expectedKernel + REAL_KERNEL_MARK_END + shellSuffix;

if (!fs.existsSync(OFFLINE)) {
  bad('离线产物存在', OFFLINE, '先跑 npm run offline:build');
} else {
  const actualOffline = fs.readFileSync(OFFLINE, 'utf8');

  /* 先分离「外壳」与「内核正文」，好把「哪一跳旧了」说准（而不是只报一句整体不一致） */
  const headOk = actualOffline.slice(0, shellPrefix.length) === shellPrefix;
  const tailOk = actualOffline.endsWith(shellSuffix);

  if (headOk && tailOk) ok('离线产物：外壳（<style>/HTML）与真源逐字一致');
  else bad('离线产物：外壳（<style>/HTML）与真源逐字一致',
    `前段${headOk ? '一致' : '不一致'} / 后段${tailOk ? '一致' : '不一致'}`,
    '外壳旧了 —— build_offline.js 的外壳直接读真源，重跑 npm run offline:build 即可');

  if (headOk && tailOk) {
    const mid = actualOffline.slice(shellPrefix.length, actualOffline.length - shellSuffix.length);
    const expectedMid = REAL_KERNEL_MARK_START + expectedKernel + REAL_KERNEL_MARK_END;
    sameBytes('离线产物：合并脚本正文与重建结果逐字节一致', mid, expectedMid,
      '内核旧了 —— 先 npm run kernel:extract，再 npm run offline:build');
  }

  sameBytes('离线产物：整体逐字节一致', actualOffline, expectedOffline,
    '重跑 npm run offline:build');
}

/* ======================= ③ web-vue/public/composer.html 派生 ======================= */
if (!fs.existsSync(COMPOSER)) {
  bad('制谱页存在', COMPOSER, '先跑 node tools/sync_composer.js');
} else {
  const actualComposer = fs.readFileSync(COMPOSER, 'utf8');

  const headHits = expectedOffline.split(HEAD_ANCHOR).length - 1;
  const bodyHits = expectedOffline.split(BODY_ANCHOR).length - 1;
  const actionsHits = expectedOffline.split(ACTIONS_ANCHOR).length - 1;
  if (headHits === 1 && bodyHits === 1 && actionsHits === 1) ok('注入锚点在离线产物中各命中 1 次');
  else bad('注入锚点在离线产物中各命中 1 次',
    `title ${headHits} 次 / </script></body> ${bodyHits} 次 / <div class="actions"> ${actionsHits} 次`,
    '锚点漂移 —— sync_composer.js 会报错，先看它');

  const expectedComposer = expectedOffline
    .replace(HEAD_ANCHOR, HEAD_ANCHOR + '\n' + HEAD_TAGS)
    .replace(ACTIONS_ANCHOR, ACTIONS_WITH_BACK)
    .replace(BODY_ANCHOR, THEME);
  sameBytes('制谱页 = 离线产物 + PWA 头部 + 站内导航入口 + V3 主题（逐字节一致）',
    actualComposer, expectedComposer,
    '重跑 node tools/sync_composer.js');

  /* 幂等性：注入不该重复叠加 */
  const manifestN = actualComposer.split('rel="manifest"').length - 1;
  if (manifestN === 1) ok('制谱页未重复叠加注入', 'rel="manifest" ×1');
  else bad('制谱页未重复叠加注入', `rel="manifest" ×${manifestN}（应为 1）`, '该文件被重复注入，重跑 sync_composer.js');
}

/* ======================= ④ src/kernel 是否仍是当前真源的提取产物 =======================
   —— 产物链**根部**那一跳（真源 → src/kernel）。
   ② ③ 的期望值都由 src/kernel 重建而来，验不到这一跳；这里在临时目录重跑生成器补上。

   ⚠️ 只能在**本进程内**把生成器当模块跑（不能 spawn，见文件头），且必须先给它一套
      临时 argv —— 生成器的 OUTDIR 默认就是仓库的 src/kernel/，不动 argv 会自己覆盖自己。
      console.log 也要收走，否则它的分析报告会混进门禁输出。 */
const KFILES = ['_ns.js', ...ORDER.map(id => id + '.js')];
{
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kalverify-'));
  const tmpKernel = path.join(tmpRoot, 'kernel');
  const savedArgv = process.argv;
  const savedLog = console.log;
  const savedExit = process.exit;
  let extractErr = null;
  try {
    process.argv = [savedArgv[0], 'extract_kernel.js', SRC, tmpKernel];
    console.log = () => {};                       // 生成器报告不进门禁输出
    process.exit = (code) => {                    // 它内部有 process.exit(1)（跨模块重名时）
      throw new Error('extract_kernel 主动退出（code=' + code + '）');
    };
    await import(pathToFileURL(path.resolve(ROOT, 'tools', 'extract_kernel.js')).href
      + '?reverify=' + Date.now());               // query 绕过 ESM 模块缓存
  } catch (e) {
    extractErr = e;
  } finally {
    process.argv = savedArgv; console.log = savedLog; process.exit = savedExit;
  }

  if (extractErr) {
    bad('重提取：src/kernel 可由当前真源重新生成', extractErr.message,
      '生成器跑不通 —— 先直接跑 npm run kernel:extract 看它报哪一条补丁没命中');
  } else {
    ok('重提取：src/kernel 可由当前真源重新生成', KFILES.length + ' 个文件');
    const drifted = [];
    for (const f of KFILES) {
      const inRepo = path.join(KDIR, f), inTmp = path.join(tmpKernel, f);
      if (!fs.existsSync(inTmp)) { drifted.push(f + '（重提取未产出）'); continue; }
      if (!fs.existsSync(inRepo)) { drifted.push(f + '（仓库缺失）'); continue; }
      /* ⚠️ 必须读成 utf8 字符串：不带编码时 readFileSync 返回 Buffer，
         Buffer !== Buffer 是**引用比较**、恒为 true —— 会把所有文件都误报成漂移。 */
      if (fs.readFileSync(inRepo, 'utf8') !== fs.readFileSync(inTmp, 'utf8')) drifted.push(f);
    }
    if (!drifted.length) {
      ok('src/kernel/*.js 与重提取结果逐字节一致', KFILES.join(' '));
    } else {
      bad('src/kernel/*.js 与重提取结果逐字节一致',
        '漂移：' + drifted.join(', '),
        '内核正文旧了 —— 重跑 npm run kernel:extract → npm run offline:build → node ../tools/sync_composer.js');
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

report();

/* ======================= 报告 ======================= */
function report() {
  console.log('');
  console.log('离线产物链一致性校验');
  console.log('  真源      : ' + path.relative(ROOT, SRC).replace(/\\/g, '/'));
  console.log('  离线产物  : ' + path.relative(ROOT, OFFLINE).replace(/\\/g, '/'));
  console.log('  制谱页 : ' + path.relative(ROOT, COMPOSER).replace(/\\/g, '/'));
  console.log('');
  for (const r of rows) {
    if (r.ok) {
      console.log('  ✓ ' + r.name + (r.extra ? '  [' + r.extra + ']' : ''));
    } else {
      console.log('  ✗ ' + r.name);
      if (r.extra) console.log('      ' + r.extra);
      if (r.hint) console.log('      → ' + r.hint);
    }
  }
  console.log('');
  console.log('  时间戳仅供参考（内容才是判据）：');
  for (const [label, p] of [['真源', SRC], ['离线产物', OFFLINE], ['制谱页', COMPOSER]]) {
    if (fs.existsSync(p)) {
      console.log('    ' + label.padEnd(10) + fs.statSync(p).mtime.toISOString().replace('T', ' ').slice(0, 19) + '  ' + path.basename(p));
    }
  }
  console.log('');
  if (fails === 0) {
    console.log('★ 产物链一致：产物与真源逐字节对得上，无过期。 (' + rows.filter(r => r.ok && !r.name.startsWith('    ')).length + ' 项)');
    console.log('  （校验是「内容比对」，与文件时间戳无关）');
  } else {
    console.log(`✗ 发现 ${fails} 处不一致 —— 产物链已过期，按上面各条的 → 提示修复。`);
    console.log('  标准修复顺序：npm run kernel:extract → npm run offline:build → node ../tools/sync_composer.js');
  }
}
process.exit(fails === 0 ? 0 : 1);
