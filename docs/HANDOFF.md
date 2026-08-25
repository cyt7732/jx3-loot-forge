# 剑网3掉落工坊：开发与发布归档交接文档

> 快照时间：2026-08-25（Asia/Shanghai）  
> 项目目录：`E:\Project\jx3-loot-forge`  
> 交接目标：让新的开发模型在不依赖历史聊天的情况下，安全接管当前工作区、继续开发并按统一标准发版。

本文记录的是截至快照时间的仓库事实、用户确认过的产品规则、已发布历史、当前未发布工作、数据处理流程和发版归档边界。它不代替代码和测试；发现冲突时，应先核对 Git、运行时规则文件和用户最新明确意见。

## 0. 快速接管说明

1. 确认当前产品版本为 `v1.0.3`，目录版本为 `20260823-011b26367022`。
2. 阅读本文、`docs/RELEASE_PROCESS.md`、`README.md`、`CHANGELOG.md` 和 `VERSION.json`。
3. 执行 `git log --oneline --decorate -10` 和 `git tag -n`，确认 `v1.0.3` tag 与 release commit。
4. 进入 `web/`，确认 Node.js 版本不低于 22.13；依赖缺失时使用 `npm ci`，已有依赖时不要无原因升级依赖或改写 lockfile。
5. 执行 `npm run check`。已知正确基线是：类型检查、Lint、76 项测试、在线构建、离线构建全部通过。
6. 分类调整涉及三条执行链：`web/src/catalog/type-label-rules.json`、`web/src/catalog/classification.ts`、`web/scripts/crawl-catalog.mjs` 和 `web/scripts/reclassify-catalog.mjs`。任何分类调整必须同步三条执行链并补测试。
7. 发版时严格遵循 `docs/RELEASE_PROCESS.md` 标准。

## 1. 当前状态：已发布基线

| 项目 | 当前事实 |
| --- | --- |
| 产品名 | 剑网3掉落工坊 |
| 已发布产品版本 | `v1.0.3` |
| 发布 commit | `release: v1.0.3` |
| annotated tag | `v1.0.3` |
| `VERSION.json` 目录版本 | `20260823-011b26367022` |
| 当前分支 | `main` |

## 2. Git、远端和身份信息

### 2.1 本地提交时间线

| 时间 | Commit | 含义 |
| --- | --- | --- |
| 2026-08-24 23:41 | `e50ee2b` | `chore: initial import`，完整项目初始导入 |
| 2026-08-24 23:41 | `cbb053c` | `release: v0.1.0`，首个可用版本 |
| 2026-08-25 00:07 | `630f49d` | `release: v0.1.1`，中文品牌与兼容性修订 |
| 2026-08-25 10:33 | `f98222f` | `release: v0.2.0`，第二版交互与性能优化 |
| 2026-08-25 16:30 | `e4ba9cb` | `release: v0.2.1`，团队秘境排序与响应式补丁 |
| 2026-08-25 16:38 | `68d7514` | 完善压缩包命名、顶层目录与 Release 附件规范 |
| 2026-08-25 19:16 | `14fef13` | `release: v0.3.0`，TypeLabel 分类重构与缓存优化 |
| 2026-08-25 23:01 | `cda101f` | `release: v1.0.0`，合一配置、顶栏操作中心与正式版品牌上线 |
| 2026-08-25 23:24 | `71803ba` | `release: v1.0.1`，全量合入插件默认初始配置对齐补丁 |
| 2026-08-25 23:28 | `965b1c3` | `release: v1.0.2`，移除初始跳过拾取占位符金叶子 |
| 2026-08-25 23:31 | `release: v1.0.3` | `release: v1.0.3`，将默认插件数据注册至用户自定义物品库 |

本地 annotated tags：

```text
v0.1.0 -> cbb053c
v0.1.1 -> 630f49d
v0.2.0 -> f98222f
v0.2.1 -> e4ba9cb
v0.3.0 -> 14fef13
v1.0.0 -> cda101f
v1.0.1 -> 71803ba
v1.0.2 -> 965b1c3
v1.0.3
```

已发布 tag 只读：不移动、不覆盖、不删除。发现发布问题时递增 PATCH 版本处理。

### 2.2 Remote 和认证状态

- origin：`https://github.com/cyt7732/jx3-loot-forge.git`
- 用户确认仓库当前应保持私有，后续由用户选择公开时机。
- Git identity：`cyt7732` / `cyt7732@gmail.com`。
- 不得把 GitHub token、密码、凭据缓存或其他密钥写入仓库、交接文档、日志或 Release 资产。

当前会话中：

- `gh repo view`、`gh release list` 和 `gh release view` 返回 HTTP 401；
- `git ls-remote origin` 返回 `SEC_E_NO_CREDENTIALS`；
- 因此，本地 commit、tag、产物和配置已核验，但 GitHub 仓库可见性、远端分支、远端 tags、Release 正文及附件当前不能在线复核。

下一次涉及 GitHub 操作前先执行：

```powershell
gh auth login -h github.com
gh auth status
gh repo view --json nameWithOwner,visibility,url,defaultBranchRef
gh release list --limit 20
```

