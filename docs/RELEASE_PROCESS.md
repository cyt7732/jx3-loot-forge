# 剑网3掉落工坊发版流程

本文是项目后续正式发版的统一操作标准。每次发版都应按本文执行；如果某一步无法完成，先记录原因并处理，不在未验证的状态下创建正式版本标签。

## 1. 版本号与目录版本

产品版本采用语义化版本号（Semantic Versioning）：

```text
vMAJOR.MINOR.PATCH
```

- `MAJOR`：产生不兼容变化，例如无法迁移的工作区、导出格式或公开接口变化。
- `MINOR`：向后兼容的新功能或功能范围扩展。
- `PATCH`：向后兼容的缺陷修复、性能优化、数据修正或文档修订。

产品版本与目录数据版本必须分开记录：

- 产品版本表示网页、领域模型、交互和导出能力，例如 `v0.1.0`。
- `catalogVersion` 表示目录快照，不得用产品版本代替。目录更新可以独立于功能版本发布，也必须在更新日志和 `VERSION.json` 中写明。

当前首版约定为：产品版本 `v0.1.0`，目录版本 `20260823-47ec717b1065`。

候选版本使用预发布标识，例如 `v0.2.0-rc.1`；候选版本未通过最终验收前，不得当作正式稳定版宣传或分发。

## 2. Commit 与 Tag 规范

日常提交采用 Conventional Commits：

```text
feat: 增加等级快速生成规则
fix: 修复保护物品被加入出售表
perf: 延迟加载完整掉落目录
docs: 更新发版说明
test: 增加工作区迁移测试
chore: 更新依赖
release: v0.2.0
```

常用类型包括 `feat`、`fix`、`perf`、`docs`、`test`、`chore` 和 `release`。提交说明写用户或维护者可以理解的变化；发版提交只同步版本号、`CHANGELOG.md`、README 当前版本、目录版本及必要的发布配置，不把未完成的新功能混入 `release:` 提交。

正式版本只使用带 `v` 的 annotated tag，格式为：

```powershell
git tag -a v0.1.0 -m "Release v0.1.0"
```

Tag 规则：

- 只在通过检查和人工验收的正式发版提交上创建 tag。
- 不使用轻量 tag。
- 已发布 tag 不移动、不覆盖、不删除；发现问题时递增 `PATCH` 版本重新发布，例如 `v0.1.1`。
- 候选版使用 `vMAJOR.MINOR.PATCH-rc.N`，例如 `v0.2.0-rc.1`。

## 3. CHANGELOG 与 Release Notes 写法规范

根目录 `CHANGELOG.md` 遵循 Keep a Changelog 风格，顶部保留 `[Unreleased]`，正式版本按发布日期倒序排列。每个版本只记录用户可感知或维护者需要关注的变化，不直接复制完整 commit 列表。

### 3.1 编写原则与受众视角
- **普通玩家视角优先**：更新日志主要面向广大剑网3玩家，必须使用通俗易懂的大白话概括功能改进与缺陷修复，让普通玩家能一眼看懂本次版本带来的实际变化。
- **严禁内部审查标签**：**绝对不要在对外公开的 `CHANGELOG.md`、`RELEASE_NOTES.md` 或 GitHub Release 中出现 `P0/P1/P2/P3` 等内部审计级别标签**，也不要堆砌晦涩的代码实现细节或内部沟通代号。
- **保持结构自洽**：重点突出数据安全、交互体验、功能新增及修复重点，简洁有力。

### 3.2 分类规范
可使用的分类如下，按内容需要保留：

- `Added`：新增能力。
- `Changed`：已有能力或交互的变化。
- `Fixed`：缺陷修复。
- `Performance`：启动、加载、渲染或导出性能变化。
- `Data`：目录快照、数据来源或数据统计变化。
- `Known Limitations`：已知限制，不能把规划中的能力写成已完成。

发版前把已完成的 `[Unreleased]` 条目移动到新版本，并补充日期；空分类可以保留以保持结构一致。每条应说明影响和结果，必要时注明迁移、兼容性或数据目录版本。

## 4. 标准发版流程

### 4.1 冻结范围

明确本次版本包含和不包含的内容，冻结功能范围。所有未完成事项留在 `[Unreleased]` 或单独的开发计划中，不在发版提交中临时扩大范围。

### 4.2 同步版本信息

检查并同步以下位置：

- `web/package.json` 的产品版本。
- 页面或领域常量中的产品版本（如项目当前存在对应常量）。
- `README.md` 的当前版本和首版能力说明。
- `CHANGELOG.md` 的版本、日期、已完成条目和已知限制。
- `VERSION.json` 的 `appVersion`、`catalogVersion`、`releasedAt` 和 `tag`。

产品版本和目录版本必须与实际发布内容一致；不要为填充字段捏造哈希、时间或统计数据。

### 4.3 自动检查

在项目根目录执行：

```powershell
npm --prefix web ci
npm --prefix web run check
```

`check` 至少应覆盖类型检查、Lint、单元测试、在线构建和离线构建。若项目脚本发生变化，发版记录中写明实际执行的等价命令及结果。任何失败都必须修复或明确阻止发版，不以人工观察替代自动检查。

