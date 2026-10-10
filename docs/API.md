# 模块 API 文档

本文档描述各核心模块的公开接口。

---

## catalog - 副本数据与分类引擎

### classification.ts

#### `classifyItem(input: ClassificationInput): ClassificationResult`

根据物品元数据进行智能分类。

**参数**:

```typescript
type ClassificationInput = {
  name: string;                    // 物品名称
  typeLabels?: readonly string[];  // TypeLabel标签数组
  isEquip?: boolean;               // 是否为装备
  slot?: string;                   // 装备部位
  slots?: readonly string[];       // 多个装备部位
};
```

**返回值**:

```typescript
type ClassificationResult = {
  category: ItemCategory;          // 分类结果
  classification: ClassificationSource;  // 分类来源
  subtype?: string;                // 子类型（如"长兵类"）
  typeLabels: string[];            // 原始TypeLabel副本
};
```

**示例**:

```typescript
const result = classifyItem({
  name: '炎枪重黎',
  typeLabels: ['特效武器', '长兵类'],
  isEquip: true,
  slot: '武器',
});
// {
//   category: 'specialWeapon',
//   classification: 'type-label',
//   subtype: '长兵类',
//   typeLabels: ['特效武器', '长兵类']
// }
```

### index.ts

#### `loadCatalogSnapshot(client: GameClient): CatalogSnapshot`

加载指定客户端的副本数据快照。

**参数**:
- `client`: `'std'`（旗舰端）或 `'origin'`（缘起端）

**返回值**:

```typescript
type CatalogSnapshot = {
  catalogVersion: string;          // 数据版本
  client: GameClient;              // 客户端类型
  items: CatalogItem[];            // 物品列表
  maps: CatalogMap[];              // 副本列表
  eras: CatalogEra[];              // 纪元列表
  levelGroups: CatalogLevelGroup[]; // 等级分组
};
```

#### `buildCatalogItems(snapshot: CatalogSnapshot): CatalogItem[]`

构建完整物品列表（包含分类、来源等信息）。

**返回值**: 完整的物品数组，每个物品包含：

```typescript
type CatalogItem = {
  id: string;                      // 物品唯一ID
  name: string;                    // 物品名称
  category: ItemCategory;          // 分类
  subtype?: string;                // 子类型
  sources: CatalogSource[];        // 掉落来源
  // ... 其他字段
};
```

---

## config - 配置导出与导入

### exporter.ts

#### `buildExportBatch(namedStates: NamedState[], now?: Date): ExportBatch`

根据物品状态构建导出批次（综合配置、跳过拾取、自动出售三个文件）。

**参数**:

```typescript
type NamedState = {
  name: string;      // 物品名称
  state: ItemState;  // 物品状态
};
```

**返回值**:

```typescript
type ExportBatch = {
  fingerprint: string;   // 配置指纹
  timestamp: string;     // 时间戳
  combined: ExportFile;  // 综合配置文件
  pickup: ExportFile;    // 跳过拾取文件
  sell: ExportFile;      // 自动出售文件
};

type ExportFile = {
  filename: string;      // 文件名
  bytes: Uint8Array;     // GBK编码字节流
  text: string;          // 原始文本
};
```

**示例**:

```typescript
const batch = buildExportBatch([
  { name: '拾取项', state: { skipLoot: true, autoSell: false, protect: false } },
  { name: '出售项', state: { skipLoot: false, autoSell: true, protect: false } },
]);

// 下载综合配置
downloadBytes(batch.combined.filename, batch.combined.bytes);
```

#### `createFingerprint(timestamp: string): string`

创建配置指纹字符串。

**参数**: 时间戳（格式: `YYYYMMDD_HHmmss`）

**返回值**: 指纹字符串（如 `『剑网3掉落工坊』 v1.5.1 by 凌千羽·龙争虎斗 <20260928_143025>`）

### importer.ts

#### `parseManagedConfig(text: string): ParsedManagedConfig`

解析工坊导出的配置文件。

**参数**: Lua配置文件文本内容

**返回值**:

