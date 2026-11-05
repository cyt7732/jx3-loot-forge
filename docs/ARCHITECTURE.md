# 架构设计文档

## 概述

剑网3掉落工坊是一个纯前端单页应用，采用领域驱动设计（DDD）思想，将业务逻辑与UI层完全分离。核心特点是**100%离线可用**，所有数据和逻辑打包在单个HTML文件中。

## 技术栈

- **框架**: React 19.2.8
- **构建工具**: Vite 8.2.2
- **语言**: TypeScript 5.9.3
- **样式**: Tailwind CSS 4.2.1
- **测试**: Vitest 4.1.11
- **编码处理**: 自研 GBK 编解码器

## 核心设计原则

### 1. 领域驱动设计（DDD）

```
ui/          → 表现层（React组件）
   ↓ 调用
domain/      → 领域层（业务逻辑、状态管理）
   ↓ 使用
catalog/     → 数据层（副本目录、物品分类）
config/      → 基础设施层（配置导出、Lua解析）
storage/     → 持久化层（LocalStorage读写）
```

各层职责清晰，**领域层不依赖UI层**，所有核心业务逻辑可独立测试。

### 2. 类型安全优先

- 全TypeScript严格模式
- 运行时校验配合编译时检查
- 核心数据结构都有`assert*`验证函数

```typescript
// 编译时保证
type ItemState = {
  skipLoot: boolean;
  autoSell: boolean;
  protect: boolean;
};

// 运行时保证
export function assertValidState(state: ItemState): void {
  if (state.autoSell && state.protect) {
    throw new Error('"自动出售"和"保护不出售"不能同时开启。');
  }
}
```

### 3. 单文件离线优先

所有资源（数据、样式、逻辑）内联到单个HTML，零网络依赖。构建脚本 `scripts/build-offline.mjs` 负责打包：

- 内联所有JS/CSS
- Base64编码小图标
- 嵌入完整副本数据包
- GBK编码表内置

最终产物：`剑网3掉落工坊.html`（约26MB）

---

## 核心模块详解

### catalog/ - 数据分类引擎

**职责**: 副本目录管理、物品智能分类

**核心文件**:
- `classification.ts` - 物品分类算法（基于TypeLabel规则）
- `index.ts` - 目录加载与查询接口
- `levels.ts` - 等级分组与难度分组
- `type-label-rules.json` - 分类规则配置

**分类逻辑**:

```typescript
// 输入：物品元数据
{
  name: "炎枪重黎",
  typeLabels: ["特效武器", "长兵类"],
  isEquip: true,
  slot: "武器"
}

// 输出：分类结果
{
  category: "specialWeapon",  // 73项特效武器独立大类
  subtype: "长兵类",
  classification: "type-label"
}
```

**核心特性**:
- 支持73项全门派特效武器精准识别
- 基于TypeLabel主规则 + 名称后缀辅助规则
- 兼容旗舰端/缘起端双端数据

### config/ - 配置导出引擎

**职责**: 将用户配置导出为游戏可识别的GBK编码Lua文件

**核心文件**:
- `exporter.ts` - 导出逻辑，生成`.us.jx3dat`文件
- `importer.ts` - 导入逻辑，解析配置文件
- `lua-parser.ts` - Lua table解析器

**导出流程**:

```
用户勾选状态
   ↓
buildExportBatch()  → 构建导出批次
   ↓
  分三类:
  - skipLoot  (跳过拾取)
  - autoSell  (自动出售)
  - protect   (保护不出售)
   ↓
序列化为Lua table
   ↓
encodeGbk()  → 转为GBK字节流
   ↓
.us.jx3dat 文件（无BOM）
```

**GBK编码处理**:

游戏插件要求配置文件必须是**GBK编码、无BOM、单行格式**。项目自研了完整的GBK编解码器（`encoding/gbk.ts`），支持：

- Unicode → GBK 编码
- GBK → Unicode 解码
- 非法字符检测
- BOM检测与去除

**配置指纹**:

每次导出都在数据首项附带指纹，方便追溯来源：

```lua
["炎枪重黎"] = true,
["『剑网3掉落工坊』 v1.5.1 by 凌千羽·龙争虎斗 <20260928_143025>"] = true,
```