认证恢复后再核对远端，不能根据旧聊天或本地 remote-tracking 引用宣称远端已同步。

## 3. 产品目标和不可破坏的业务边界

剑网3掉落工坊用于整理剑网3旗舰端副本掉落，并生成游戏可导入的 `.us.jx3dat` 配置。

以下是用户已经确认的硬边界：

- 当前只支持旗舰端 `client=std`；怀旧端 `client=origin` 是后续范围，不能假装已支持。
- `skipLoot`（跳过拾取）独立生效。
- `autoSell`（自动出售）与 `protect`（保护不出售）严格互斥；任何领域操作、批量操作、导入和导出前都必须维持这个不变量。
- UI 中出售策略表现为“未处理 / 自动出售 / 保护不出售”三选一，跳过拾取仍是独立开关。
- 21 个默认保护物品仅用于首次初始化，可由用户取消或调整，不是永久锁死名单。
- 历史参考配置里的 19 个默认出售物品不得自动进入新工作区，也不得在导出时偷偷混入。
- 自定义物品没有可靠目录分类，必须排除在副本、类别、品质、部位、装等和所有批量规则之外，状态由用户逐项指定。
- 危险批量操作必须先预览差异，再确认应用，并保留一步撤销。
- 同名物品按规范化名称共享全局状态；来源可以有多个，但状态不能按副本分别冲突保存。
- 新目录数据不得自动对新增物品套用动态出售策略；快速规则在确认时物化为具体物品状态。
- 正式离线使用场景是双击单个 `index.html`，默认不联网、不依赖本地服务器。
- 支持现代 Chrome、Edge、Firefox；明确不支持 IE。
- 项目许可证为 AGPL-3.0。网络提供修改版时必须履行相应源码提供义务。

默认保护名单与遗留出售名单的权威代码位置是 `web/src/domain/constants.ts`。其中 `水长生 ·雪银莲` 的空格必须原样保留，已有 GBK 黄金字节测试保护这一细节。

## 4. 项目结构和关键入口

| 路径 | 职责 |
| --- | --- |
| `启动网页.bat` | Windows 日常启动入口；项目没有 `启动网页.ps1` |
| `README.md` | 用户/开发者快速说明和当前已发布版本 |
| `VERSION.json` | 已发布产品版本、目录版本、日期、tag 和频道 |
| `CHANGELOG.md` | Keep a Changelog 风格的发布记录 |
| `docs/RELEASE_PROCESS.md` | 唯一正式发版与归档操作标准 |
| `docs/DEVELOPMENT_PLAN.md` | 完整产品边界、数据契约、测试与路线图 |
| `docs/V1_FEEDBACK_AND_V2_PLAN.md` | 第一版反馈和第二版设计决策历史 |
| `web/app/page.tsx` | Web 页面入口 |
| `web/app/loot-forge-app.tsx` | 页面与客户端应用的连接层 |
| `web/src/ui/LootForgeApp.tsx` | 当前主 UI、筛选、批量规则、导入导出和目录激活流程 |
| `web/app/globals.css` | 响应式字号、布局、触控区和视觉样式 |
| `web/src/domain/types.ts` | 领域类型、快照、工作区和分类类型 |
| `web/src/domain/state.ts` | 状态不变量、批量预览、应用和初始化 |
| `web/src/domain/constants.ts` | 产品版本、分类文案、默认保护名单和受管路径 |
| `web/src/catalog/levels.ts` | 等级与秘境难度分组、顺序和安全回退 |
| `web/src/catalog/index.ts` | 在线/离线目录加载和运行时目录构建 |
| `web/src/catalog/type-label-rules.json` | 当前未发布分类规则的运行时权威来源 |
| `web/src/catalog/classification.ts` | 当前未发布的纯 TypeScript 分类器 |
| `web/src/catalog/catalog.std.json` | 离线构建使用的完整目录快照 |
| `web/public/data/catalog.std.json` | 在线静态目录快照 |
| `web/public/data/manifest.json` | 在线目录版本、hash、统计与下载位置 |
| `web/scripts/crawl-catalog.mjs` | 从 JX3BOX API 全量重建 std 目录 |
| `web/scripts/reclassify-catalog.mjs` | 不联网地对现有快照重新分类 |
| `web/scripts/build-offline.mjs` | 将 CSS、JS 和目录内联为单个离线 HTML |
| `web/src/storage/workspace.ts` | localStorage 工作区、备份、恢复和校验 |
| `web/src/storage/catalog.ts` | IndexedDB 目录覆盖、校验和启动选择策略 |
| `web/src/config/*` | 受限 Lua 解析、导入预览、导出序列化 |
| `web/src/encoding/gbk.ts` | GBK/CP936 编解码与往返校验 |
| `web/tests/*` | 领域、目录、分类、导入导出与安全回归测试 |

本地辅助目录：

- `data/raw/`：人工理解字段和测试参考，不是生产数据源；其中个人 `.us.jx3dat` 被忽略。
- `artifacts/`：本地发布归档和 zip，被 Git 忽略。
- `exports/`、`output/`、`.playwright-cli/`：本地输出或测试证据，被 Git 忽略。
- `.learnings/`：本地错误/经验记录，被 Git 忽略，不属于产品交付。
- 根目录多个 `TypeLabel分类编辑表*.xlsx`：人工分类审阅过程文件，被 Git 忽略；运行时代码不能依赖这些文件。

