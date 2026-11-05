<div align="center">

<img src="web/public/logo.jpg" alt="剑网3掉落工坊 Logo" width="120" style="border-radius: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.35);" />

# 剑网3掉落工坊

副本掉落配置管理工具，支持旗舰端与缘起端

[![Release](https://img.shields.io/badge/Release-v1.6.0-emerald.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge/releases)
[![Data Version](https://img.shields.io/badge/Data-苍生铸世__v1__261031-38bdf8.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge)
[![Platform](https://img.shields.io/badge/Platform-JX3%20旗舰端%20%2F%20缘起端-emerald.svg?style=flat-square)](https://jx3.xoyo.com)
[![Offline Ready](https://img.shields.io/badge/Offline-100%25%20Single--File-blueviolet.svg?style=flat-square)](https://github.com/cyt7732/jx3-loot-forge)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange.svg?style=flat-square)](LICENSE)

*作者：凌千羽 · 龙争虎斗*

</div>

---

## 项目简介

剑网3掉落工坊是面向《剑侠情缘网络版叁》旗舰端与缘起端的副本掉落配置工具。本工具将茗伊插件的"跳过拾取"（`MY_GKPLoot`）与"自动出售/保护"（`MY_AutoSell`）两套配置合并为单一 `.us.jx3dat` 文件，用户在游戏内导入一次即可同时应用两类规则。

数据覆盖旗舰端与缘起端全赛季副本，支持按副本、分类、自定义需求进行筛选与配置。

## 核心功能

### 综合配置导出

将茗伊插件的跳过拾取配置（`MY_GKPLoot.tAutoPickupFilters`）与自动出售/保护配置（`MY_AutoSell.tCustomSellList` / `MY_AutoSell.tProtectList`）整合为单一 `.us.jx3dat` 文件。游戏内通过茗伊插件全局设置导入后，两类规则同时生效。

### 默认配置对齐

工具内置茗伊插件默认的 21 项珍品保护列表与 19 项杂物自动出售列表，初始状态与插件官方默认行为完全一致。

### 单文件离线运行

整个应用打包为独立 HTML 文件（约 26MB），包含完整数据与资源，可在现代浏览器中直接打开使用，无需网络连接或额外依赖。

### 数据覆盖

支持旗舰端与缘起端全赛季副本数据，物品按"装备""装备兑换牌""特效武器/升级道具""大铁""小铁""宠物""家具"等类别分类。

### 自定义优先级

用户自定义物品在批量操作时自动跳过，不会被副本范围规则覆盖。修改自定义物品状态需在自定义区域单独操作。

### 冲突检测

批量应用规则时，工具自动检测珍品保护与自动出售的冲突，并阻止可能导致误售的操作。

### 主题切换

提供浅色与深色两套配色方案，浏览器本地记忆用户选择。

### 撤销功能

支持撤销至上一次保存状态。

## 使用说明

### 配置导出

1. 在工具中勾选需要跳过拾取或自动出售的物品
2. 点击右上角"导出综合配置"按钮
3. 下载生成的 `.us.jx3dat` 文件

### 游戏内导入

1. 启动游戏并打开茗伊插件集（快捷键 `Ctrl + M`）
2. 依次进入【系统】→【全局设置】→【导入配置】
3. 选择下载的配置文件并导入
4. 跳过拾取与自动出售规则立即生效

## 部署方式

### 离线版（推荐）

下载根目录的 `剑网3掉落工坊.html` 文件，在浏览器中直接打开即可使用。该文件包含完整数据，无需联网。

### 开发环境

要求 Node.js 22.13 或更高版本：

```bash
cd web
npm install
npm run dev          # 启动开发服务器
npm run build:offline # 构建单文件离线版
```

## 目录结构

```
jx3-loot-forge/
├── 剑网3掉落工坊.html          # 单文件离线版
├── web/                       # 源代码
│   ├── src/
│   │   ├── catalog/           # 副本数据与物品分类引擎
│   │   ├── config/            # 配置文件导出与导入模块
│   │   ├── domain/            # 核心业务逻辑与类型定义
│   │   ├── storage/           # 本地存储管理
│   │   └── ui/                # 用户界面组件
│   ├── scripts/               # 构建与数据维护脚本
│   └── tests/                 # 自动化测试
├── docs/                      # 开发文档
│   ├── ARCHITECTURE.md        # 架构设计文档
│   ├── DEVELOPMENT.md         # 开发指南
│   └── API.md                 # 模块API文档
├── CHANGELOG.md               # 版本变更日志
└── LICENSE                    # AGPL-3.0 开源许可证
```

## 技术说明

### 配置文件格式

导出的 `.us.jx3dat` 文件采用 GBK 编码的 Lua table 格式，符合茗伊插件配置规范。每次导出在数据中插入配置指纹，格式为：

```
『剑网3掉落工坊』 v{version} by 凌千羽·龙争虎斗 <YYYYmmdd_HHMMss>
```

### 数据版本

- 旗舰端：`data.旗舰_苍生铸世_v1_261031`
- 缘起端：`data.缘起_剑胆琴心_v3_260928`

### 隐私与安全

所有配置数据存储在浏览器本地 `localStorage`，不向任何第三方服务器传输。

## 许可证

本项目基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 开源。

游戏内素材与副本数据版权归《剑侠情缘网络版叁》及珠海西山居软件有限公司所有。本工具为配置辅助工具，不修改游戏客户端或内存数据。

---

<div align="center">
  <sub>Made with ❤️ for JX3 Players by 凌千羽 · 龙争虎斗</sub>
</div>