### domain/ - 领域模型

**职责**: 核心业务逻辑、状态管理、类型定义

**核心文件**:
- `types.ts` - 完整类型定义（200+行）
- `state.ts` - 状态操作函数（工作区创建、状态变更、批量规则）
- `constants.ts` - 常量配置（默认保护物品、默认出售物品）

**核心概念**:

#### 1. ItemState（物品状态）

```typescript
type ItemState = {
  skipLoot: boolean;   // 跳过拾取（不显示在团队拾取列表）
  autoSell: boolean;   // 自动出售（摸尸自动卖店）
  protect: boolean;    // 保护不出售（防误售珍品）
};
```

**互斥规则**: `autoSell`和`protect`不能同时为true

#### 2. Workspace（工作区）

用户的完整配置状态，包含：

```typescript
type Workspace = {
  schemaVersion: number;
  appVersion: string;
  catalogVersion: string;
  itemStates: Array<[string, ItemState]>;  // 物品状态映射
  customItems: CustomItem[];               // 用户自定义物品库
  customOverrides: string[];               // 自定义优先级保护列表
  selectedMapIds: number[];                // 已勾选副本
  selectedBossKeys: string[];              // 已勾选首领
  filters: FilterState;                    // 筛选条件
  ui: UIState;                             // UI状态
};
```

#### 3. 默认保护与默认出售

初始化时自动注入21项珍品保护 + 19项杂物出售，与茗伊插件官方默认保持100%一致：

```typescript
// 默认推荐保护（21项）
DEFAULT_PROTECTED_ITEMS = [
  '炎枪重黎', '腾空', '圆月双角', '五相斩', 
  '麒王逐魂', '金红狩命', '秋声烛影',
  // ... 特效武器
];

// 默认自动出售（19项）
DEFAULT_SELL_ITEMS = [
  '低级磨刀石', '低级缝纫包', '破旧的拳套',
  // ... 低价值杂物
];
```

### storage/ - 持久化层

**职责**: LocalStorage读写、工作区版本迁移、数据校验

**核心文件**:
- `workspace.ts` - 工作区存储管理
- `catalog.ts` - 目录数据缓存管理

**双端隔离存储**:

旗舰端和缘起端各自独立存储，互不干扰：

```typescript
function getWorkspaceStorageKey(client: GameClient): string {
  return client === 'origin' 
    ? 'loot-forge:workspace:origin'   // 缘起端
    : 'loot-forge:workspace:std';     // 旗舰端
}
```

**容错机制**:

- 数据异常时自动隔离备份到 `workspace:corrupted:{timestamp}`
- 初始化失败时启用只读保护，不覆盖本地存储
- 版本迁移时保留原有数据

### ui/ - 表现层

**职责**: React组件、用户交互

**核心文件**:
- `LootForgeApp.tsx` - 主组件（2096行，包含完整交互逻辑）

**组件结构**:

```
LootForgeApp
├─ Header (顶栏)
│  ├─ 客户端切换器（旗舰/缘起）
│  ├─ 主题切换器（浅色/深色）
│  └─ 导出菜单（综合/跳过拾取/自动出售）
├─ Sidebar (左侧)
│  ├─ 范围选择树（副本/首领）
│  └─ 自定义物品库
├─ MainPanel (中间)
│  ├─ 批量操作面板
│  ├─ 筛选器
│  └─ 物品列表
└─ Dialogs (弹窗)
   ├─ 导入配置
   ├─ 工作区管理
   └─ 空导出警告
```

**状态管理**:

当前采用 **20+ useState** 管理状态，适合中小型应用。未来如复杂度增长可考虑迁移到 useReducer 或 Zustand。

---

## 数据流

### 1. 初始化流程

```
页面加载
  ↓
加载内嵌副本数据 (catalogSnapshot)
  ↓
从 LocalStorage 读取工作区
  ↓
  ├─ 成功 → 加载已有配置
  └─ 失败 → 创建初始工作区
      ├─ 注入21项默认保护
      ├─ 注入19项默认出售
      └─ 勾选【用户自定义】
  ↓
构建视图数据 (buildCatalogItems)
  ↓
渲染界面
```

