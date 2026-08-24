# 剑网3掉落工坊

剑网3旗舰端副本掉落配置工坊。它把全部历史副本、Boss 与掉落整理成可筛选目录，统一维护“跳过拾取”“自动出售”“保护不出售”三个状态，并生成游戏可直接导入的 `.us.jx3dat` 文件。

当前版本：`v0.1.1` · by 凌千羽·龙争虎斗

## 第一版能力

- 内置旗舰端完整数据快照：254 个 MapID、981 个 Boss、43,033 条掉落、16,571 个精确去重物品名称。
- 支持版本 / 副本 / 难度 / Boss 多选，以及类别、品质、装备部位、装等和状态筛选。
- 按物品类型批量设置三个状态；应用前展示差异，自定义物品始终排除，一次应用后可撤销。
- “自动出售”与“保护不出售”严格互斥；“跳过拾取”与二者独立。
- 首次启动建立 21 项可编辑的保护基线，不保留参考文件中的 19 项默认出售物品。
- 支持自定义名称、已有 `.us.jx3dat` 安全导入（合并 / 替换预览）、工作区备份和本地持久化。
- 跳过拾取与自动出售文件可分别下载或同时下载；文件为 CP936/GBK、无 BOM、单行，后缀固定为 `.us.jx3dat`。
- 可以构建单个 `index.html` 离线版，双击即可使用，不依赖服务器。

配置指纹格式：

```text
『剑网3掉落工坊』 v0.1.1 by 凌千羽·龙争虎斗 <YYYYMMDD_HHmmss>
```

## 本地开发

需要 Node.js 22.13 或更高版本。

```powershell
cd web
npm install
npm run dev
```

完整验收：

```powershell
npm run check
```

生成可直接分发的单文件离线版：

```powershell
npm run build:offline
```

产物位于 `web/dist/offline/index.html`。复制这一个文件即可使用。

## 更新旗舰端数据

数据只由维护脚本从 JX3BOX API 构建，不读取 `data/raw` 中的参考配置：

```powershell
cd web
npm run crawl:catalog
```

脚本遍历 `/fb/info?client=std` 返回的全部 MapID，再读取完整掉落与物品元数据。只有所有 MapID 成功且完整性检查通过时才写入快照；内容哈希排除抓取时间，因此远端数据不变时不会制造假更新。

在线页面可通过静态 `manifest.json` 检查新数据，校验 SHA-256 后保存到 IndexedDB。离线版默认不联网，可以手动导入 `catalog.std.json` 数据包。

## 目录

- `web/`：网页源码、测试、数据构建脚本与离线构建器。
- `docs/DEVELOPMENT_PLAN.md`：完整产品约束、数据契约、发布方案与后续路线图。
- `data/raw/`：本地参考样本，不参与生产构建，也不应提交个人配置。

第一版只支持旗舰端 `client=std`。怀旧端 `client=origin` 已列入后续路线图；项目永不兼容 IE。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)。通过网络向用户提供修改版时，也应按 AGPL-3.0 向这些用户提供相应源代码。