## 5. 已完成版本的开发过程

### 5.1 v0.1.0：首个可用版本

- 建立完整旗舰端副本、Boss、掉落目录。
- 支持版本/副本/难度/Boss 范围选择及类别、品质、部位、装等、状态筛选。
- 建立跳过拾取、自动出售、保护不出售三个状态及互斥不变量。
- 支持批量规则、差异预览、自定义物品、一步撤销和逐项调整。
- 支持已有 `.us.jx3dat` 的安全解析、合并/替换预览。
- 支持 localStorage 工作区、备份/恢复和单文件离线构建。
- 建立正式 `CHANGELOG.md`、`VERSION.json` 和发版流程。

首发快照统计：254 个 MapID、981 个 Boss、43,033 条掉落、16,571 个精确去重物品名称；目录版本 `20260823-47ec717b1065`。

### 5.2 v0.1.1：中文品牌与兼容性

- 产品中文名统一为“剑网3掉落工坊”。
- 页面、离线页、README、文档、工作区提示和新导出指纹同步改名。
- 仓库 slug、storage key 和外部文件格式保持兼容。
- 导入器继续识别旧 `JX3 Loot Forge` 指纹，避免已有配置失效。

### 5.3 v0.2.0：第二版交互与启动性能

对应用户最初五项反馈：字号与窗口适配、出售/保护互斥合并、界面精简与快速生成、按等级归并版本、启动慢。

- 左侧导航归并为八个等级组。
- 自动出售和保护不出售合并为统一出售策略。
- 增加低等级装备、当前范围出售/保护、清除策略等快速配置，统一预览、确认和撤销。
- 增加响应式字号、侧栏和触控尺寸。
- 在线首屏先加载轻量壳，完整目录在 hydration 后异步载入。
- 完整目录不再重复打进在线首屏 JS；离线单文件仍内嵌目录。
- 目录索引建立延后到空闲时间。
- 开发配置减少托管插件影响；日常启动脚本默认生产服务器。

### 5.4 v0.2.1：排序、信息精简和响应式补丁

- 10 人、25 人团队秘境按 `MapID` 降序，较晚开放的副本排在上方。
- 5 人秘境和其他秘境保留原顺序。
- 移除等级标题已表达的信息，避免在副本节点重复显示版本名。
- 精简面向用户的开发期说明文字。
- 继续提高桌面、平板、窄屏下字号、触控热区和折行质量。
- 修复小视口筛选器、按钮宽度溢出等问题。
- 补充团队秘境排序测试。

### 5.5 v0.2.1 后的文档归档修订

`68d7514` 只完善发版规范：

- zip 必须使用英文文件名；
- zip 内必须包含中文顶层版本目录；
- GitHub Release 只上传一个标准离线 zip；
- 不改变 v0.2.1 tag 指向。

### 5.6 当前未发布：TypeLabel 分类与旧缓存修复

用户通过多个 Excel 审阅版本逐步确认了日常分类口径。开发过程包括：

1. 遍历全部 `TypeLabel` 并给出物品样本。
2. 用户在 `TypeLabel分类表` 中确认稳定主分类。
3. 对 `TypeLabel=其他` 的样本补充人工判断。
4. 确认装备兑换牌、宠物、大铁、小铁和特殊掉落规则。
5. 将规则固化为 JSON、纯分类器、crawler 和离线迁移脚本。
6. 发现旧快照大量条目没有 `TypeLabel`，用户确认空标签也应先尝试同一组正向规则，未命中才进入未分类。
7. 迁移后“未分类仍有很多套装牌”的表象最终定位为浏览器旧静态缓存和 IndexedDB override 遮蔽新目录，而不是静态快照分类没有执行。

当前自动检查已通过，但本节全部仍是未发布工作。

## 6. 等级导航和秘境排序规则

一级导航固定按以下顺序：

| 顺序 | 显示名 | 等级 | 归入的版本名 |
| --- | --- | --- | --- |
| 1 | 丝路风语 | 130 | 丝路风语 |
| 2 | 横刀断浪 | 120 | 横刀断浪 |
| 3 | 奉天证道 | 110 | 奉天证道 |
| 4 | 世外蓬莱 | 100 | 世外蓬莱 |
| 5 | 剑胆琴心 | 95 | 剑胆琴心、风骨霸刀、日月凌空、重制版 |
| 6 | 安史之乱 | 90 | 安史之乱、苍雪龙城、血战天策、逐鹿中原 |
| 7 | 巴蜀风云 | 80 | 巴蜀风云、日月明尊、一代宗师、烛火燎天 |
| 8 | 风起稻香 | 70 | 风起稻香 |

难度顺序固定为：

```text
5人秘境
10人普通秘境
10人英雄秘境
10人挑战秘境
25人普通秘境
25人英雄秘境
25人挑战秘境
其他秘境
```

规则：

