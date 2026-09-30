# 卡林巴社区工坊 · 前端

面向卡林巴琴（拇指琴）玩家的**制谱 + 分享社区**前端。包含两件东西：

1. **社区门户**——帖子、评论、收藏、关注、通知、综合搜索（Vue 3 单页应用）
2. **制谱内核**——简谱 / MIDI / MusicXML 解析、SVG 谱面排版、Web Audio 试听、
   SVG / PNG / ZIP 导出与二维码

配套后端仓库：[Kalimba-WorkShop-backend](https://github.com/thetides45/Kalimba-WorkShop-backend)

---

## 技术栈

| 层面 | 选型 |
|---|---|
| 框架 | Vue 3（`<script setup>`） |
| 构建 | Vite 5 |
| 路由 | Vue Router 4 |
| 状态 | Pinia |
| 持久化 | localStorage（令牌）+ IndexedDB（离线乐谱草稿） |
| 离线 | Service Worker + 单 HTML 离线产物 |

依赖极少是刻意的：内核部分**零外部依赖**，不引入乐谱库、不引入排版库、不引入音色库。

---

## 快速开始

```bash
npm install

# 开发模式（5173，/api 自动代理到后端 8080）
npm run dev
```

**前置条件**：后端已在 `8080` 运行，否则所有接口都会失败。
后端启动方式见其仓库 README（需要 MySQL；Redis 可选，缺省会自动降级）。

---

## 项目结构

```
src/
├─ kernel/            制谱内核（零依赖，纯函数式为主）
│  ├─ foundation.js     基础类型与工具
│  ├─ state.js          乐谱模型与状态
│  ├─ core.js           音高 / 音位映射（17 键 / 21 键）
│  ├─ parser.js         简谱 / MIDI / MusicXML → 统一乐谱模型
│  ├─ layout.js         分页与谱面布局计算
│  ├─ renderer.js       SVG 谱面渲染（回传命中信息，支持点选改音）
│  ├─ editor.js         编辑交互
│  ├─ player.js         Web Audio 调度与播放高亮
│  ├─ exporter.js       导出 SVG / PNG、ZIP 打包、二维码、打印
│  └─ studio.js         工作台装配层
├─ portal/            社区门户
│  ├─ pages/           首页 / 广场 / 详情 / 发布 / 个人 / 通知 / 登录 / 离线
│  ├─ components/      帖子卡片 / 谱面播放器 / 工作台容器
│  └─ api.js           接口封装（按领域分组：postApi / commentApi / interactionApi …）
├─ shared/
│  ├─ http.js          HTTP 客户端（统一令牌、统一拆 R 包、401 登出）
│  ├─ idb.js           IndexedDB 草稿箱（自动保存 / 多草稿 / 断点续编）
│  └─ scoreJson.js     乐谱 JSON 交换格式
├─ stores/auth.js      登录态
└─ router/index.js     路由表

tools/                 构建期脚本（不参与运行时）
├─ extract_kernel.js      从单文件内核源提取出 src/kernel/*.js
├─ extract_workbench.js   提取工作台装配层
└─ build_offline.js       生成单 HTML 离线版
```

---

## 两个构建产物

```bash
npm run build          # → dist/                        社区门户（SPA）
npm run offline:build  # → public/offline/kalimba-tab.html   单 HTML 离线版
npm run offline:verify # 校验产物链与真源逐字节一致（退出码 0/1，可作门禁）
```

### 为什么离线版不走 Vite 打包

这是本项目一个刻意的工程取舍，值得说明：

`tools/build_offline.js` **只做一件事**——按依赖序把内核模块正文拼成一个经典
`<script>`（去掉 `import` / `export` 语句），不压缩、不重命名、不做模块包装。

理由：

- 离线版必须能和源文件**逐字对得上**，否则出问题时无法判断是"搬家搬错了"
  还是"打包器干的"。打包器引入的变量重命名、模块包装、polyfill 都是语义噪音。
- 输出**经典脚本**而不是 `type="module"`：原始内核的 7 个 `<script>` 都是
  经典脚本（非严格模式），换成 module 会切到严格模式，可能改变隐式全局、
  `this` 绑定等既有行为。
- 因此"离线产物 vs 源文件"的差异是**可直接 diff 的**。但也正因为这里**没有打包器
  替我们记录依赖**，产物**是否最新不会被自动保证** —— 用 `npm run offline:verify`
  逐字节比对（判据是**内容**，不看时间戳）。

内核自身有 `npm run kernel:extract` / `workbench:extract` 用于从单文件内核源
反向生成模块化源码（内核最早是单 HTML 工具，模块化是后来的重构）。
`extract_kernel.js` 的注释里写明了跨模块循环依赖的处理方式（读用 ESM 活绑定）。

---

## 接口约定

所有业务接口统一返回：

```json
{ "code": 0, "message": "ok", "data": {} }
```

- `code !== 0` 视为失败，`shared/http.js` 会抛错并把 `code` 挂在 `Error` 上
- 认证令牌放在 **`sa-token` 自定义头**（不是 `Authorization: Bearer`），
  存于 `localStorage.kalimba_token`
- `code === 2001` 表示未登录 / 令牌过期 → 清令牌并跳登录页

错误码分区（与后端一致）：`1xxx` 参数与通用、`2xxx` 认证与用户、`3xxx` 内容、
`4xxx` 互动、`5xxx` 文件、`6xxx` 管理。

### 开发环境代理

`vite.config.js` 把 `/api` 代理到 `http://localhost:8080`，所以前端代码里
一律写相对路径 `/api/xxx`。**生产构建后没有代理**，需要同源部署或由
Nginx 转发 `/api`。

---

## 已知待办

- [x] **`tools/verify_offline.js` 已补齐（2026-10-06）**：`npm run offline:verify`
      现在能跑通，逐字节校验整条链（真源 → `src/kernel/*.js` →
      `public/offline/kalimba-tab.html` → `web/composer.html`），退出码 0/1。
      补它的直接动因是踩了一次坑：真源已改成 `100vh - 209px`，而离线产物与
      `web/composer.html`（V3 主线**线上制谱页**）还停在 `190px`，落后一个版本
      —— 而 `build_offline.js` 的"逐字内联"只保证**构建那一刻**对得上，
      不保证产物是最新的。另：本机 Node **不能 spawn 外部程序**（`EBUSY`），
      所以它是**在进程内重建期望结果再比对**，而不是"重跑构建再比"；
      `build_offline.js` / `sync_composer.js` 的变换逻辑若改动，本脚本的镜像段落须同步改。
- [ ] 三个 `vite.config.js.timestamp-*.mjs` 被误提交入库
      （`.gitignore` 第 141 行已忽略，但它们在最初的提交里就已跟踪，
      `.gitignore` 对已跟踪文件无效）→ 需 `git rm --cached`
- [ ] `ScorePlayer.vue` 只解析不发声（V3 多页前端的 `post.html` 已实现试听，
      Vue 侧未跟进）
- [ ] 缺少单元测试，目前依赖后端仓库的 14 个端到端冒烟脚本覆盖联调

---

## 说明

本项目为个人独立开发的完整产品实践，长期在生产级使用中迭代
（当前数据量为演示规模）。欢迎通过 Issue 交流制谱、谱面排版或乐谱格式转换的话题。
