# 开发指南

## 快速开始

### 环境要求

- **Node.js**: >= 22.13.0
- **包管理器**: npm（推荐使用项目锁定的版本）
- **操作系统**: Windows / macOS / Linux
- **浏览器**: 现代浏览器（Chrome 90+, Edge 90+, Firefox 88+, Safari 14+）

### 克隆与安装

```bash
# 克隆项目
git clone https://github.com/cyt7732/jx3-loot-forge.git
cd jx3-loot-forge

# 进入web目录
cd web

# 安装依赖
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 即可看到开发版界面。

---

## 项目结构

```
jx3-loot-forge/
├── 剑网3掉落工坊.html          # 单文件离线版（构建产物）
├── web/                       # 前端源码目录
│   ├── src/
│   │   ├── catalog/           # 副本数据与分类引擎
│   │   ├── config/            # 配置导出/导入
│   │   ├── domain/            # 领域模型
│   │   ├── encoding/          # GBK编解码
│   │   ├── storage/           # 持久化
│   │   ├── ui/                # React组件
│   │   └── utils/             # 工具函数
│   ├── tests/                 # 测试文件
│   ├── scripts/               # 构建脚本
│   │   ├── build-offline.mjs  # 单文件打包
│   │   ├── crawl-catalog.mjs  # 数据爬取
│   │   └── reclassify-catalog.mjs # 重分类
│   ├── public/                # 静态资源
│   └── package.json
├── docs/                      # 文档
├── data/                      # 原始数据
└── artifacts/                 # 发布归档
```

---

## 常用命令

### 开发命令

```bash
# 启动开发服务器（热更新）
npm run dev

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 运行测试
npm test

# 完整质量检查（类型+Lint+测试+构建）
npm run check
```

### 构建命令

```bash
# 构建在线版（输出到 dist/）
npm run build:web

# 构建单文件离线版（输出到 ../剑网3掉落工坊.html）
npm run build:offline

# 本地预览生产构建
npm run start
```

### 数据维护命令

```bash
# 爬取旗舰端副本数据
npm run crawl:catalog:std

# 爬取缘起端副本数据
npm run crawl:catalog:origin

# 重新分类已有数据
npm run reclassify:catalog

# 打包发布产物
npm run package:artifacts
```

---

## 添加新功能

### 1. 添加新的物品分类

**场景**: 需要新增一个物品大类（如"坐骑"）

#### 步骤

**① 在类型定义中添加新分类**

```typescript
// web/src/domain/types.ts
export type ItemCategory =
  | 'equipment'
  | 'mount'  // ← 新增
  | 'pet'
  // ...
```

**② 添加分类标签**

```typescript
// web/src/domain/constants.ts
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  equipment: '装备',
  mount: '坐骑',  // ← 新增
  pet: '宠物',
  // ...
};

export const CATEGORY_ORDER: ItemCategory[] = [
  'equipment',
  'mount',  // ← 新增（决定展示顺序）
  'pet',
  // ...
];
```

**③ 更新分类规则**

```typescript
// web/src/catalog/type-label-rules.json
{
  "primaryTypeLabels": {
    "mount": ["坐骑", "骑宠"]  // ← 新增
  }
}
```

**④ 添加图标**

```typescript
// web/src/ui/LootForgeApp.tsx
const CATEGORY_ICONS: Record<ItemCategory, string> = {
  equipment: '⚔️',
  mount: '🐴',  // ← 新增
  pet: '🐾',
  // ...
};
```

**⑤ 运行测试确保没有破坏现有功能**

```bash
npm test
npm run typecheck
```

### 2. 添加新的批量操作预设

**场景**: 添加"日常任务模式"预设（自动出售任务物品）

#### 步骤

**① 定义规则集**

```typescript
// web/src/domain/state.ts
export function createDailyTaskRules(): BulkRuleSet {
  return {
    rules: [
      {
        category: 'task',
        field: 'autoSell',
        action: 'enable',
      },
    ],
    protections: [], // 不保护任何物品
  };
}
```

**② 在UI中添加按钮**

```typescript
// web/src/ui/LootForgeApp.tsx
<button
  onClick={() => {
    const rules = createDailyTaskRules();
    const preview = previewBulkRules(rules, workspace);
    // 应用规则...
  }}
