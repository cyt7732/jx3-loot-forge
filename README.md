<div align="center">

<img src="web/public/logo.jpg" alt="剑网3掉落工坊 Logo" width="120" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />

# 剑网3掉落工坊 (JX3 Loot Forge)

**全副本掉落智能管理 · 跳过拾取与自动出售一键合一配置工坊**

[![Release](https://img.shields.io/badge/Release-v1.0.5-emerald.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge/releases)
[![Data Version](https://img.shields.io/badge/Data-丝路风语--260823-38bdf8.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge)
[![Platform](https://img.shields.io/badge/Platform-JX3%20旗舰端-emerald.svg?style=flat-square)](https://jx3.xoyo.com)
[![Offline Ready](https://img.shields.io/badge/Offline-100%25%20Single--File-blueviolet.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange.svg?style=flat-square)](LICENSE)

*作者：凌千羽 · 龙争虎斗*

</div>

---

## 📖 项目简介

《**剑网3掉落工坊**》（JX3 Loot Forge）是一款专为《剑侠情缘网络版叁》旗舰端玩家与团长打造的现代化副本掉落管理工具。

通过完整整理自 70 级「风起稻香」至 130 级「丝路风语」全赛季 **254 个副本、981 个 Boss、16,571 件去重物品**，提供多维筛选、可视化策略直选、用户自定义物品库，并独家支持**【跳过拾取】与【自动出售 / 珍品保护】一键导出为单一合一配置文件**。游戏内仅需一次导入，所有策略立即全部生效！

---

## ✨ 核心特性

| 模块 | 特性说明 |
| :--- | :--- |
| ⚡ **合一配置导出 (独家)** | 将跳过拾取（`MY_GKPLoot`）与自动出售/保护（`MY_AutoSell`）合并为单一 `.us.jx3dat` 文件，游戏内点击一次导入全部生效。 |
| 🎮 **默认插件配置全量对齐** | 完美内嵌茗伊默认的 21 项珍品推荐保护与 19 项默认出售杂物，初始不预设多余跳过拾取规则，与游戏插件官方默认行为保持 100% 一致。 |
| 🎯 **全量精准数据覆盖** | 覆盖 70~130 级全赛季 254 个副本，细化分类“装备”“兑换牌”“特殊掉落”“大铁”“小铁”“宠物”“家具”“附魔”等实用大类。 |
| 📦 **100% 离线单文件运行** | 零网络依赖、零服务器需求，独立单文件 `剑网3掉落工坊.html` 双击即用，自带全部数据与水墨图标，极易发群分享。 |
| 🖥️ **Windows 原生免安装客户端** | 基于 Tauri 2.0 编译的单文件绿色版 `剑网3掉落工坊-v1.0.5.exe`（仅约 8MB），内存极低，原生丝滑。 |
| ✨ **用户自定义物品体系** | 支持任意自定义物品录入，独立受控，绝不受任何批量规则误伤，左侧专属【✨ 用户自定义】顶层管理节点。 |
| 💎 **顶栏高定操作中心** | 分段按钮（Split Button）兼顾一键快速导出与细分独立导出，支持 `↶ 撤销变更` 动态秒级还原。 |
| 🛡️ **智能防冲突与珍品保护** | 默认内置玄晶、特殊武器等珍品推荐保护；批量应用时自动检测冲突，保证珍品绝不被误售。 |
| 🎨 **正统大唐水墨美学** | 正统水墨狂草“剑”字与朱砂“叁”印章 Logo，全平台浏览器标签 Favicon 专属内嵌，纯正剑三视觉体验。 |
| 📝 **纯净通俗玩家文案** | 彻底剔除底层开发术语，所有界面用语、弹窗提示与操作说明均改写为自然清晰的通俗中文。 |

---

## 🎮 游戏内使用与一键导入教程

### 第一步：从工坊导出配置
在工坊顶栏右上角直接点击 **【⚡ 导出合一配置】**，下载获得合一配置文件（如 `掉落工坊_合一配置_20260825-230000.us.jx3dat`）。保存在桌面或下载文件夹皆可。

### 第二步：游戏内一键导入
1. 进入游戏，打开 **茗伊插件集**（快捷键 `Ctrl + M` 或点击小地图头像旁茗伊齿轮）；
2. 依次点击：**【系统】 -> 【全局设置】 -> 【导入配置】**；
3. 选择刚才下载的文件（支持直接从桌面、下载目录或 `Interface\MY#DATA\!all-users@zhcn_hd\export\settings\` 路径中选取）并点击 **【导入】**；
4. **完成！** 团队拾取过滤（跳过拾取）与自动出售/保护不出售规则已一次性全部配置生效。

---

## 🚀 快速上手与使用方式

### 方式一：Windows 单文件绿色版（⭐ 极速免安装原生客户端）
通过 GitHub Releases 提供的 **`剑网3掉落工坊-v1.0.5.exe`**：
- **纯单文件绿色便携版**：无需安装向导、不写系统注册表，体积仅约 5MB；
- **原生 WebView2 硬件加速**：内存占用低至 30~50MB，丝毫不抢占游戏与多开打本资源；
- **全内置离线数据库**：内嵌 70~130 级全赛季 16,571 项数据，随拷随用、断网可用。

### 方式二：单文件离线网页版
项目根目录下的 **[`剑网3掉落工坊.html`](剑网3掉落工坊.html)** 是一个打包了全部离线数据、样式与逻辑的独立 HTML：
- **无需安装 Node.js、无需联网、无需启动服务**；
- 直接双击文件在任意现代浏览器（Edge、Chrome、Firefox、Safari）中打开即用；
- 适合随身携带、发群、发亲友或跨平台（Mac/Linux）使用。

### 方式三：Windows 极速启动脚本
双击根目录下的 **`启动网页.bat`**，脚本会自动检测并唤起离线版，或在需要时自动执行构建。

### 方式四：本地开发与构建
需要 Node.js 22.13 或更高版本：

```bash
# 1. 进入 web 目录并安装依赖
cd web
npm install

# 2. 启动本地开发服务器（热更新）
npm run dev

# 3. 完整质量检查（类型检查、Lint、测试与构建）
npm run check

# 4. 构建单文件离线版 HTML
npm run build:offline

# 5. 生成 Tauri 桌面客户端图标
npm run icon:tauri
```

---

## 🗂️ 目录结构与数据流

```text
jx3-loot-forge/
├── 剑网3掉落工坊.html          # 🌟 100% 独立单文件离线版（双击即用）
├── 启动网页.bat                # Windows 一键快速启动脚本
├── CHANGELOG.md               # 语义化版本变更日志
├── VERSION.json               # 产品版本与数据版本元数据
├── LICENSE                    # AGPL-3.0 开源许可证
├── docs/                      # 架构设计、发布规范与交接文档
└── web/                       # 前端源码、构建管线与数据维护脚本
    ├── src/
    │   ├── catalog/           # 副本数据库与智能规则分类器
    │   ├── config/            # 游戏 .us.jx3dat GBK 导出与导入引擎
    │   ├── domain/            # 核心业务状态、领域模型与类型定义
    │   ├── storage/           # 本地持久化与 IndexedDB 缓存控制
    │   └── ui/                # LootForgeApp 界面组件与交互体系
    ├── scripts/
    │   ├── crawl-catalog.mjs  # 官方/魔盒副本与掉落数据抓取脚本
    │   ├── reclassify-catalog.mjs # 离线目录智能重分类脚本
    │   └── build-offline.mjs  # 单文件离线 HTML 自动化打包器
    └── tests/                 # Vitest 自动化测试套件（覆盖核心领域模型与配置算法）
```

---

## 🛡️ 数据安全与配置指纹

工坊导出的配置文件严格遵循剑网3插件格式规范：
- **编码格式**：CP936 / GBK 编码、无 BOM、单行格式；
- **配置指纹**：每次导出均在数据首项附带标准指纹标记，插件无感解析：
  ```text
  『剑网3掉落工坊』 v1.0.4 by 凌千羽·龙争虎斗 <YYYYMMDD_HHmmss>
  ```
- **隐私与安全**：纯前端与本地计算，所有自选设置实时保存在浏览器本地（`localStorage`），绝不向任何第三方服务器上传个人配置。

---

## 📄 许可证与声明

- 本项目基于 **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** 开源。
- 游戏内相关素材、副本与物品数据版权归属《剑侠情缘网络版叁》及珠海西山居软件有限公司所有。
- 本工具为玩家自制辅助配置工具，旨在提升游戏便利性，绝不修改任何游戏本体内存与客户端文件。

---

<div align="center">
  <sub>Made with ❤️ for JX3 Players by <b>凌千羽 · 龙争虎斗</b></sub>
</div>