### 2. 用户操作流程

```
用户勾选副本/首领
  ↓
更新 selectedMapIds / selectedBossKeys
  ↓
重新计算视图数据 (过滤出当前范围的物品)
  ↓
用户修改物品状态
  ↓
更新 workspace.itemStates
  ↓
防抖保存到 LocalStorage (500ms)
  ↓
界面实时刷新
```

### 3. 导出流程

```
用户点击【导出综合配置】
  ↓
检查是否有勾选物品
  ├─ 无 → 弹窗警告
  └─ 有 → 继续
      ↓
buildExportBatch(namedStates)
  ├─ 过滤出三类物品
  ├─ 序列化为 Lua table
  ├─ 编码为 GBK 字节流
  └─ 生成文件名（带时间戳）
      ↓
downloadBytes() 触发浏览器下载
  ↓
用户获得 .us.jx3dat 文件
```

### 4. 导入流程

```
用户选择 .us.jx3dat 文件
  ↓
读取文件内容
  ↓
decodeGbk() 解码为 Unicode
  ↓
parseManagedConfig() 解析 Lua table
  ↓
previewImport() 预览变更
  ├─ 新增物品
  ├─ 覆盖物品
  └─ 冲突检测
      ↓
用户选择导入模式
  ├─ 合并（保留现有）
  └─ 覆盖（替换全部）
      ↓
applyChanges() 应用变更
  ↓
保存到 LocalStorage
```

---

## 核心算法

### 1. 物品分类算法

```typescript
// 优先级：TypeLabel主规则 > 名称辅助规则 > 默认分类
function classifyItem(input: ClassificationInput): ClassificationResult {
  // 1. 尝试 TypeLabel 主规则
  for (const [category, labels] of primaryTypeLabels) {
    if (input.typeLabels?.some(label => labels.includes(label))) {
      return { category, classification: 'type-label' };
    }
  }
  
  // 2. 尝试名称辅助规则
  const secondary = secondaryCategory(input);
  if (secondary) {
    return { category: secondary, classification: 'type-label-other-rule' };
  }
  
  // 3. 默认分类
  if (input.isEquip) return { category: 'equipment' };
  return { category: 'unknown' };
}
```

### 2. 自定义优先级保护

```typescript
// 当副本掉落物品与自定义库重复时，自定义优先
function isCustomOverride(itemId: string, workspace: Workspace): boolean {
  return workspace.customOverrides.includes(normalizeItemName(itemId));
}

// 副本内点击修改时拦截
if (isCustomOverride(item.id, workspace)) {
  showToast({
    tone: 'warning',
    message: '该物品已在【用户自定义】中配置，优先级更高。请前往自定义区调整。'
  });
  return; // 阻止修改
}
```

### 3. 批量规则预览

```typescript
// 用户点击"刷本摸金模式"时预览影响范围
function previewBulkRules(rules: BulkRuleSet): BulkPreview {
  const affected = new Set<string>();
  const conflicts = new Set<string>();
  
  for (const [itemId, state] of currentStates) {
    const nextState = applyRules(state, rules);
    if (nextState !== state) {
      affected.add(itemId);
    }
    if (nextState.autoSell && isProtectedItem(itemId)) {
      conflicts.add(itemId);
    }
  }
  
  return { affected, conflicts };
}
```

---

## 性能考虑

### 当前性能表现

- 全量副本数据（约5000+物品）加载时间 < 200ms
- 筛选/搜索响应时间 < 50ms
- 导出配置文件生成时间 < 100ms

### 未优化项（暂不影响使用）

1. **大列表渲染**: 当前直接渲染全部物品（可能上千条），未使用虚拟化
2. **组件重渲染**: 未使用 React.memo 优化，状态变更时重渲染较多
3. **计算缓存**: 部分过滤逻辑未使用 useMemo

**决策**: 除非用户反馈卡顿，否则不提前优化（保持代码简洁优先）

---

## 测试策略

### 测试覆盖范围