- 当前等级没有某个难度时隐藏空组。
- 10 人和 25 人秘境按 `MapID` 降序。
- 5 人和其他秘境保留输入顺序。
- 未知版本、未知人数或未来数据进入明确的安全回退组，不能为了界面整洁丢弃。
- 一级标题已经显示标准等级名时，副本节点不要重复显示同一版本名；原始 `expansion` 仍保留在数据和搜索上下文中。

权威实现：`web/src/catalog/levels.ts`；测试：`web/tests/catalog.test.ts`。

## 7. TypeLabel 分类契约

### 7.1 权威来源和适用范围

`web/src/catalog/type-label-rules.json` 是当前未发布分类规则的运行时权威来源。Excel 文件是推导和人工审阅证据，不是构建依赖，也不应直接复制进产品逻辑。

规则应用原则：

1. 已知非“其他”的 `TypeLabel` 是最强证据，优先按主映射分类。
2. 只有 `TypeLabel` **恰好为一个“其他”**，或 `TypeLabel` 为空/缺失时，才允许执行名称和元数据二次规则。
3. 未知但非空、非“其他”的上游新标签必须进入未分类，不能被名称规则强行覆盖。
4. 原始 `typeLabels` 要保留在快照中，便于审计和未来迁移。
5. 分类来源要保留：`type-label`、`type-label-other-rule`、`type-label-missing-fallback`、兼容旧快照的 `metadata`、`name-fallback`、`unknown`。

### 7.2 TypeLabel 主分类

完整标签清单以 JSON 为准。当前类别摘要：

| 目标类别 | TypeLabel 例子 |
| --- | --- |
| 装备 | 帽子、上衣、下装、护腕、腰带、鞋子、戒指、项链、腰坠及各门派武器类型 |
| 材料 | 背包、材料、五彩石、五行石 |
| 特殊掉落 | 背部挂件、腰部挂件、坐骑及坐骑装饰、未知 |
| 书籍 | 道学、佛学、杂集 |
| 家具 | 家具、建筑、景观 |
| 小附魔 | 武器 |
| 大附魔 | 物品强化 |

主分类一旦命中，不再执行名称二次规则。

### 7.3 “其他”与空 TypeLabel 的二次规则

顺序是用户确认的契约，不能随意调整：

1. **宠物优先**：上游 `IsEquip=true`，但没有有效 `slot/slots`，归类为宠物。空字符串、`unknown`、`未知` 都不算有效部位。宠物判断排在玄晶、陨铁和名称结构之前。
2. **大铁**：名称以“玄晶”结尾。
3. **小铁**：名称以“陨铁”结尾。
4. **装备兑换牌前缀**：名称以 `秘境宝藏·`、`三宿`、`神兵玉匣·`、`秘境宝藏碎片·` 开头。
5. **套装/部位/门派结构**：名称符合“套装名 + 装备部位 + 门派”，例如 `破军衣·七秀`、`蚩灵护腕·霸刀`、`鹤梦帽·刀宗`。
6. **名称中存在明确装备部位片段**：例如 `三宿岩·戒`、`探幽宝藏·武器`、`探幽宝藏·首饰`、`焕彩玉·鞋子`、`超拔之玉·帽`，归类为装备兑换牌。
7. **最终回退不同**：
   - `TypeLabel` 恰好为“其他”且未命中正向规则：归类为特殊掉落；
   - `TypeLabel` 为空/缺失且未命中正向规则：保留为未分类。

当前门派和装备部位 token 的完整列表在规则 JSON 中。新增门派、新部位或命名格式时，先补样本测试再扩规则。

### 7.4 三条实现链必须一致

| 实现 | 用途 |
| --- | --- |
| `web/src/catalog/classification.ts` | 纯 TypeScript 分类器和单元测试入口 |
| `web/scripts/crawl-catalog.mjs` | 新抓取数据生成目录时分类 |
| `web/scripts/reclassify-catalog.mjs` | 不联网地迁移当前完整快照 |

当前实现存在一定重复，后续修改最容易出现“测试分类器正确、crawler 或迁移脚本顺序不同”的漂移。尤其要覆盖多标签、空标签、exactly 其他、宠物优先和迁移幂等场景。若重构为共享实现，必须保证 Node 脚本和前端构建都能稳定加载，且不把完整目录重新打回首屏 bundle。

### 7.5 当前未发布目录结果

| 字段 | 值 |
| --- | --- |
| `catalogVersion` | `20260823-011b26367022` |
| `generatedAt` | `2026-08-23T15:35:53.820Z` |
| `contentHash` | `011b26367022797495297bdf09b943d29acb5f6cd6b480b95128757ac25edce1` |
| maps | 254 |
| bosses | 981 |
| drops | 43,033 |
| unique items | 16,571 |

分类计数：

| 类别 | 数量 |
| --- | ---: |
| 装备 | 12,488 |
| 装备兑换牌 | 3,442 |
| 宠物 | 229 |
| 书籍 | 107 |
| 未分类 | 102 |
| 家具 | 73 |
| 特殊掉落 | 71 |
| 材料 | 29 |
| 小铁 | 8 |
| 大铁 | 8 |
| 小附魔 | 8 |
| 大附魔 | 6 |