>
  日常任务模式
</button>
```

### 3. 添加新的导出格式

**场景**: 除了Lua格式，还想导出JSON格式

#### 步骤

**① 添加导出函数**

```typescript
// web/src/config/exporter.ts
export function buildJsonExport(namedStates: NamedState[]): string {
  const data = {
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    items: namedStates.map(({ name, state }) => ({
      name,
      skipLoot: state.skipLoot,
      autoSell: state.autoSell,
      protect: state.protect,
    })),
  };
  return JSON.stringify(data, null, 2);
}
```

**② 在UI中添加导出按钮**

```typescript
<button
  onClick={() => {
    const json = buildJsonExport(namedStates);
    downloadText('配置.json', json);
  }}
>
  导出JSON
</button>
```

---

## 调试技巧

### 1. 调试数据分类问题

**问题**: 某个物品分类错误

**调试步骤**:

```typescript
// 在浏览器控制台运行
import { classifyItem } from './catalog/classification';

const result = classifyItem({
  name: '炎枪重黎',
  typeLabels: ['特效武器', '长兵类'],
  isEquip: true,
  slot: '武器',
});

console.log(result);
// { category: 'specialWeapon', classification: 'type-label', subtype: '长兵类' }
```

### 2. 调试配置导出问题

**问题**: 导出的配置文件游戏无法识别

**检查清单**:

```bash
# 1. 检查文件编码（必须是GBK无BOM）
file -bi 配置.us.jx3dat
# 应显示: charset=unknown 或 charset=binary（不是utf-8）

# 2. 检查是否包含BOM
xxd 配置.us.jx3dat | head -1
# 前三个字节不应该是 efbb bf（UTF-8 BOM）

# 3. 检查Lua语法
lua -e "dofile('配置.us.jx3dat')"
# 不应该有语法错误
```

**调试代码**:

```typescript
// 在测试中验证导出结果
import { buildExportBatch } from './config/exporter';
import { decodeGbk, encodeGbk } from './encoding/gbk';

const batch = buildExportBatch([
  { name: '测试物品', state: { skipLoot: true, autoSell: false, protect: false } },
]);

// 1. 检查文本格式
console.log(batch.combined.text);

// 2. 检查是否无BOM
const bytes = batch.combined.bytes;
console.log('前3字节:', Array.from(bytes.slice(0, 3)));
// 不应该是 [239, 187, 191]

// 3. 验证往返编码
const decoded = decodeGbk(bytes);
console.log('往返成功:', decoded === batch.combined.text);
```

### 3. 调试LocalStorage问题

**问题**: 工作区状态丢失或损坏

**调试步骤**:

```javascript
// 1. 在浏览器控制台检查原始数据
localStorage.getItem('loot-forge:workspace:std');

// 2. 手动导出工作区
const ws = JSON.parse(localStorage.getItem('loot-forge:workspace:std'));
console.log(JSON.stringify(ws, null, 2));

// 3. 检查隔离备份
Object.keys(localStorage)
  .filter(k => k.includes('corrupted'))
  .forEach(k => console.log(k, localStorage.getItem(k)));

// 4. 清除损坏的数据（谨慎使用！）
localStorage.removeItem('loot-forge:workspace:std');
```

---

## 常见问题

### Q1: 修改代码后界面没有更新？

**A**: 检查以下几点：

1. 开发服务器是否正常运行？（查看终端输出）
2. 浏览器是否缓存了旧版本？（硬刷新：Ctrl+Shift+R）
3. 是否修改了类型定义但没有重启？（重启 `npm run dev`）

### Q2: 构建单文件离线版失败？

**A**: 常见原因：

```bash
# 1. 先构建在线版
npm run build:web

# 2. 检查dist目录是否存在
ls -la dist/

# 3. 再构建离线版
npm run build:offline

