/* =====================================================================
   verify_offline.js —— 离线产物链一致性校验（`npm run offline:verify`）
   ---------------------------------------------------------------------
   校验整条产物链每一跳都和真源对得上：
     kalimba-tab/index.html              唯一真源（单文件，手写）
       └─[extract_kernel]→ src/kernel/*.js
            └─[build_offline]→ public/offline/kalimba-tab.html
                 └─[sync_composer]→ ../web/composer.html

   为什么要这个脚本：
     离线版**故意不走 Vite 打包**（只按依赖序把模块正文拼成一个经典 <script>），
     好处是「产物 vs 源文件」可直接 diff，代价是**没有任何东西自动保证产物是最新的**。
     2026-10-06 就踩了这个坑：真源已是 `100vh - 209px`，而 offline 产物与
     web/composer.html（**V3 主线线上制谱页**）还停在 `190px`，落后一个版本。

   实现要点（⚠️ 别改回去「重跑构建再比对」）：
     本机 Node **不能 spawn 任何外部程序**（execFileSync/spawnSync 一律 EBUSY），
     所以这里不调用 build_offline.js，而是**在进程内把期望结果原样重建一遍**再比对。
     重建逻辑是 build_offline.js / sync_composer.js 的**镜像**：那两处一改动，
     本文件必须同步改（下面对应段落都有标记）。

   判定口径：**内容为准，不看时间戳**。「新鲜」= 重建结果与磁盘产物逐字节相同。

   用法：
     node tools/verify_offline.js
     node tools/verify_offline.js [源 index.html]
     node tools/verify_offline.js --offline=<产物> --composer=<派生文件>   # 用于自检
   退出码：0 = 全部一致；1 = 有不一致（可直接用作 CI 门禁）。
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  : path.resolve(ROOT, '..', 'web', 'composer.html');

/* ---- 镜像 build_offline.js：装配序（被依赖的在前）---- */
const ORDER = ['foundation', 'state', 'core', 'parser', 'layout', 'renderer',
  'editor', 'player', 'exporter', 'studio'];

/* ---- 镜像 build_offline.js：7 个内核 script 块 ---- */
const SCRIPT_RE = /<script id="(s-[a-z]+)">[\s\S]*?<\/script>\n?/g;
const REAL_KERNEL_MARK_START = '<script>\n';
const REAL_KERNEL_MARK_END = '<\/script>';

/* ---- 镜像 sync_composer.js：两处注入 ---- */
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
  '</style></body>',
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

/* ======================= ③ web/composer.html 派生 ======================= */
if (!fs.existsSync(COMPOSER)) {
  bad('V3 制谱页存在', COMPOSER, '先跑 node tools/sync_composer.js');
} else {
  const actualComposer = fs.readFileSync(COMPOSER, 'utf8');

  const headHits = expectedOffline.split(HEAD_ANCHOR).length - 1;
  const bodyHits = expectedOffline.split(BODY_ANCHOR).length - 1;
  if (headHits === 1 && bodyHits === 1) ok('注入锚点在离线产物中各命中 1 次');
  else bad('注入锚点在离线产物中各命中 1 次', `title 锚点 ${headHits} 次 / </script></body> 锚点 ${bodyHits} 次`,
    '锚点漂移 —— sync_composer.js 会报错，先看它');

  const expectedComposer = expectedOffline
    .replace(HEAD_ANCHOR, HEAD_ANCHOR + '\n' + HEAD_TAGS)
    .replace(BODY_ANCHOR, THEME);
  sameBytes('V3 制谱页 = 离线产物 + PWA 头部 + V3 主题（逐字节一致）', actualComposer, expectedComposer,
    '重跑 node tools/sync_composer.js');

  /* 幂等性：注入不该重复叠加 */
  const manifestN = actualComposer.split('rel="manifest"').length - 1;
  if (manifestN === 1) ok('V3 制谱页未重复叠加注入', 'rel="manifest" ×1');
  else bad('V3 制谱页未重复叠加注入', `rel="manifest" ×${manifestN}（应为 1）`, '该文件被重复注入，重跑 sync_composer.js');
}

report();

/* ======================= 报告 ======================= */
function report() {
  console.log('');
  console.log('离线产物链一致性校验');
  console.log('  真源      : ' + path.relative(ROOT, SRC).replace(/\\/g, '/'));
  console.log('  离线产物  : ' + path.relative(ROOT, OFFLINE).replace(/\\/g, '/'));
  console.log('  V3 制谱页 : ' + path.relative(ROOT, COMPOSER).replace(/\\/g, '/'));
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
  for (const [label, p] of [['真源', SRC], ['离线产物', OFFLINE], ['V3 制谱页', COMPOSER]]) {
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
