/* =====================================================================
   build_offline.js —— 由内核模块生成「单 HTML 离线版」
   ---------------------------------------------------------------------
   产物：public/offline/kalimba-tab.html
     内联样式 + 内联脚本 + 内联字体子集，双击即用，断网完整可用（WBS 3.2）。

   为什么不走 Vite 打包：
     离线版要和「源文件」逐字对得上才有意义 —— 打包器会引入变量重命名、
     模块包装、polyfill 等一堆语义噪音，产物一旦对不上就没人能判断是
     「搬家搬错了」还是「打包器干的」。这里只做一件事：
       **按依赖序把模块正文拼成一个经典 <script>**（去掉 import/export 两种语句）。
     于是「离线版 vs 原 index.html」的差异可以被回归探针直接量化。

   为什么用**经典脚本**而不是 type="module"：
     原 index.html 的 7 个 <script> 都是经典脚本（非严格模式）。
     用 module 会切到严格模式，可能改变既有行为（隐式全局、this 绑定、
     重复形参等），而本轮的目标是「一行逻辑不改」。经典脚本 = 原语义。

   用法：node tools/build_offline.js [源 index.html] [输出 html]
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.resolve(ROOT, '..', '..', 'kalimba-tab', 'index.html');
const OUT = process.argv[3] || path.resolve(ROOT, 'public', 'offline', 'kalimba-tab.html');
const KDIR = path.resolve(ROOT, 'src', 'kernel');

/* 装配序 = 依赖序：被依赖的在前。循环依赖（parser ↔ studio 等）在这里无害 ——
   合并成一个作用域后，函数声明整体提升，跨模块调用都发生在运行期。 */
const ORDER = ['foundation', 'state', 'core', 'parser', 'layout', 'renderer',
  'editor', 'player', 'exporter', 'studio'];

const html = fs.readFileSync(SRC, 'utf8');

/* ---------- 1. 拆出 HTML 外壳与脚本块 ---------- */
const blocks = [];
{
  const re = /<script id="(s-[a-z]+)">[\s\S]*?<\/script>\n?/g;
  let m;
  while ((m = re.exec(html))) blocks.push({ id: m[1], start: m.index, end: m.index + m[0].length });
}
if (blocks.length !== 7) throw new Error('预期 7 个 <script id="s-*">，实到 ' + blocks.length);
const shell = html.slice(0, blocks[0].start) + '\u0000KERNEL\u0000' + html.slice(blocks[blocks.length - 1].end);

/* ---------- 2. 拼内核正文 ---------- */
const stripEsm = (code, file) => {
  let out = code
    .split('\n')
    .filter(l => !/^\s*import\s+[\s\S]*from\s+['"][^'"]+['"];\s*$/.test(l)
      && !/^\s*export\s*\{[^}]*\};\s*$/.test(l)
      && !/^\s*export\s+default\s/.test(l))
    .join('\n');
  const bad = out.split('\n').filter(l => /^\s*(import|export)\s/.test(l));
  if (bad.length) throw new Error(file + ' 仍有未剥离的 ESM 语句：\n' + bad.slice(0, 3).join('\n'));
  return out;
};

const parts = [];
const manifest = [];
for (const id of ORDER) {
  const f = path.join(KDIR, id + '.js');
  if (!fs.existsSync(f)) throw new Error('缺少内核模块 ' + id + '.js，先跑 npm run kernel:extract');
  const src = fs.readFileSync(f, 'utf8');
  const body = stripEsm(src, id + '.js');
  parts.push(
    '/* ================= ' + id + '.js ================= */\n' + body.trim() + '\n');
  manifest.push({ id, bytes: Buffer.byteLength(body, 'utf8'), lines: body.split('\n').length });
}

/* studio 的 init() 是被 P1 特意移出模块的 —— 离线版在这里把它接回来，
   时机与原文件完全一致（所有段都执行完之后）。 */
const kernel = parts.join('\n') + '\n/* ===== 装配收尾：原 s-ui 末尾的 init() 调用 ===== */\ninit();\n';

/* ---------- 3. 落盘 ---------- */
const out = shell.replace('\u0000KERNEL\u0000', () => '<script>\n' + kernel + '<\/script>');
if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');

const sha = crypto.createHash('sha256').update(out).digest('hex').slice(0, 16);
console.log('源文件：', SRC);
console.log('模块装配序：', ORDER.join(' → '));
console.log('');
console.log('模块          行数      字节');
console.log('--------------------------------');
for (const m of manifest) console.log('  ' + m.id.padEnd(12) + String(m.lines).padStart(5) + String(m.bytes).padStart(10));
console.log('');
console.log('产物：', OUT);
console.log('大小：', Buffer.byteLength(out, 'utf8'), '字节（', (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1), 'KB ）');
console.log('sha256:', sha);
console.log('');
console.log('说明：本产物与 kalimba-tab/index.html 的差异应当**只有**脚本的组织方式。');
console.log('      以它为源跑 D:\\kalprobe\\kal_reg_all.js，断言数与失败数应与原文件一致。');