当前未分类样本中，按已确认规则能够识别的秘境宝藏、破军、神兵玉匣、三宿和带明确部位兑换牌已经不应继续出现。剩余 102 条不能为了追求“未分类为零”而猜测。

`consumable`、`task`、`currency`、`other` 等类别当前计数为零，不代表类型可以删除；它们是已预留领域类别，后续映射必须由用户或可靠上游字段确认。

## 8. 数据采集、迁移和快照发布

### 8.1 全量抓取

在 `web/` 执行：

```powershell
npm run crawl:catalog
```

要求：

- 只采集 `client=std`。
- 地图索引来自 JX3BOX 当前有效 API；旧 `/fb_map.json` 虽可能 HTTP 200，但业务内容不可用，不得再依赖。
- 遍历所有 MapID、Boss 和掉落，不允许用单副本样例替代全量。
- crawler 使用有限并发、重试、超时、失败清单和完整性检查。
- 任一地图或必要数据部分失败时不得发布“看似完整”的快照。
- 浏览器不能直接执行全量抓取：上游子 API 有 CORS 和限流约束，在线前端只消费已发布静态快照。
- `data/raw` 的配置文件只用于理解结构和测试，不是目录数据源。

### 8.2 离线重新分类

在分类规则变化、但不需要重新访问上游时执行：

```powershell
npm run reclassify:catalog
```

脚本会写入：

- `web/src/catalog/catalog.std.json`
- `web/public/data/catalog.std.json`
- `web/public/data/manifest.json`

约束：

- 连续运行两次应得到字节稳定结果；迁移必须幂等。
- `src` 和 `public` 两份快照必须一致。
- manifest 的统计、版本、hash 和快照必须一致。
- 不能伪造抓取时间。当前脚本保留原 `generatedAt`，仅依据内容重新计算 hash 和 `catalogVersion`。
- hash 输入排除 `generatedAt`、`catalogVersion`、`contentHash`，避免仅时间变化制造假更新。
- 所有地图 `itemIds` 必须引用存在的物品。

不要在不了解当前差异时随手运行迁移脚本；它会写三个大文件。先看 `git status` 和 `git diff --stat`，运行后再次核对差异和 hash。

### 8.3 发布门槛

数据目录只有同时满足以下条件才可进入 Release：

- completeness 为 `complete`；
- `expectedMapCount === fetchedMapCount === maps.length`；
- `failures` 为空；
- stats 与实际数组一致；
- SHA-256 校验通过；
- src/public 快照同步；
- manifest 与快照同步；
- 分类差异已人工抽样；
- 浏览器在线加载和离线内嵌加载都通过。

## 9. 浏览器目录缓存和工作区持久化

### 9.1 两类持久化数据

- 工作区：localStorage，key 为 `jx3-loot-forge:workspace:v1`。
- 可选目录覆盖：IndexedDB，数据库 `jx3-loot-forge`，store `catalog`，key `std`。

工作区保存用户状态、选择范围、自定义物品、筛选器和 UI 状态；目录快照独立保存。目录升级不能清空用户已经保存的状态。

### 9.2 已修复的旧目录遮蔽问题

旧实现启动时直接使用：

```text
override ?? embedded
```

只要 IndexedDB 曾保存过目录，无论多旧都会覆盖随当前代码发布的内置目录。因此即使静态 JSON 已把套装牌归类完成，页面仍会显示旧目录中的大量未分类。

当前未发布修复：

- `selectCatalogSnapshot()` 比较 `contentHash` 和 `generatedAt`；
- 无 override 时使用 embedded；
- hash 相同可以继续使用 override；
- override 的生成时间明确晚于 embedded 时保留 override，兼容用户手动导入更新目录；
- override 更旧、同时间但 hash 不同、日期缺失或非法时使用 embedded；
- 不自动删除旧 IndexedDB 数据，避免无提示破坏用户数据；
- 在线 `catalog.std.json` 使用 `cache: 'no-store'`，避免同名静态 JSON 被浏览器继续复用；
- 工作区 `catalogVersion` 跟随实际激活的 snapshot。

相关文件：`web/src/storage/catalog.ts`、`web/src/catalog/index.ts`、`web/src/ui/LootForgeApp.tsx`、`web/tests/catalog.test.ts`。

性能注意：完整目录接近 9 MB；当前启动仍需异步读取/解析目录，并可能校验 IndexedDB 覆盖目录。`no-store` 解决正确性，不等于所有网络和解析性能问题都已消失。后续性能优化必须分别测量服务器启动、静态 JSON 传输、JSON 解析、hash 校验、索引建立和首次可操作时间。

## 10. 导入、导出和安全契约

### 10.1 导出

- 生成“跳过拾取”和“自动出售”两份 `.us.jx3dat`。
- 编码固定为 CP936/GBK，无 UTF-8 BOM。
- 文件内容为单行 Lua table。
- 同批两个文件共享 Asia/Shanghai 时间戳和同一指纹。
- 指纹格式：`『剑网3掉落工坊』 vX.Y.Z by 凌千羽·龙争虎斗 <YYYYMMDD_HHmmss>`。
- 主表即使没有用户物品也保留指纹；保护表必须显式输出，空表也不能省略。
- 输出顺序按 Unicode code point 稳定排序。
- 任何无法 GBK 编码的字符必须在下载前报错，不能静默替换。