```typescript
type ParsedManagedConfig = {
  skipLoot: string[];              // 跳过拾取物品
  autoSell: string[];              // 自动出售物品
  protect: string[];               // 保护不出售物品
  fingerprint: string | null;      // 配置指纹
  declared: Set<'skipLoot' | 'autoSell' | 'protect'>;  // 已声明的表
};
```

#### `previewImport(parsed: ParsedManagedConfig, workspace: Workspace, mode: ImportMode): ImportPreview`

预览导入变更。

**参数**:
- `parsed`: 解析后的配置
- `workspace`: 当前工作区
- `mode`: `'merge'`（合并）或 `'overwrite'`（覆盖）

**返回值**:

```typescript
type ImportPreview = {
  added: string[];        // 新增物品
  updated: string[];      // 更新物品
  unchanged: string[];    // 不变物品
  conflicts: string[];    // 冲突物品（自动出售vs保护）
};
```

#### `validateItemName(name: string): boolean`

验证物品名称是否可以用GBK编码。

**返回值**: `true` 表示合法，`false` 表示包含无法编码的字符

### lua-parser.ts

#### `parseLuaChunk(text: string): LuaTable`

解析Lua `return {...}` 语句。

**返回值**:

```typescript
type LuaTable = {
  fields: Array<{
    key: string;       // 字段键
    value: unknown;    // 字段值（string | number | boolean | LuaTable）
  }>;
};
```

---

## domain - 领域模型

### state.ts

#### `createInitialWorkspace(catalogVersion: string, now?: Date): Workspace`

创建初始工作区（注入默认保护和默认出售）。

**参数**:
- `catalogVersion`: 副本数据版本
- `now`: 时间戳（默认当前时间）

**返回值**: 初始化的工作区对象

#### `stateMapFromWorkspace(workspace: Workspace): Map<string, ItemState>`

从工作区提取物品状态映射。

**返回值**: `Map<物品ID, 物品状态>`

#### `workspaceWithStateMap(workspace: Workspace, map: Map<string, ItemState>): Workspace`

用新的状态映射更新工作区。

**参数**:
- `workspace`: 原工作区
- `map`: 新的状态映射

**返回值**: 更新后的工作区

#### `setStateField(state: ItemState, field: StateField, enabled: boolean): ItemState`

设置物品状态字段（带互斥检查）。

**参数**:
- `state`: 原状态
- `field`: `'skipLoot'` | `'autoSell'` | `'protect'`
- `enabled`: 是否启用

**返回值**: 新状态（自动处理`autoSell`和`protect`的互斥）

**示例**:

```typescript
let state = { skipLoot: false, autoSell: false, protect: false };

// 启用自动出售
state = setStateField(state, 'autoSell', true);
// { skipLoot: false, autoSell: true, protect: false }

// 启用保护不出售（自动关闭自动出售）
state = setStateField(state, 'protect', true);
// { skipLoot: false, autoSell: false, protect: true }
```

#### `applyChanges(workspace: Workspace, changes: StateChange[]): Workspace`

批量应用状态变更。

**参数**:

```typescript
type StateChange = {
  itemId: string;
  field: StateField;
  enabled: boolean;
};
```

**返回值**: 更新后的工作区

#### `createEquipmentBulkRules(): BulkRuleSet`

创建"全选装备"批量规则。

#### `createCategoryActionRules(category: ItemCategory, action: BatchActionType): BulkRuleSet`

创建分类批量操作规则。

**参数**:
- `category`: 物品分类
- `action`: `'skipLoot'` | `'autoSell'` | `'protect'` | `'clear'`

**示例**:

```typescript
// 批量跳过拾取所有宠物
const rules = createCategoryActionRules('pet', 'skipLoot');

// 批量自动出售所有小铁
const rules = createCategoryActionRules('smallIron', 'autoSell');
```

#### `previewBulkRules(rules: BulkRuleSet, workspace: Workspace, scopedItems: CatalogItem[]): BulkPreview`

预览批量规则影响范围。

**返回值**:

```typescript
type BulkPreview = {
  affected: Set<string>;    // 受影响物品
  conflicts: Set<string>;   // 冲突物品
};
```

#### `normalizeItemName(name: string): string`

