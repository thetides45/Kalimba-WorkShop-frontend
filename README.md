# 制谱内核构建工具链

`kalimba-tab/index.html`（单文件制谱器）的**构建期工具目录**。
不含任何运行时依赖，不需要 `npm install` —— 三个脚本只用 Node 内置模块。

> **沿革**：本目录原先是「卡林巴社区工坊前端」（Vue 3 + Vite + Pinia + vue-router 的 SPA）。
> 前端主线先是换成 V3 静态多页（`../web/`），2026-10-10 又换成 `../web-vue/` 的 Vue 3 重构版；
> 本目录的 SPA 已于 2026-10-07 整体下线，**只保留这条「制谱内核构建链」** ——
> 因为线上制谱页 `../web-vue/public/composer.html` 正是由它产出的。
> Vue 时代的页面与组件可在**本目录的 git 历史**中找回（远程仓库 `Kalimba-WorkShop-frontend`），
> 另有快照见 `../../BackUpDocument/vue-spa-removed-20261007/`。
>
> ⚠️ **本目录不参与运行时**：线上制谱页是**自包含单文件**（内核已内联、0 个外链 script），
> 跑前端只需要 `../web-vue/`。本目录只在「**要改内核**」时才需要 ——
> 但它**是这条链的唯一存在处**，删掉就再也无法重新生成 `composer.html`。

配套后端仓库：[Kalimba-WorkShop-backend](https://github.com/thetides45/Kalimba-WorkShop-backend)

---

## 产物链

```
kalimba-tab/index.html                                      唯一真源（单文件，手写）
  └─[kernel:extract]→ src/kernel/*.js                       10 个模块（自动生成，勿手改）
       └─[offline:build]→ public/offline/kalimba-tab.html   单 HTML 离线版
            └─[sync_composer]→ ../web-vue/public/composer.html   线上制谱页
```

⚠️ **顺序不能颠倒**，且**内核一改就必须从第一步开始**：`build_offline.js` 的输入是
**两路** —— **外壳**读真源 `index.html`、**内核正文**读 `src/kernel/*.js`。
跳过第一步会静默得到「新外壳 + 旧内核」。

```bash
node tools/extract_kernel.js      # ① 真源 → src/kernel/*.js
node tools/build_offline.js       # ② (外壳 + 内核) → public/offline/kalimba-tab.html
cd .. && node tools/sync_composer.js   # ③ 离线产物 → web-vue/public/composer.html
node tools/verify_offline.js      # ④ 逐字节校验整条链，退出码 0/1
```

`package.json` 里对应的脚本名是 `kernel:extract` / `offline:build` / `offline:verify`
（`sync_composer` 在上一层 `../tools/`，不在本目录）。

---

## 项目结构

```
src/
└─ kernel/            制谱内核（零依赖，纯函数式为主；全部自动生成）
   ├─ _ns.js            模块清单（文档性质，不参与运行）
   ├─ foundation.js     基础类型与工具
   ├─ state.js          乐谱模型与共享状态
   ├─ core.js           音高 / 音位映射（17 键 / 21 键）
   ├─ parser.js         简谱 / MIDI / MusicXML → 统一乐谱模型
   ├─ layout.js         分页与谱面布局计算
   ├─ renderer.js       SVG 谱面渲染（回传命中信息，支持点选改音）
   ├─ editor.js         编辑交互
   ├─ player.js         Web Audio 调度与播放高亮
   ├─ exporter.js       导出 SVG / PNG、ZIP 打包、二维码、打印
   └─ studio.js         工作台装配层（含 DOM 接线）

tools/                 构建期脚本（不参与运行时）
├─ extract_kernel.js     从单文件内核源提取出 src/kernel/*.js
├─ build_offline.js      生成单 HTML 离线版
└─ verify_offline.js     逐字节校验整条产物链

public/offline/        ② 的产物
```

---

## 为什么离线版不走打包器

这是本项目一个刻意的工程取舍，值得说明：

`tools/build_offline.js` **只做一件事**——按依赖序把内核模块正文拼成一个经典
`<script>`（去掉 `import` / `export` 语句），不压缩、不重命名、不做模块包装。

理由：

- 离线版必须能和源文件**逐字对得上**，否则出问题时无法判断是"搬家搬错了"
  还是"打包器干的"。打包器引入的变量重命名、模块包装、polyfill 都是语义噪音。
- 输出**经典脚本**而不是 `type="module"`：真源的 7 个 `<script>` 都是经典脚本
  （非严格模式），换成 module 会切到严格模式，可能改变隐式全局、`this` 绑定
  等既有行为。
- 因此"离线产物 vs 源文件"的差异是**可直接 diff 的**。但也正因为这里**没有打包器
  替我们记录依赖**，产物**是否最新不会被自动保证** —— 用 `verify_offline.js`
  逐字节比对（判据是**内容**，不看时间戳）。

### `verify_offline.js` 的两个设计约束

- ⚠️ **它不「重跑构建再比对」**：本机 Node 无法 spawn 外部程序（`EBUSY`），
  所以它是在**进程内把期望结果原样重建**再比对。代价：`build_offline.js` /
  `sync_composer.js` 的变换逻辑一改，本脚本的**镜像段落必须同步改**
  （真源 script 块数异常时它会先报错退出，不会给错判）。
- ⚠️ 它把「外壳旧了」与「内核正文旧了」**分开报**，并给出首差行号与
  期望/实际片段；支持 `--offline=<路径>` / `--composer=<路径>` 便于自检。

`extract_kernel.js` 的注释里写明了跨模块循环依赖的处理方式（读用 ESM 活绑定）。
文件尾登记着与原文件的全部差异（补丁 `P1/P2`），跑完会打印命中情况。

---

## 接口约定（V3 前端在用）

所有业务接口统一返回：

```json
{ "code": 0, "message": "ok", "data": {} }
```

- `code !== 0` 视为失败
- 认证令牌放在 **`sa-token` 自定义头**（不是 `Authorization: Bearer`）
- `code === 2001` 表示未登录 / 令牌过期

错误码分区（与后端一致）：`1xxx` 参数与通用、`2xxx` 认证与用户、`3xxx` 内容、
`4xxx` 互动、`5xxx` 文件、`6xxx` 管理。

V3 前端的接口层在 `../web/assets/api.js`（**不在本目录** —— 本目录已不含运行时前端代码）。

---

## 已知待办

- [ ] 缺少单元测试。目前依赖上层仓库 `../backend/tools/` 的端到端冒烟脚本覆盖联调
       （14 个脚本），以及本目录 `verify_offline.js` 守产物链一致性。
- [ ] 产物链**仍无自动门禁**：`verify_offline.js` 有了，但没人把它挂进任何流水线；
      改内核后仍靠人记得跑。

---

## 说明

本项目为个人独立开发的完整产品实践，长期在生产级使用中迭代
（当前数据量为演示规模）。欢迎通过 Issue 交流制谱、谱面排版或乐谱格式转换的话题。