# 4. 如果提示内存不足
NODE_OPTIONS="--max-old-space-size=4096" npm run build:offline
```

### Q3: 测试失败怎么办？

**A**: 查看具体报错信息：

```bash
# 运行单个测试文件
npm test tests/config.test.ts

# 查看详细输出
npm test -- --reporter=verbose

# 更新快照（如果是快照测试失败）
npm test -- -u
```

### Q4: TypeScript类型报错？

**A**: 常见解决方案：

```bash
# 1. 清理缓存
rm -rf node_modules/.cache

# 2. 重新安装依赖
rm -rf node_modules
npm install

# 3. 重启IDE的TypeScript服务
# VSCode: Cmd/Ctrl + Shift + P -> "TypeScript: Restart TS Server"
```

### Q5: Git Bash中文乱码？

**A**: 确保环境变量设置正确：

```bash
# 在 ~/.bashrc 中添加
export PYTHONIOENCODING=utf-8
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

# 重新加载
source ~/.bashrc
```

---

## 数据维护

### 更新副本数据

**时机**: 游戏版本更新、新副本上线

#### 步骤

**① 爬取最新数据**

```bash
# 旗舰端
npm run crawl:catalog:std

# 缘起端
npm run crawl:catalog:origin
```

数据会保存到 `data/catalog-std.json` 和 `data/catalog-origin.json`

**② 检查数据质量**

```bash
# 查看物品总数
jq '.items | length' data/catalog-std.json

# 查看副本列表
jq '.maps[].name' data/catalog-std.json

# 检查是否有未分类物品
jq '.items[] | select(.category == "unknown") | .name' data/catalog-std.json
```

**③ 重新分类（如果更新了分类规则）**

```bash
npm run reclassify:catalog
```

**④ 运行测试确保没有破坏现有功能**

```bash
npm test
```

**⑤ 更新版本号**

```typescript
// web/src/domain/constants.ts
export const CATALOG_VERSION = '260928';  // ← 更新日期
```

**⑥ 重新构建**

```bash
npm run build:offline
```

### 更新分类规则

**场景**: 发现某些物品分类不准确，需要调整规则

#### 步骤

**① 修改规则配置**

```json
// web/src/catalog/type-label-rules.json
{
  "primaryTypeLabels": {
    "specialWeapon": ["特效武器", "成品武器", "胚子武器"]
  }
}
```

**② 重新分类已有数据**

```bash
npm run reclassify:catalog
```

**③ 验证分类结果**

```bash
# 检查特效武器分类数量
jq '.items[] | select(.category == "specialWeapon") | .name' data/catalog-std.json | wc -l
```

**④ 运行测试**

```bash
npm test tests/classification.test.ts
```

---

## 发布流程

### 1. 版本号规划

遵循语义化版本：

- **主版本号**: 不兼容的变更（如重写架构）
- **次版本号**: 新功能（如支持缘起端）
- **修订号**: Bug修复（如修正分类错误）

### 2. 发布检查清单

```bash
# ✅ 1. 更新版本号
# 修改 web/package.json 和 web/src/domain/constants.ts

# ✅ 2. 更新CHANGELOG.md
# 按 Keep a Changelog 格式记录变更

# ✅ 3. 完整质量检查
npm run check

# ✅ 4. 构建产物
npm run build:offline

# ✅ 5. 手动测试关键功能
# - 导出配置
# - 导入配置
# - 主题切换
# - 双端切换

# ✅ 6. 提交代码
git add .
git commit -m "release: v1.5.2"
git tag v1.5.2
git push origin main --tags

# ✅ 7. 创建GitHub Release
# 上传 剑网3掉落工坊.html
# 填写 Release Notes
```

### 3. 发布产物打包

```bash
npm run package:artifacts
```

会在 `artifacts/剑网3掉落工坊-v1.5.2/` 生成：

- `剑网3掉落工坊.html` - 单文件离线版
- `README.md` - 使用说明
- `CHANGELOG.md` - 变更日志
- `VERSION.json` - 版本元数据

---

## 代码规范

### TypeScript规范

```typescript
// ✅ 推荐：使用类型别名
type ItemState = {
  skipLoot: boolean;
  autoSell: boolean;
  protect: boolean;
};