规范化物品名称（NFC标准化）。

#### `removeCustomItemFromWorkspace(workspace: Workspace, id: string): Workspace`

从工作区移除自定义物品。

---

## encoding - GBK编解码

### gbk.ts

#### `encodeGbk(text: string): Uint8Array`

将Unicode字符串编码为GBK字节流。

**抛出异常**: 如果包含无法编码的字符

**示例**:

```typescript
const bytes = encodeGbk('炎枪重黎');
// Uint8Array [209, 215, 199, 185, 214, 216, 192, 232]
```

#### `decodeGbk(bytes: Uint8Array): string`

将GBK字节流解码为Unicode字符串。

**抛出异常**: 如果字节流格式非法

**示例**:

```typescript
const text = decodeGbk(new Uint8Array([209, 215, 199, 185, 214, 216, 192, 232]));
// "炎枪重黎"
```

#### `assertGbkEncodable(text: string): void`

断言文本可以用GBK编码。

**抛出异常**: 如果包含无法编码的字符

---

## storage - 持久化层

### workspace.ts

#### `loadWorkspace(catalogVersion: string, client?: GameClient): Workspace`

从LocalStorage加载工作区。

**参数**:
- `catalogVersion`: 当前副本数据版本
- `client`: 客户端类型（默认`'std'`）

**返回值**: 工作区对象（如果不存在则创建初始工作区）

**抛出异常**: 如果数据损坏且隔离失败

#### `saveWorkspace(workspace: Workspace, client?: GameClient): boolean`

保存工作区到LocalStorage。

**返回值**: `true` 表示成功，`false` 表示失败

#### `resetWorkspace(catalogVersion: string, client?: GameClient): Workspace`

重置工作区为初始状态。

**返回值**: 新的初始工作区

#### `exportWorkspaceBackup(workspace: Workspace): string`

导出工作区为JSON字符串（用于备份）。

**返回值**: 可导入的JSON字符串

#### `readWorkspaceBackupFile(file: File, catalogVersion: string): Promise<Workspace>`

从备份文件读取工作区。

**参数**:
- `file`: 备份文件对象
- `catalogVersion`: 当前副本数据版本

**返回值**: Promise<工作区对象>

**抛出异常**: 如果文件过大或格式非法

### catalog.ts

#### `selectCatalogSnapshot(client: GameClient): CatalogSnapshot`

选择指定客户端的副本数据快照。

**参数**: `'std'` 或 `'origin'`

**返回值**: 对应的数据快照

#### `saveCatalogOverride(client: GameClient, data: unknown): void`

保存自定义副本数据覆盖。

#### `loadCatalogOverride(client: GameClient): unknown | null`

加载自定义副本数据覆盖。

#### `clearCatalogOverride(client: GameClient): void`

清除自定义副本数据覆盖。

---

## utils - 工具函数

### download.ts

#### `downloadText(filename: string, text: string): void`

触发浏览器下载文本文件。

**示例**:

```typescript
downloadText('config.json', JSON.stringify(data, null, 2));
```

#### `downloadBytes(filename: string, bytes: Uint8Array): void`

触发浏览器下载二进制文件。

**示例**:

```typescript
downloadBytes('config.us.jx3dat', gbkBytes);
```

---

## 类型定义汇总

### 核心类型

#### `ItemState`

```typescript
type ItemState = {
  skipLoot: boolean;   // 跳过拾取
  autoSell: boolean;   // 自动出售
  protect: boolean;    // 保护不出售
};
```

#### `ItemCategory`

```typescript
type ItemCategory =
  | 'equipment'          // 装备
  | 'equipmentExchange'  // 装备兑换牌
  | 'specialWeapon'      // 特效武器/升级道具
  | 'material'           // 材料
  | 'specialDrop'        // 特殊掉落
  | 'recipe'             // 配方
  | 'furniture'          // 家具
  | 'smallIron'          // 小铁
  | 'bigIron'            // 大铁
  | 'smallEnchant'       // 小附魔
  | 'bigEnchant'         // 大附魔
  | 'pet'                // 宠物
  | 'consumable'         // 消耗品
  | 'task'               // 任务物品
  | 'currency'           // 货币
  | 'other'              // 其他
  | 'unknown';           // 未知
```