受管游戏路径：

```text
MY_GKPLoot.tAutoPickupFilters
MY_AutoSell.tSellItem
MY_AutoSell.tProtectItem
```

### 10.2 导入

- 只解析受限 Lua 子集，不执行 Lua、函数、命令或任意代码。
- 导入支持合并和按已声明字段替换。
- 自动出售与保护同时出现时按“保护优先”解决，并在预览中报告冲突。
- 识别当前中文指纹，也兼容旧 `JX3 Loot Forge` 指纹。
- 保留未识别字段为 ignored 信息，不因导入其他插件配置而执行未知内容。
- 限制文件大小、token 数、嵌套深度和物品名称数量，拒绝重复键、控制字符和歧义语法。

关键实现：`web/src/config/`、`web/src/encoding/gbk.ts`；关键测试：`web/tests/config.test.ts`。

## 11. 本地启动、开发和验证

### 11.1 环境

- Windows PowerShell / 批处理为当前主要维护环境。
- Node.js `>=22.13.0`。
- 包管理器使用 npm；lockfile 为 `web/package-lock.json`。

### 11.2 日常生产启动

仓库只有根目录 `启动网页.bat`，没有 PowerShell 启动脚本。

批处理流程：

1. 进入 `web/`；
2. 检查 node/npm；
3. 缺少 `node_modules` 时运行 `npm install`；
4. 缺少 `web/dist/server/index.js` 时运行 `npm run build`；
5. 执行 `npm run start -- --hostname localhost`；
6. 地址为 `http://localhost:3000/`。

显式绑定 `localhost` 是为了避免之前 `--hostname ::1` 导致部分环境无法正常拉起或访问。

### 11.3 开发模式

```powershell
cd web
npm run dev
```

修改源码需要热更新时使用开发模式。日常使用发布构建时，源码变更后要重新 `npm run build`，否则启动脚本可能继续使用旧的 `dist/server/index.js`。

### 11.4 完整自动检查

```powershell
cd web
npm run check
```

`check` 依次执行：

```text
typecheck
lint
test
build
build:offline
```

截至本交接快照，76 项测试全部通过，在线和离线构建成功。构建输出中 vinext 可能提示路由无法静态分类，这是当前工具提示，不等于构建失败；仍应以退出码和实际产物为准。

测试覆盖重点：

- 状态互斥和 21 项保护基线；
- 自定义物品排除批量规则；
- Lua 安全解析、导入冲突、空表替换；
- GBK、无 BOM、单行、指纹和稳定排序；
- 等级/难度映射、未知回退、团队秘境 MapID 降序；
- 快照完整性和 hash；
- TypeLabel 主分类、其他/空标签二次规则、宠物优先、铁类、兑换牌和未分类回退；
- embedded/override 目录启动选择。

### 11.5 人工冒烟测试

自动检查不能替代以下测试：

- 页面首屏、字号、滚动和窄屏布局；
- 左侧范围树能滚到最底部；
- 八个等级和难度顺序正确，空组隐藏；
- 分类筛选显示正确数量；
- 旧 IndexedDB 目录不会遮蔽内置新目录；
- 用户手动导入的真正更新目录仍可激活；
- 状态刷新后保留；
- 批量预览、确认、撤销；
- 自定义物品不被批量修改；
- 导入合并/替换和未知名称；
- 两个 GBK 文件分别下载和同时下载；
- 断网双击离线 `index.html` 仍能编辑、持久化和导出。

## 12. 统一发版和归档流程

`docs/RELEASE_PROCESS.md` 是详细权威标准。本节是交接摘要，不能用来绕过原文检查。

### 12.1 版本规则

- 产品版本使用 SemVer：`vMAJOR.MINOR.PATCH`。
- 不兼容变化升 MAJOR；向后兼容功能升 MINOR；修复、性能或数据修正升 PATCH。
- 产品版本与 `catalogVersion` 分开记录。
- 候选版本使用 `vX.Y.Z-rc.N`。
- 日常提交使用 Conventional Commits：`feat`、`fix`、`perf`、`docs`、`test`、`chore`、`release`。
- 正式 tag 必须是 annotated tag，格式 `vX.Y.Z`，tag message 为 `Release vX.Y.Z`。

### 12.2 发版前冻结和同步

1. 明确本次包含/不包含内容，冻结范围。
2. 确认工作区没有混入无关修改。
3. 把 `[Unreleased]` 内容移动到新版本，使用 Keep a Changelog 分类。
4. 同步：
   - `web/package.json`；
   - `web/package-lock.json` 中相应版本（若 npm 更新产生）；
   - `web/src/domain/constants.ts` 的 `APP_VERSION`；
   - `README.md` 当前版本和能力；
   - `CHANGELOG.md`；
   - `VERSION.json` 的产品版本、目录版本、日期、tag、频道。
5. 目录版本和 hash 必须来自实际快照，不能手填伪造。

当前未发布目录版本与 `VERSION.json` 不一致是预期开发状态，但在发版提交前必须同步。

