# 剑网3掉落工坊发版流程与规范

本文是项目正式发版的统一操作与质量标准。每次发版都必须严格按本文执行；任何步骤未经检验不得跳过，严禁在未验证状态下创建发布标签。

---

## 1. 第一性原理与防错铁律 (First Principles & Anti-Mistake Rules)

### 1.1 资产唯一性与极简交付原则
- **用户心智第一**：普通玩家获取离线版时，需要的是一个解压后包含完整说明（`README.md`、`CHANGELOG.md`）和单文件网页的独立文件夹。**严禁在 GitHub Release 中额外上传散装单文件（如单个 `.html`）**，避免给玩家带来认知困惑。
- **全英文 ASCII 命名铁律**：GitHub Releases 底层 API 在接收非 ASCII 中文名称附件时，会因 Content-Disposition 编码解析导致文件名被严重截断（例如 `剑网3掉落工坊.html` 被截断为 `3.html`）。因此，**Release 资产列表中必须且仅允许挂载单一的标准全英文压缩包：`jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip`**。

### 1.2 本地与云端归档闭环原则
- **工程脚本内建**：为杜绝依赖人工记忆导致本地 `artifacts/` 目录遗漏，项目内建标准打包命令 `npm run package:artifacts`。每次发版前必须在本地执行该命令，确保本地 `artifacts/` 文件夹与 `.zip` 压缩包完整留档。

### 1.3 UI 视觉基线比对原则 (Baseline Diff)
- **拒绝破坏经典美学**：在对样式进行优化或修复时，**必须以最近一个稳定版的 Commit 作为视觉与 CSS 基线进行最小差异对比（Minimal Diff）**，严禁大面积替换或误删核心体系（如毛玻璃卡片 `.glass-panel`、浮动 `topbar`、`21px` 醒目标题与高光微光药丸）。

---

## 2. 版本号与目录版本

产品版本采用语义化版本号（Semantic Versioning）：

```text
vMAJOR.MINOR.PATCH
```

- `MAJOR`：产生不兼容变化，例如无法迁移的工作区、导出格式或公开接口变化。
- `MINOR`：向后兼容的新功能或功能范围扩展。
- `PATCH`：向后兼容的缺陷修复、性能优化、数据修正或文档修订。

产品版本与目录数据版本必须分开记录：
- 产品版本表示网页、领域模型、交互和导出能力，例如 `v1.2.1`。
- `catalogVersion` 表示目录快照（例如 `20260823-011b26367022`），不得用产品版本代替。目录更新可以独立于功能版本发布，也必须在更新日志和 `VERSION.json` 中写明。

---

## 3. Commit 与 Tag 规范

日常提交采用 Conventional Commits：
```text
feat: 增加等级快速生成规则
fix: 修复保护物品被加入出售表
perf: 延迟加载完整掉落目录
docs: 更新发版说明
test: 增加工作区迁移测试
chore: 更新依赖
release: v1.2.1
```

正式版本只使用带 `v` 的 annotated tag，格式为：
```powershell
git tag -a v1.2.1 -m "Release v1.2.1"
```

Tag 规则：
- 只在通过自动化检查和人工验收的正式发版提交上创建 tag。
- 不使用轻量 tag。
- 已发布 tag 不移动、不覆盖、不删除；发现问题时递增 `PATCH` 版本重新发布。

---

## 4. CHANGELOG 与 Release Notes 写法规范

根目录 `CHANGELOG.md` 遵循 Keep a Changelog 风格，顶部保留 `[Unreleased]`，正式版本按发布日期倒序排列。

### 4.1 编写原则与受众视角
- **普通玩家视角优先**：更新日志主要面向广大剑网3玩家，必须使用通俗易懂的大白话概括功能改进与缺陷修复，让普通玩家能一眼看懂本次版本带来的实际变化。
- **严禁内部审查标签**：**绝对不要在对外公开的 `CHANGELOG.md`、`RELEASE_NOTES.md` 或 GitHub Release 中出现 `P0/P1/P2/P3` 等内部审计级别标签**，也不要堆砌晦涩的代码实现细节或内部沟通代号。
- **保持结构自洽**：重点突出数据安全、交互体验、功能新增及修复重点，简洁有力。

---

## 5. 标准发版标准流水线 (SOP)

### 步骤 1：冻结范围
明确本次版本范围，所有未完成事项留在 `[Unreleased]` 中。

### 步骤 2：同步版本全链路
检查并同步以下 5 处版本信息：
1. `web/src/domain/constants.ts` 中的 `APP_VERSION`
2. `web/package.json` 与根目录 `package.json` 中的 `version`
3. `VERSION.json` 中的 `appVersion`、`catalogVersion`、`releasedAt` 和 `tag`
4. `CHANGELOG.md` 中的新版本条目与日期
5. `README.md` 中的当前版本

### 步骤 3：本地自动化全量检查
在项目根目录执行：
```powershell
npm --prefix web run check
```
必须确保类型检查、Lint、所有单元测试、Web 多文件打包及离线单文件打包 100% 通过。

### 步骤 4：生成本地 Artifacts 归档包（强制必做）
在根目录执行标准打包命令：
```powershell
npm run package:artifacts
```
验证本地 `artifacts/` 目录结构是否完整生成：
```text
artifacts/
├── 剑网3掉落工坊-vMAJOR.MINOR.PATCH/
│   ├── index.html
│   ├── CHANGELOG.md
│   ├── README.md
│   ├── LICENSE
│   ├── VERSION.json
│   └── RELEASE_NOTES.md
└── jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip
```

### 步骤 5：人工最小完整回归
1. 双击打开本地 `artifacts/剑网3掉落工坊-vMAJOR.MINOR.PATCH/index.html`，确认断网环境离线可用、Logo 图标完好、毛玻璃与悬浮卡片美学正常；
2. 验证工作区导入/导出、过滤、出售策略及互斥保护。

### 步骤 6：提交代码与创建 Tag
```powershell
git add .
git commit -m "release: vMAJOR.MINOR.PATCH"
git tag -a vMAJOR.MINOR.PATCH -m "Release vMAJOR.MINOR.PATCH"
```

### 步骤 7：推送至 GitHub
```powershell
git push origin main
git push origin vMAJOR.MINOR.PATCH
```

### 步骤 8：发布 GitHub Release 并上传唯一 zip 附件（闭环必做）
使用 GitHub CLI 创建正式公开 Release（注意：只上传单一全英文 zip 压缩包）：
```powershell
gh release create vMAJOR.MINOR.PATCH "artifacts/jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip" --title "剑网3掉落工坊 vMAJOR.MINOR.PATCH" --notes-file "artifacts/剑网3掉落工坊-vMAJOR.MINOR.PATCH/RELEASE_NOTES.md" --latest
```

---

## 6. 发版防漏闭环检查清单 (Release Checklist)

发版前必须逐项核对确认：
- [ ] 1. 5 处版本号与日期已同步（`constants.ts`、`package.json`、`VERSION.json`、`CHANGELOG.md`、`README.md`）；
- [ ] 2. 自动化检查 `npm --prefix web run check` 全绿通过；
- [ ] 3. 本地已执行 `npm run package:artifacts` 并生成了完整的 `artifacts/` 目录与 `.zip`；
- [ ] 4. 本地双击离线单文件验证过 Logo 正常、毛玻璃卡片与居中样式正常；
- [ ] 5. Git Commit 与 Annotated Tag 已推送到 GitHub；
- [ ] 6. GitHub Release 状态为 `Latest`，且**资产列表中仅包含且只包含单一的 `jx3-loot-forge-vX.Y.Z-offline.zip`**，无任何多余或截断附件。