#### `StateField`

```typescript
type StateField = 'skipLoot' | 'autoSell' | 'protect';
```

#### `GameClient`

```typescript
type GameClient = 'std' | 'origin';  // 旗舰端 | 缘起端
```

#### `Workspace`

```typescript
type Workspace = {
  schemaVersion: number;                    // Schema版本
  appVersion: string;                       // 应用版本
  catalogVersion: string;                   // 副本数据版本
  initializedAt: string;                    // 初始化时间
  updatedAt: string;                        // 更新时间
  itemStates: Array<[string, ItemState]>;   // 物品状态
  customItems: CustomItem[];                // 自定义物品
  customOverrides: string[];                // 自定义优先级
  selectedMapIds: number[];                 // 已勾选副本
  selectedBossKeys: string[];               // 已勾选首领
  expandedGroups: string[];                 // 展开的分组
  favoriteScopes: string[];                 // 收藏的范围
  filters: FilterState;                     // 筛选条件
  ui: UIState;                              // UI状态
};
```

#### `CatalogItem`

```typescript
type CatalogItem = {
  id: string;                               // 唯一ID
  name: string;                             // 物品名称
  category: ItemCategory;                   // 分类
  subtype?: string;                         // 子类型
  typeLabels?: string[];                    // TypeLabel标签
  quality?: number;                         // 品质
  itemLevel?: number;                       // 物品等级
  slot?: string;                            // 装备部位
  classification?: ClassificationSource;    // 分类来源
  sources: CatalogSource[];                 // 掉落来源
};
```

#### `CatalogSource`

```typescript
type CatalogSource = {
  mapId: number;        // 副本ID
  mapName: string;      // 副本名称
  expansion: string;    // 资料片
  difficulty: string;   // 难度
  bossName: string;     // 首领名称
};
```

---

## 常量定义

### domain/constants.ts

#### `APP_NAME`

应用名称: `"剑网3掉落工坊"`

#### `APP_VERSION`

应用版本: `"1.5.1"`

#### `AUTHOR`

作者: `"凌千羽·龙争虎斗"`

#### `DEFAULT_PROTECTED_ITEMS`

默认推荐保护物品（21项）:

```typescript
[
  '炎枪重黎', '腾空', '圆月双角', '五相斩', 
  '麒王逐魂', '金红狩命', '秋声烛影', 
  '旧禅镇', '相映红', '石剑·溟灵', '秋露白', 
  '曳影残剑', '赐清平', '卦预乾坤', '朝露昙华', 
  '夜话白鹭·鸿', '金红狩命·鸿', '秋声烛影·鸿', 
  '钧天·鸿', '水长生 ·雪银莲', '溯·鸿'
]
```

#### `DEFAULT_SELL_ITEMS`

默认自动出售物品（19项）:

```typescript
[
  '低级磨刀石', '低级缝纫包', '破旧的拳套', 
  '破旧的护腕', '破旧的鞋', '破旧的护腿', 
  '破旧的腰带', '破旧的帽子', '破旧的上衣', 
  '劣质的布料', '劣质的皮革', '普通的铁矿', 
  '普通的木材', '普通的石料', '损坏的卷轴', 
  '碎裂的宝石', '老旧的弓弦', '生锈的铁片', 
  '发霉的药材'
]
```

#### `CATEGORY_LABELS`

分类标签映射:

```typescript
{
  equipment: '装备',
  equipmentExchange: '装备兑换牌',
  specialWeapon: '特效武器/升级道具',
  // ... 其他分类
}
```

#### `CATEGORY_ORDER`

分类展示顺序:

```typescript
[
  'equipment',
  'equipmentExchange',
  'specialWeapon',
  'material',
  'specialDrop',
  // ... 其他分类
]
```

#### `MANAGED_PATHS`

茗伊插件配置路径:

```typescript
{
  skipLoot: 'MY_GKPLoot.tAutoPickupFilters',
  autoSell: 'MY_AutoSell.tCustomSellList',
  protect: 'MY_AutoSell.tProtectList',
}
```