### 12.3 自动和人工验收

```powershell
npm --prefix web ci
npm --prefix web run check
```

随后完成第 11.5 节冒烟测试，并特别核验离线单文件、配置编码、版本展示、目录统计和已知限制。

任何自动检查失败、目录不完整、hash 不一致或关键人工验收失败都应阻止发版，不得“先打 tag 再修”。

### 12.4 发布 commit 和 tag

示例：

```powershell
git status
git add .
git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git status
```

在当前 dirty main 上操作前，必须先确认每个未提交文件都属于本次版本。不要为了得到干净状态删除当前分类改造。

### 12.5 本地归档目录

每个正式版本在 `artifacts/` 下准备：

```text
剑网3掉落工坊-vX.Y.Z/
├─ index.html
├─ CHANGELOG.md
├─ README.md
├─ LICENSE
├─ VERSION.json
└─ RELEASE_NOTES.md
```

规则：

- 恰好 6 个文件；
- `index.html` 来自通过验收的 `web/dist/offline/index.html`；
- 文档和 VERSION 必须来自同一 release commit；
- `RELEASE_NOTES.md` 写用户可感知重点和使用方式，不堆 commit 列表；
- `artifacts/` 被 Git 忽略，不进入源码提交。

当前本地存在：

- `artifacts/剑网3掉落工坊-v0.2.0/`
- `artifacts/剑网3掉落工坊-v0.2.1/`
- `artifacts/jx3-loot-forge-v0.2.1-offline.zip`

v0.2.1 zip SHA-256：

```text
2EE5ABFDF932A3D70C5662AD48FEED0C5901317502DC3A8CCC82CAEC0D99FAB8
```

### 12.6 压缩包和 GitHub Release

- zip 文件名只用英文：`jx3-loot-forge-vX.Y.Z-offline.zip`。
- zip 最外层必须包含完整中文版本目录，不能把 6 个文件直接散在压缩包根部。
- GitHub Release 标题：`剑网3掉落工坊 vX.Y.Z`。
- GitHub Release 只上传一个标准英文命名离线 zip，不重复上传中文名附件或多个变体。
- Release notes 使用归档目录中的 `RELEASE_NOTES.md`。

PowerShell 示例：

```powershell
Compress-Archive -Path 'artifacts/剑网3掉落工坊-vX.Y.Z' -DestinationPath 'artifacts/jx3-loot-forge-vX.Y.Z-offline.zip' -Force
git push origin main
git push origin vX.Y.Z
gh release create vX.Y.Z artifacts/jx3-loot-forge-vX.Y.Z-offline.zip --title "剑网3掉落工坊 vX.Y.Z" --notes-file "artifacts/剑网3掉落工坊-vX.Y.Z/RELEASE_NOTES.md"
```

当前 GitHub 凭据失效，重新认证并核对私有可见性后才能执行这些命令。推送和创建 Release 都是外部状态变更，必须有用户明确发版授权。

### 12.7 发布后归档检查

- 本地 `main`、远端 `main`、release commit 一致；
- annotated tag 本地/远端指向 release commit；
- GitHub Release 不是 draft/prerelease（正式版场景）；
- Release 只有一个正确 zip；
- 下载 zip 后重新计算 SHA-256，并解压核对中文顶层目录和 6 文件；
- 双击下载包中的 `index.html` 做最终离线回归；
- 记录版本号、发布日期、目录版本、检查结果、人工验收范围、资产 hash 和任何例外。

## 13. 明确红线和维护边界

### Git 与文件

- 不清理、不覆盖、不回滚未知来源的 dirty worktree 修改。
- 不执行 `git reset --hard`、强制 checkout、强推或移动已发布 tag。
- 不把 `artifacts/`、Excel 审阅表、个人 `.us.jx3dat`、构建目录、Playwright 输出或 `.learnings/` 提交进源码。
- 不提交任何 secret、cookie、token、环境变量或个人游戏配置。
- 大 JSON 迁移前后都核对 diff、hash、stats 和引用完整性。

### 数据与分类

- 不在浏览器全量爬 JX3BOX。
- 不在部分抓取失败时发布目录。
- 不凭名称猜测已知非“其他”TypeLabel 的分类。
- 不为了消灭未分类强行归类证据不足的物品。
- 不让 TS 分类器、crawler 和 reclassify 脚本出现规则优先级漂移。
- 不把 Excel 作为隐藏运行时依赖；规则必须进入版本化 JSON、代码和测试。
- 不捏造 `generatedAt`、hash、统计或远端状态。

### 用户状态与危险操作

- 不允许自动出售和保护同时为 true。
- 不让批量规则触碰自定义物品。
- 不在目录升级时重置用户工作区。
- 不自动删除 IndexedDB 旧目录；选择策略可以忽略旧目录，但删除需要明确用户动作。
- 不把未来新增物品自动套入历史危险出售策略。
- 冲突导入保持保护优先并显示预览。

### 导出与兼容

- 不改变 GBK、无 BOM、单行、`.us.jx3dat` 契约，除非用户明确要求并提供迁移方案。
- 不删除旧中英文指纹兼容。
- 不把受限 Lua parser 替换成会执行输入代码的方案。
- 不改变 21 项保护基线的字面内容和空格，除非用户明确确认并更新测试。