### 4.4 人工验收

使用发布构建进行最小完整回归：

- 启动网页并确认首屏可打开、关键操作可用。
- 选择目录范围，修改物品状态并确认刷新后工作区仍存在。
- 验证跳过拾取、自动出售、保护不出售三状态及自动出售/保护不出售互斥。
- 验证批量规则、自定义物品、已有 `.us.jx3dat` 导入（合并/替换预览）和工作区备份/恢复。
- 导出 `.us.jx3dat`，检查文件名、后缀、单行格式、CP936/GBK 编码、无 BOM 以及内容正确。
- 构建并双击离线 `index.html`，在断网条件下检查编辑、持久化和导出。
- 检查数据统计、版本信息和已知限制说明与本次发布记录一致。

### 4.5 提交与创建 Tag

确认工作区仅包含本次版本变更后执行：

```powershell
git status
git add .
git commit -m "release: v0.1.0"
git tag -a v0.1.0 -m "Release v0.1.0"
git status
```

创建 tag 前必须确认版本提交和工作区状态正确。后续版本将命令中的版本号替换为实际版本；tag 创建后不得移动或覆盖。

### 4.6 准备发布产物与压缩包打包规范

每个正式版本必须准备规范的产物目录与离线分发压缩包：

1. **产物目录结构**：
   在 `artifacts/` 下建立带产品名与版本号的顶层目录，例如 `artifacts/剑网3掉落工坊-vMAJOR.MINOR.PATCH/`，放入以下 6 个文件：

   ```text
   剑网3掉落工坊-vMAJOR.MINOR.PATCH/
   ├─ index.html
   ├─ CHANGELOG.md
   ├─ README.md
   ├─ LICENSE
   ├─ VERSION.json
   └─ RELEASE_NOTES.md
   ```

2. **压缩包打包规范**：
   * **全英文命名**：分发压缩包统一命名为 `jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip`（例如 `jx3-loot-forge-v0.2.1-offline.zip`）。**禁止使用中文文件名作为压缩包或 Release 附件名**，防止在跨系统、浏览器下载或 GitHub API / CLI 上传时发生编码截断与乱码。
   * **包含顶层文件夹**：压缩包**最外层必须包含该目录本身**，确保用户解压后是一个完整的 `剑网3掉落工坊-vMAJOR.MINOR.PATCH` 文件夹，避免解压时散落一地文件。
   * **打包命令示例**（PowerShell）：
     ```powershell
     Compress-Archive -Path 'artifacts/剑网3掉落工坊-v0.2.1' -DestinationPath 'artifacts/jx3-loot-forge-v0.2.1-offline.zip' -Force
     ```

### 4.7 推送与发布 GitHub Release（强制固定动作）

> **【强制固定动作】**：只要用户下达发版并推送到 GitHub 的指令，**在 GitHub 远端创建正式 Release 并上传离线分发压缩包（`jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip`）是必须同步执行的固定闭环动作**。只推送 Git commit/tag 而遗漏 GitHub Release 属于发版未完成。

1. **推送代码与标签**：
   ```powershell
   git push origin main
   git push origin vMAJOR.MINOR.PATCH
   ```

2. **创建 GitHub Release 并上传附件（固定动作）**：
   使用 GitHub CLI 创建正式 Release，并只上传单一的标准英文命名离线压缩包（**注意**：`RELEASE_NOTES.md` 必须严格遵循 3.1 节面向普通玩家的通俗大白话规范，绝不包含 P 级标签或内部审查代码）：
   ```powershell
   gh release create vMAJOR.MINOR.PATCH artifacts/jx3-loot-forge-vMAJOR.MINOR.PATCH-offline.zip --title "剑网3掉落工坊 vMAJOR.MINOR.PATCH" --notes-file "artifacts/剑网3掉落工坊-vMAJOR.MINOR.PATCH/RELEASE_NOTES.md"
   ```

3. **检查发布资产**：
   Release 资产列表中应只包含该单一离线 zip 包，不重复上传多份或中文名称附件。发布后在项目平台核验 Release 页面展示与资产可下载性。

## 5. 首次无历史仓库的特殊处理

如果仓库还没有任何 commit，首次发版按两次提交处理：

1. `chore: initial import`：提交完整的首版项目基线。
2. `release: v0.1.0`：只提交版本信息、`CHANGELOG.md`、`VERSION.json`、README 当前版本及必要的发布文件。

然后在第二个提交上创建 annotated tag：

```powershell
git tag -a v0.1.0 -m "Release v0.1.0"
```

首次发版前仍必须执行本流程的自动检查和人工验收。若首次导入已经被合并为一个历史提交，应保留现有历史，不强行重写；从下一版本开始执行正常的冻结、发版提交和 tag 流程。

## 6. 发版记录

每次发版至少能够从以下内容复核结果：

- 版本号、tag、发布日期和目录版本。
- 自动检查命令及通过结果。
- 人工验收范围及已知限制。
- 发布产物位置和推送状态。
- 若有例外，记录原因、影响和后续处理版本。