// ❌ 不推荐：使用any
function process(data: any) { }

// ✅ 推荐：显式类型注解
function process(data: ItemState): void { }

// ✅ 推荐：使用运行时校验
export function assertValidState(state: ItemState): void {
  if (state.autoSell && state.protect) {
    throw new Error('冲突');
  }
}
```

### 命名规范

```typescript
// 类型：PascalCase
type ItemCategory = 'equipment' | 'pet';

// 函数：camelCase
function buildExportBatch() { }

// 常量：UPPER_SNAKE_CASE
const DEFAULT_PROTECTED_ITEMS = [];

// 组件：PascalCase
function LootForgeApp() { }

// 文件名：kebab-case
// classification.ts
// loot-forge-app.tsx
```

### React规范

```typescript
// ✅ 推荐：使用函数组件 + hooks
function ItemRow({ item }: { item: ViewItem }) {
  const [expanded, setExpanded] = useState(false);
  return <tr>...</tr>;
}

// ✅ 推荐：props解构
function Button({ label, onClick }: ButtonProps) { }

// ❌ 不推荐：props直接传递
function Button(props: ButtonProps) {
  return <button onClick={props.onClick}>{props.label}</button>;
}
```

---

## Git工作流

### 分支策略

```
main          - 稳定版本分支（只接受release合并）
  ↑
develop       - 开发分支（日常开发）
  ↑
feature/*     - 功能分支
  ↑
bugfix/*      - 修复分支
```

### 提交信息规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加缘起端支持
fix: 修复导出配置文件编码问题
docs: 更新架构设计文档
chore: 升级依赖版本
test: 添加GBK编码测试
refactor: 重构物品分类逻辑
perf: 优化大列表渲染性能
```

### 示例工作流

```bash
# 1. 创建功能分支
git checkout -b feature/add-mount-category

# 2. 开发功能
# ... 编码 ...

# 3. 提交变更
git add .
git commit -m "feat: 添加坐骑分类支持"

# 4. 推送到远程
git push origin feature/add-mount-category

# 5. 创建Pull Request
# 在GitHub上操作

# 6. 合并到develop
git checkout develop
git merge feature/add-mount-category

# 7. 删除功能分支
git branch -d feature/add-mount-category
```

---

## 性能优化建议

### 当前性能瓶颈（如果遇到）

1. **大列表渲染慢**: 物品超过1000条时可能卡顿
2. **状态更新频繁**: 20+个useState导致重渲染
3. **过滤计算重复**: 每次渲染都重新计算

### 优化方案

#### 1. 虚拟化长列表

```bash
npm install @tanstack/react-virtual
```

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function ItemTable({ items }: { items: ViewItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <ItemRow key={items[virtualRow.index].id} item={items[virtualRow.index]} />
        ))}
      </div>
    </div>
  );
}
```

#### 2. memo优化组件

```typescript
const ItemRow = React.memo(
  ({ item, onChange }: ItemRowProps) => {
    return <tr>...</tr>;
  },
  (prev, next) => 
    prev.item.id === next.item.id &&
    prev.item.state === next.item.state
);
```

#### 3. useMemo缓存计算

```typescript
const filteredItems = useMemo(() => {
  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (scopeQuery && !item.name.includes(scopeQuery)) return false;
    return true;
  });
}, [items, filters, scopeQuery]);
```

---

## 资源链接

- **项目仓库**: https://github.com/cyt7732/jx3-loot-forge
- **问题反馈**: https://github.com/cyt7732/jx3-loot-forge/issues
- **剑网三官网**: https://jx3.xoyo.com
- **茗伊插件集**: https://www.jx3box.com/bps/

---

## 获取帮助

遇到问题？

1. 查看本文档的"常见问题"章节
2. 查看 `docs/ARCHITECTURE.md` 理解系统设计
3. 查看 `docs/API.md` 了解模块接口
4. 在GitHub提issue（附上完整报错信息和复现步骤）
5. 查看测试用例学习用法（`tests/` 目录）

---

**Happy Coding! 🚀**