### 产品范围

- 不把 origin 怀旧端写成已支持。
- 不增加 IE 兼容负担。
- 不把在线预览当成唯一正式分发；离线单文件始终是核心交付。
- 不忽略 AGPL-3.0 的源码提供义务。

## 14. 当前风险和未完成事项

1. **当前工作未提交、未发版**：15 个产品开发条目及本文必须先审阅，再决定提交拆分和版本号。
2. **版本元数据尚未同步**：代码/README/VERSION 仍是 0.2.1，静态目录已经是新 hash；发版前必须统一。
3. **CHANGELOG 的 `[Unreleased]` 仍为空**：需要补写 TypeLabel 分类、目录迁移、空标签兜底和缓存选择修复。
4. **远端无法复核**：GitHub CLI 和 git remote 都缺少有效凭据；重新认证后必须确认私有仓库、分支、tags 和 Releases。
5. **最新修改仅完成自动检查**：还应做实际浏览器、旧 IndexedDB、硬刷新和离线文件冒烟测试。
6. **分类逻辑有三份实现**：未来改规则容易漂移；应补共享 fixture 或安全地收敛实现。
7. **目录生成时间保留旧抓取时间**：这是幂等迁移设计，不是漏更新；但 Release 说明必须区分“重新抓取”和“仅重新分类”。
8. **未分类仍有 102 条**：它们应继续等待证据，不应默认归入特殊掉落。
9. **部分预留类别为零**：消耗品、任务物品、货币/兑换、其他尚未形成用户确认映射。
10. **性能仍有后续空间**：首屏脚本已瘦身，但完整目录传输/解析、IndexedDB 校验和索引构建仍需基准数据支持优化。
11. **历史规划文档会逐步过时**：`docs/DEVELOPMENT_PLAN.md` 和 `docs/V1_FEEDBACK_AND_V2_PLAN.md` 保留设计历史；新的已完成事实应同步到 CHANGELOG、README 和本文，不能只改旧计划中的勾选框。

## 15. 建议下一阶段执行顺序

### A. 先完成当前分类版本

1. 逐文件审阅当前 15 个产品开发条目，并单独审阅本文，确认没有混入无关改动。
2. 再运行一次 `npm run reclassify:catalog`，确认第二次运行幂等、hash 不变；运行前后保存 `git diff --stat`。
3. 执行 `npm run check`。
4. 启动页面，检查分类数量、关键样本、旧 IndexedDB 目录选择和 `Ctrl+F5` 行为。
5. 双击最新离线 `index.html`，检查分类、状态、刷新和导出。
6. 将结果写入 `CHANGELOG.md [Unreleased]`，并更新 README/开发文档中的分类说明。
7. 与用户确认下一个产品版本号。分类体系属于用户可感知能力扩展，通常更接近 MINOR，但最终按用户确认和 `RELEASE_PROCESS.md` 决定，不能自行假定。
8. 用户明确要求发版后，再同步版本、提交、tag、打包、推送和创建 Release。

### B. 分类版本之后

- 为剩余 102 个未分类物品生成可审阅样本报告，但不自动猜测。
- 对当前为空的日常类别收集用户确认映射。
- 把分类规则生成一份机器可比较的差异报告：新增 TypeLabel、未命中标签、分类数量变化、典型样本。
- 评估将 crawler/reclassify/TS classifier 的规则执行集中到单一实现或共享 fixture。
- 继续测量大目录加载各阶段耗时，再决定分片、预索引、Worker 或校验缓存；不要用感受替代基准。
- 保持 UI 以快速生成配置为主路径，精细配置为高级入口，避免再次堆叠所有控制项。

## 16. 信息来源优先级

后续模型遇到冲突时按以下顺序判断：

1. 用户在当前任务中的最新明确要求；
2. 可执行测试和实际代码不变量；
3. `web/src/catalog/type-label-rules.json` 等版本化运行时规则；
4. `docs/RELEASE_PROCESS.md` 的发版标准；
5. 本交接文档记录的快照事实；
6. `docs/DEVELOPMENT_PLAN.md` 和历史方案文档；
7. 被 Git 忽略的 Excel、截图、输出文件和历史聊天摘要。

如果用户新决策改变规则，应同时修改权威代码、测试、CHANGELOG/文档，并明确兼容和迁移影响。不能只改交接文档，也不能只改 Excel。

## 17. 本文更新规则

发生以下任一情况时更新本文：

- 发布新产品版本或创建新 tag；
- `catalogVersion`、hash、统计或分类规则变化；
- 工作区 schema、存储 key、导入导出格式变化；
- 新增客户端支持或改变浏览器边界；
- 发版/归档结构变化；
- 当前 15 个产品开发条目被提交、拆分、回滚或发布；
- GitHub 远端状态重新认证并核验；
- 新增必须由下一模型遵守的用户确认规则。

每次更新都应重新执行 `git status`、核对版本/tag/hash，并在文档头部替换快照时间。不要在未复核的情况下复制旧状态。

---

快照时间：2026-08-25（Asia/Shanghai）。