---

## 使用示例

### 完整导出流程

```typescript
import { buildExportBatch } from './config/exporter';
import { stateMapFromWorkspace } from './domain/state';
import { downloadBytes } from './utils/download';

// 1. 从工作区提取状态
const stateMap = stateMapFromWorkspace(workspace);

// 2. 转换为导出格式
const namedStates = Array.from(stateMap.entries())
  .filter(([, state]) => state.skipLoot || state.autoSell || state.protect)
  .map(([name, state]) => ({ name, state }));

// 3. 构建导出批次
const batch = buildExportBatch(namedStates);

// 4. 下载综合配置
downloadBytes(batch.combined.filename, batch.combined.bytes);
```

### 完整导入流程

```typescript
import { decodeGbk } from './encoding/gbk';
import { parseManagedConfig, previewImport } from './config/importer';
import { applyChanges } from './domain/state';

// 1. 读取文件
const fileBytes = await file.arrayBuffer();
const text = decodeGbk(new Uint8Array(fileBytes));

// 2. 解析配置
const parsed = parseManagedConfig(text);

// 3. 预览变更
const preview = previewImport(parsed, workspace, 'merge');

// 4. 确认后应用
const changes = buildChangesFromPreview(preview, parsed);
const newWorkspace = applyChanges(workspace, changes);

// 5. 保存
saveWorkspace(newWorkspace);
```

### 批量操作

```typescript
import { createCategoryActionRules, previewBulkRules, applyChanges } from './domain/state';

// 1. 创建规则（批量跳过拾取所有宠物）
const rules = createCategoryActionRules('pet', 'skipLoot');

// 2. 预览影响
const preview = previewBulkRules(rules, workspace, scopedItems);
console.log(`将影响 ${preview.affected.size} 个物品`);
console.log(`发现 ${preview.conflicts.size} 个冲突`);

// 3. 应用规则
const changes = buildChangesFromRules(rules, scopedItems);
const newWorkspace = applyChanges(workspace, changes);
```

---

## 注意事项

### 1. 字符编码

所有导出的配置文件必须是**GBK编码、无BOM**，否则游戏插件无法识别。

```typescript
// ✅ 正确
const bytes = encodeGbk(text);  // GBK编码、无BOM

// ❌ 错误
const bytes = new TextEncoder().encode(text);  // UTF-8编码
```

### 2. 状态互斥

`autoSell` 和 `protect` 不能同时为 `true`，必须使用 `setStateField()` 设置以自动处理互斥。

```typescript
// ✅ 正确
state = setStateField(state, 'protect', true);  // 自动关闭autoSell

// ❌ 错误
state.protect = true;  // 可能导致冲突
```

### 3. 名称规范化

所有物品名称必须经过 `normalizeItemName()` 规范化（NFC标准化）。

```typescript
// ✅ 正确
const key = normalizeItemName(itemName);
stateMap.set(key, state);

// ❌ 错误
stateMap.set(itemName, state);  // 可能导致查找失败
```

### 4. 工作区持久化

修改工作区后必须调用 `saveWorkspace()` 保存，否则刷新页面会丢失。

```typescript
// ✅ 正确
const newWorkspace = applyChanges(workspace, changes);
saveWorkspace(newWorkspace);

// ❌ 错误
applyChanges(workspace, changes);  // 未保存，刷新丢失
```

---

## 版本兼容性

### Workspace Schema 版本

当前 `schemaVersion: 1`

如果未来需要破坏性变更，递增版本号并实现迁移函数：

```typescript
function migrateWorkspace(ws: Workspace): Workspace {
  if (ws.schemaVersion === 1) {
    // 迁移到 v2
    return { ...ws, schemaVersion: 2, /* 新字段 */ };
  }
  return ws;
}
```

### 副本数据版本

副本数据版本格式: `data.{客户端}_{资料片}_{大版本号}_{日期}`

跨版本兼容性由 `catalogVersion` 字段保证，工作区会记录创建时的数据版本。

---

**本文档描述的是 v1.5.1 版本的API，具体实现请参考源码。**
