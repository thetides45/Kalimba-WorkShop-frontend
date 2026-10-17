# 制谱内核构建工具链 · Kalimba Tab Kernel

> 把**单文件制谱器**（`kalimba-tab/index.html`）拆成可维护的 ES 模块，再产出**离线单文件版**，
> 最终派生出社区站点里的**在线制谱页**。

本仓库是 `kalimba-workshop` 工程的**构建期工具链**，不参与运行时：
不含任何运行时依赖，**不需要 `npm install`**——三个脚本只用 Node 内置模块。

---

## 一、三个仓库的分工

| 仓库 | 职责 | 地址 |
|---|---|---|
| **frontend**（本仓库） | 制谱内核的构建链：提取内核模块 → 生成离线单文件 → 派生在线制谱页 → 逐字节校验产物链 | 当前仓库 |
| **web-vue** | 社区前端站点：页面、路由、状态、接口层、PWA；**承载**本仓库产出的 `composer.html` | <https://github.com/thetides45/Kalimba-WorkShop-web-vue> |
| **backend** | REST 服务端：账号、帖子、评论、互动、附件、审核 | <https://github.com/thetides45/Kalimba-WorkShop-backend> |

```
kalimba-tab/index.html（唯一真源，手写单文件）
  └─[kernel:extract]→ src/kernel/*.js                    本仓库
       └─[offline:build]→ public/offline/kalimba-tab.html  本仓库
            └─[sync_composer]→ web-vue/public/composer.html 在线制谱页
```

- **本仓库不参与运行时**：线上制谱页是**自包含单文件**（内核已内联、0 个外链 script），
  跑前端只需要 `web-vue` 仓库。
- **但它是这条链的唯一存在处**：删掉本仓库，就再也无法重新生成 `composer.html`。
- 制谱功能本身（解析、排版、渲染、播放、导出）全部发生在浏览器里，**后端不参与制谱计算**。

> **沿革**：本目录原先是社区门户的 Vue 3 SPA，2026-10-07 前端主线切走后整体下线，
> 只保留这条内核构建链。Vue 时代的页面与组件可在**本仓库的 git 历史**中找回。

---

## 二、产物链

```
kalimba-tab/index.html                                      唯一真源（单文件，手写）
  └─[kernel:extract]→ src/kernel/*.js                       10 个模块（自动生成，勿手改）
       └─[offline:build]→ public/offline/kalimba-tab.html   单 HTML 离线版
            └─[sync_composer]→ ../web-vue/public/composer.html   线上制谱页
```

⚠️ **顺序不能颠倒**，且**内核一改就必须从第一步开始**：`build_offline.js` 的输入是**两路**——
**外壳**读真源 `index.html`、**内核正文**读 `src/kernel/*.js`。跳过第一步会静默得到
「新外壳 + 旧内核」。

```bash
node tools/extract_kernel.js      # ① 真源 → src/kernel/*.js
node tools/build_offline.js       # ② (外壳 + 内核) → public/offline/kalimba-tab.html
cd .. && node tools/sync_composer.js   # ③ 离线产物 → web-vue/public/composer.html
node tools/verify_offline.js      # ④ 逐字节校验整条链，退出码 0/1
```

`package.json` 里对应的脚本名是 `kernel:extract` / `offline:build` / `offline:verify`
（`sync_composer` 在上一层工程的 `tools/`，不在本仓库内）。

### 真源的位置

`kalimba-tab/index.html` 是**工程外的同级目录**（与本仓库的父目录 `kalimba-workshop/` 平级），
所以只 clone 本仓库无法直接跑通第 ①、② 步。两种做法：

```bash
# 用参数指定真源与输出
node tools/extract_kernel.js /path/to/kalimba-tab/index.html
node tools/build_offline.js /path/to/kalimba-tab/index.html

# 或按默认约定，把 kalimba-tab/ 放在工程父目录下
```

`extract_kernel.js` 支持 `--dry`，只打印将要提取的块，不写文件。

---

## 三、目录结构

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

## 四、为什么离线版不走打包器

这是本项目一个刻意的工程取舍：

`tools/build_offline.js` **只做一件事**——按依赖序把内核模块正文拼成一个经典
`<script>`（去掉 `import` / `export` 语句），不压缩、不重命名、不做模块包装。

理由：

- 离线版必须能和源文件**逐字对得上**，否则出问题时无法判断是「搬家搬错了」还是「打包器干的」。
  打包器引入的变量重命名、模块包装、polyfill 都是语义噪音。
- 输出**经典脚本**而不是 `type="module"`：真源的 7 个 `<script>` 都是经典脚本（非严格模式），
  换成 module 会切到严格模式，可能改变隐式全局、`this` 绑定等既有行为。
- 因此「离线产物 vs 源文件」的差异是**可直接 diff 的**。但也正因为这里**没有打包器替我们记录依赖**，
  产物**是否最新不会被自动保证**——用 `verify_offline.js` 逐字节比对（判据是**内容**，不看时间戳）。

### `verify_offline.js` 的两个设计约束

- ⚠️ **它不「重跑构建再比对」**：脚本运行环境可能无法 spawn 外部程序，
  所以它是在**进程内把期望结果原样重建**再比对。代价：`build_offline.js` /
  `sync_composer.js` 的变换逻辑一改，本脚本的**镜像段落必须同步改**
  （真源 script 块数异常时它会先报错退出，不会给错判）。
- ⚠️ 它把「外壳旧了」与「内核正文旧了」**分开报**，并给出首差行号与期望/实际片段；
  支持 `--offline=<路径>` / `--composer=<路径>` 便于自检。

`extract_kernel.js` 的注释里写明了跨模块循环依赖的处理方式（读用 ESM 活绑定）。
文件尾登记着与原文件的全部差异（补丁 `P1/P2`），跑完会打印命中情况。

---

## 五、产物消费方：接口与约定

产物 `composer.html` 被 `web-vue` 站点以 iframe 承载，配合后端的接口约定如下
（完整说明见 [web-vue README](https://github.com/thetides45/Kalimba-WorkShop-web-vue)）：

```json
{ "code": 0, "message": "ok", "data": {} }
```

- `code !== 0` 视为失败
- 认证令牌放在 **`sa-token` 自定义头**（不是 `Authorization: Bearer`）
- `code === 2001` 表示未登录 / 令牌过期
- 错误码分区：`1xxx` 参数与通用、`2xxx` 认证与用户、`3xxx` 内容、`4xxx` 互动、`5xxx` 文件、`6xxx` 管理

**乐谱 JSON 是唯一交换载体**：本地制谱 ↔ 社区发布走同一份 `serialize` / `deserialize`，
所以内核的导出格式一旦变更，会同时影响站点里的谱面预览与试听。

---

## 六、已知待办

- [ ] **缺少单元测试**。目前依赖上层工程的端到端冒烟脚本覆盖联调，
      以及本仓库 `verify_offline.js` 守产物链一致性。
- [ ] **产物链仍无自动门禁**：`verify_offline.js` 有了，但没人把它挂进流水线；
      改内核后仍靠人记得跑。
- [ ] **真源不在仓库内**：`kalimba-tab/index.html` 需另行准备，新人 clone 后无法零配置跑通构建。

---

## 七、相关链接

- 前端站点（Vue 3）：<https://github.com/thetides45/Kalimba-WorkShop-web-vue>
- 后端服务（Spring Boot）：<https://github.com/thetides45/Kalimba-WorkShop-backend>

---

本项目为个人独立开发的完整产品实践，长期在生产级使用中迭代（当前数据量为演示规模）。
欢迎通过 Issue 交流制谱、谱面排版或乐谱格式转换的话题。