- ✅ 核心领域模型（`domain/state.ts`）
- ✅ 配置导出/导入（`config/exporter.ts`, `config/importer.ts`）
- ✅ GBK编码/解码（`encoding/gbk.ts`）
- ✅ 物品分类逻辑（`catalog/classification.ts`）
- ✅ UI关键路径（自定义优先级、主题切换）

### 测试文件

```
tests/
├── catalog.test.ts              # 目录加载与查询
├── classification.test.ts       # 物品分类
├── config.test.ts               # 配置导出/导入、GBK编码
├── domain.test.ts               # 领域模型
├── ui-scope-regressions.test.ts # 范围选择回归测试
├── ui-theme-custom-priority.test.ts # 主题与自定义优先级
└── workspace-lifecycle.test.ts  # 工作区生命周期
```

### 运行测试

```bash
cd web
npm test              # 运行所有测试
npm run check         # 完整质量检查（类型检查+Lint+测试+构建）
```

---

## 构建与部署

### 开发环境

```bash
cd web
npm install
npm run dev           # 启动本地开发服务器（http://localhost:5173）
```

### 生产构建

```bash
npm run build:web     # 构建在线版（dist/）
npm run build:offline # 构建单文件离线版（../剑网3掉落工坊.html）
```

### 离线版构建原理

`scripts/build-offline.mjs` 执行以下步骤：

1. 先执行 `build:web` 生成标准构建产物
2. 读取 `dist/index.html`
3. 内联所有 `<script src>` 和 `<link href>` 引用
4. Base64编码小图标
5. 嵌入完整副本数据包（JSON）
6. 写入根目录 `剑网3掉落工坊.html`

最终产物可直接双击在浏览器中打开，无需Web服务器。

---

## 版本管理

### 语义化版本

遵循 [Semantic Versioning 2.0.0](https://semver.org/):

- **主版本号**: 不兼容的API变更
- **次版本号**: 向下兼容的功能新增
- **修订号**: 向下兼容的问题修复

当前版本: **v1.5.1**

### 数据版本

副本数据包独立版本管理：

- 旗舰端: `data.旗舰_丝路风语_v4_260928`
- 缘起端: `data.缘起_剑胆琴心_v3_260928`

格式: `data.{客户端}_{资料片}_{大版本号}_{日期YYMMDD}`

### 工作区Schema版本

```typescript
type Workspace = {
  schemaVersion: 1,  // 工作区数据结构版本
  // ...
};
```

版本升级时自动执行数据迁移，保证向下兼容。

---

## 未来扩展方向

### 短期优化（3-6个月）

1. **组件拆分**: 将 `LootForgeApp.tsx` 拆分成10-15个小组件
2. **状态管理升级**: 迁移到 useReducer 或 Zustand
3. **依赖清理**: 移除不需要的 Next.js 相关依赖

### 中期增强（6-12个月）

1. **性能优化**: 大列表虚拟化、React.memo、useMemo
2. **测试覆盖提升**: 增加边界case测试
3. **数据包自动更新**: 定期爬取官方数据自动更新

### 长期规划（1年+）

1. **云端同步**: 可选的配置云备份功能
2. **移动端适配**: PWA支持
3. **社区共享**: 用户可以分享/导入他人的配置方案

---

## 技术债务

当前已知技术债务（优先级：低）：

1. **LootForgeApp.tsx 过大**: 2096行单组件，可维护性受影响
2. **状态管理复杂**: 20+个useState，逻辑分散
3. **依赖冗余**: package.json 中包含未使用的 Next.js 依赖
4. **缺少性能优化**: 大列表未虚拟化，组件未memo

**决策**: 这些债务不影响当前使用，按需偿还，不追求完美主义。

---

## 总结

剑网3掉落工坊采用**领域驱动设计 + 类型安全 + 离线优先**的架构，核心优势在于：

- ✅ 业务逻辑与UI完全解耦，易于测试和维护
- ✅ 完整的类型系统 + 运行时校验，减少bug
- ✅ 单文件离线方案，零网络依赖，极易分发
- ✅ 双端隔离存储，数据不混淆
- ✅ GBK编码完美处理，配置文件100%兼容游戏插件

代码质量：**8.2/10**，是一个成熟可用的个人项目，技术债务可控且不影响使用体验。
