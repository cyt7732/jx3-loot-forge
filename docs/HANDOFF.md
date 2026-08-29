# 剑网3掉落工坊 (JX3 Loot Forge) 审核与交接文档

> **文档版本**：v1.2.2-Audit-Handoff  
> **生成时间**：2026-08-30  
> **交接目标**：提供给团队与审核工具进行全面代码审核、架构评估与质量验收。

---

## 1. 项目概况与当前版本基线 (Project Baseline)

- **当前稳定版本**：`v1.2.2`（GitHub Release Latest）
- **数据目录快照**：`20260823-011b26367022`（丝路风语-260823，共 16,571 项掉落条目）
- **技术栈**：TypeScript + React 19 + Vite 8 + CSS Variables + Vitest
- **部署与分发地址**：
  - ⚡ **主在线镜像 (Cloudflare Pages)**：[https://jx3-loot-forge.pages.dev](https://jx3-loot-forge.pages.dev)
  - 🛡️ **备用在线镜像 (GitHub Pages)**：[https://cyt7732.github.io/jx3-loot-forge/](https://cyt7732.github.io/jx3-loot-forge/)
  - 📦 **GitHub Releases (唯一全英文 zip 资产)**：[https://github.com/cyt7732/jx3-loot-forge/releases/tag/v1.2.2](https://github.com/cyt7732/jx3-loot-forge/releases/tag/v1.2.2)
  - 📂 **本地离线单文件**：`根目录/剑网3掉落工坊.html` 及 `artifacts/剑网3掉落工坊-v1.2.2/index.html`

---

## 2. 近期核心演进与技术整改复盘 (Key Evolution & Technical Fixes)

### 2.1 界面视觉与 100% 经典毛玻璃美学复原
- **问题根因**：先前在处理宽屏居中时误重置了大块 CSS，导致顶部 Header 异化为全宽贴顶通栏、丢失了毛玻璃卡片（`.glass-panel`）通透质感，并将大标题从 `21px` 缩小至 `18px`。
- **整改结果**：
  - 100% 精确复原 `v1.2.0` 的悬浮居中 `topbar`（外层容器 `.app-shell` 最大宽度 1440px 配合 clamp 留白与水平 `margin: 0 auto;` 自适应，下方保留舒适留白）；
  - 完整复原高性能毛玻璃深色面板（`backdrop-filter: blur(...)`）、三点微光固定背景（`background-attachment: fixed`）；
  - 保持 `21px` 醒目大标题与精致高光版本号微光胶囊（`.version-pill` 与 `.data-version-pill`）；
  - 在保持经典美学的前提下，完美修复了 1080P/2K/4K 宽屏显示下的左右对称水平居中。

### 2.2 首屏字体性能非阻塞优化与鸿蒙字体平滑渲染
- **问题根因**：网络切片字体如果直接以阻塞方式同步引入，在弱网或首次加载时会阻塞首屏渲染，产生白屏或明显的布局抖动（FOIT/FOUT）。
- **整改结果**：
  - 采用异步非阻塞注入：`<link rel="stylesheet" href="..." media="print" onload="this.media='all'">`；
  - 配合 `font-display: swap` 与系统回退字体栈（`"HarmonyOS Sans SC", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei UI", sans-serif`）；
  - 实现首屏 0ms 延迟秒开，后台切片字体就绪后平滑过渡至鸿蒙字体。

### 2.3 离线单文件 Logo Base64 自动化可靠内嵌
- **问题根因**：Vite 8 编译器在打包混淆 JS 模块时，将部分路径识别为模板反引号字符串（`` `./logo.jpg` ``），简单的字符串替换未能命中，导致离线单文件在无网环境下图片失效破损。
- **整改结果**：
  - 升级 `web/scripts/build-offline.mjs`，使用全引号兼容正则 `/(["'`])\.\/logo\.jpg\1/gu` 进行精准 Base64 内联替换；
  - 增加构建断言（`assert`），一旦发现未内嵌成功的相对路径直接阻断构建。

### 2.4 策略区自适应与空状态卡片重构
- **整改结果**：
  - 彻底消除了副本未选时标题文案前后矛盾与冒号孤立折行语病；
  - 在未勾选任何副本时，主区呈现居中微光卡片，并提供【🏰 一键全选前尘老本】与【🎯 聚焦当前赛季】两大高频入口。

### 2.5 发版流程规范化与资产唯一性铁律
- **问题根因**：先前发版曾误将中文单文件作为附件上传，触发了 GitHub API 对非 ASCII 文件名的截断（被截断为 `3.html`），且散装文件造成用户认知混乱。
- **整改结果**：
  - 确立铁律：GitHub Release 资产中**仅且只允许挂载单一的全英文离线压缩包 `jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip`**；
  - 修正 `.github/workflows/ci-and-release.yml`，锁定上传单一 zip；
  - 新增本地标准打包命令 `npm run package:artifacts`，并全面更新了 [docs/RELEASE_PROCESS.md](file:///e:/Project/jx3-loot-forge/docs/RELEASE_PROCESS.md)，固化发版八步防漏检查清单。

---

## 3. 架构与工程规范 (Architecture & Tooling)

### 3.1 目录拓扑
```text
jx3-loot-forge/
├── .github/workflows/
│   ├── ci-and-release.yml    # CI 自动化检查与 Release 自动发布工作流
│   └── deploy-pages.yml      # GitHub Pages 静态多文件自动部署工作流
├── artifacts/                # 本地与发布产物归档
│   ├── 剑网3掉落工坊-v1.2.2/  # 包含离线 index.html、CHANGELOG、README、LICENSE、VERSION、RELEASE_NOTES
│   └── jx3-loot-forge-v1.2.2-offline.zip
├── docs/                     # 架构设计、发版流程与交接文档
│   ├── HANDOFF.md            # 本审核交接文档
│   └── RELEASE_PROCESS.md    # 标准发版流程与防漏清单 (SOP)
├── web/                      # 前端工程核心
│   ├── app/globals.css       # 经典毛玻璃与自适应全局样式
│   ├── scripts/
│   │   ├── build-offline.mjs # 单文件打包与 Base64 深度内联脚本
│   │   └── package-artifacts.mjs # 本地版本化产物打包脚本
│   ├── src/
│   │   ├── catalog/          # 掉落目录数据与检索适配
│   │   ├── domain/           # 领域模型、状态机与核心规则
│   │   ├── parser/           # 剑网3 .us.jx3dat 序列化/反序列化/GBK编码处理
│   │   ├── storage/          # LocalStorage 隔离、快照恢复与防崩溃防护
│   │   └── ui/               # React 视图层组件
│   └── tests/                # Vitest 单元测试集 (141 个用例)
├── CHANGELOG.md              # 面向普通玩家的通俗更新日志
├── package.json              # 根工程配置与 package:artifacts 脚本
├── VERSION.json              # 统一版本与快照元数据
└── 剑网3掉落工坊.html          # 根目录即开即用单文件离线版
```

### 3.2 构建命令与双模交付
1. **本地全量检查**：
   ```bash
   npm --prefix web run check
   # 串联执行: typecheck -> lint -> test (141 tests) -> build:web -> build:offline
   ```
2. **本地归档打包**：
   ```bash
   npm run package:artifacts
   # 自动读取 VERSION.json 生成 artifacts/ 目录及 .zip 压缩包
   ```
3. **双模交付形态**：
   - **Web 多文件版 (`web/dist/web/`)**：用于部署至 Cloudflare Pages / GitHub Pages，支持多 chunk 异步加载与浏览器长效缓存；
   - **Offline 单文件版 (`剑网3掉落工坊.html`)**：通过 `vite-plugin-singlefile` 与内联管线，将全量数据、CSS、JS、Base64 Logo 打包为单一独立的 HTML 文件，无需网络与本地服务器，双击即可离线使用。

---

## 4. 自动化测试与质量指标 (Test & Quality Status)

- **类型检查 (`tsc --noEmit`)**：0 错误，严格类型模式。
- **代码规范 (`eslint`)**：0 警告，0 错误。
- **单元测试覆盖 (`vitest`)**：
  - `tests/classification.test.ts`：49 tests（掉落分类与匹配规则）
  - `tests/catalog.test.ts`：13 tests（副本与首领层级索引）
  - `tests/config.test.ts`：11 tests（配置导入导出与互斥规则）
  - `tests/domain.test.ts`：4 tests（核心常量与数据校验）
  - `tests/workspace-lifecycle.test.ts`：64 tests（存储弹性、配额溢出隔离与只读保护）
  - **总计**：**141 个测试用例全部通过 (141 passed)**。

---

## 5. Codex 审核建议关注点 (Codex Review Focus Areas)

建议 Codex 在本轮代码审核中重点复核以下维度：

1. **样式与美学稳定性 (CSS & Visual Consistency)**：
   - 核验 `web/app/globals.css` 中的毛玻璃卡片、浮动 `topbar`、大标题 `21px`、微光药丸与背景渐变是否与 `v1.2.0` 经典规范保持 100% 一致，无冗余或冲突样式。
2. **离线单文件健壮性 (Offline Single-File Resilience)**：
   - 验证 `web/scripts/build-offline.mjs` 中的 Base64 正则替换与断言机制，确保无论 Vite 混淆为何种引号语法均能完全内联。
3. **发版合规与工作流防错 (Release Automation & SOP)**：
   - 核验 `.github/workflows/ci-and-release.yml` 与 `docs/RELEASE_PROCESS.md` 是否严格遵循单一全英文 zip 资产标准。
4. **数据安全与导出格式 (Data Safety & Export Compatibility)**：
   - 核验 `.us.jx3dat` 导出在 CP936/GBK 编码下的单行无 BOM 输出，以及自动出售与保护不出售的绝对互斥逻辑。

---

*文档已同步至代码库：`docs/HANDOFF.md`。*