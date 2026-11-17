import type { RefObject } from 'react';
import { formatCatalogVersion } from '../catalog';
import { APP_NAME, APP_NAME_EN, APP_VERSION, AUTHOR, type GameClient } from '../domain/constants';
import type { CatalogSnapshot } from '../domain/types';
import type { ExportKind, ThemeMode } from './types';

type TopBarProps = {
  client: GameClient;
  activeSnapshot: CatalogSnapshot;
  catalogIndexed: boolean;
  theme: ThemeMode;
  undoAvailable: boolean;
  hasScope: boolean;
  currentScopeLabel: string;
  exportMenuOpen: boolean;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  onSwitchClient: (client: GameClient) => void;
  onUndo: () => void;
  onToggleTheme: () => void;
  onOpenDialog: (dialog: 'custom' | 'workspace' | 'changelog') => void;
  onImportConfig: () => void;
  onExport: (kind: ExportKind) => void;
  onToggleExportMenu: () => void;
};

export function TopBar({
  client,
  activeSnapshot,
  catalogIndexed,
  theme,
  undoAvailable,
  hasScope,
  currentScopeLabel,
  exportMenuOpen,
  exportMenuRef,
  onSwitchClient,
  onUndo,
  onToggleTheme,
  onOpenDialog,
  onImportConfig,
  onExport,
  onToggleExportMenu,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <img className="brand-logo" src="./logo.jpg" alt={APP_NAME} />
        <div className="brand-meta">
          <div className="brand-line">
            <h1>{APP_NAME}</h1>
            <button
              type="button"
              className="version-pill"
              title={`工坊软件版本：v${APP_VERSION}（点击查看更新日志）`}
              onClick={() => onOpenDialog('changelog')}
            >
              v{APP_VERSION}
            </button>
            <span className="data-version-pill" title={`当前数据包版本：${activeSnapshot.catalogVersion}`}>
              {formatCatalogVersion(activeSnapshot.catalogVersion, client)}
            </span>
          </div>
          <div className="brand-sub">
            <span className="brand-en">{APP_NAME_EN}</span>
            <span className="brand-dot">·</span>
            <span className="brand-author" title={`开发者/作者：${AUTHOR}`}>by {AUTHOR}</span>
            <span className="brand-dot">·</span>
            <span className="brand-tagline">全副本掉落智能管理与配置工坊</span>
          </div>
        </div>
      </div>
      <div className="header-actions">
        <div className="client-switcher" role="group" aria-label="客户端版本切换">
          <button
            type="button"
            className={`client-tab ${client === 'std' ? 'active' : ''}`}
            title="切换至 剑网3 旗舰正式服 数据与工作区"
            onClick={() => onSwitchClient('std')}
          >
            旗舰版
          </button>
          <button
            type="button"
            className={`client-tab ${client === 'origin' ? 'active' : ''}`}
            title="切换至 剑网3 缘起怀旧服 数据与工作区"
            onClick={() => onSwitchClient('origin')}
          >
            缘起版
          </button>
        </div>
        <span className="data-badge" title={activeSnapshot.contentHash}><i /> {catalogIndexed ? `${client === 'origin' ? '缘起端' : '旗舰端'} · ${activeSnapshot.stats.uniqueItems.toLocaleString('zh-CN')} 项` : '目录载入中…'}</span>
        {undoAvailable && (
          <button
            className="button ghost undo-btn"
            type="button"
            title="撤销最近一次批量或单项变更"
            onClick={onUndo}
          >
            ↶ 撤销变更
          </button>
        )}
        <button
          className="button ghost theme-toggle-btn"
          type="button"
          title={theme === 'dark' ? '当前为深色模式（点击切换为浅色模式）' : '当前为浅色模式（点击切换为深色模式）'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? '🌙 深色' : '☀️ 浅色'}
        </button>
        <button className="button ghost" type="button" onClick={() => onOpenDialog('custom')}>＋ 自定义物品</button>
        <button className="button ghost" type="button" onClick={() => onOpenDialog('workspace')}>工作区</button>
        <button className="button ghost" type="button" onClick={onImportConfig}>导入配置</button>

        <div className="export-split-group" ref={exportMenuRef}>
          <button
            className="button primary export-main-btn"
            type="button"
            disabled={!catalogIndexed}
            title={`导出当前所选范围（${hasScope ? currentScopeLabel : '全部有效物品'}）的综合配置；未勾选的副本与年代不包含在导出文件中。`}
            onClick={() => onExport('combined')}
          >
            ⚡ 导出综合配置
          </button>
          <button
            className={`button primary export-dropdown-btn ${exportMenuOpen ? 'open' : ''}`}
            type="button"
            disabled={!catalogIndexed}
            aria-label="展开更多导出选项"
            title="更多导出选项"
            onClick={onToggleExportMenu}
          >
            ▾
          </button>
          {exportMenuOpen && (
            <div className="export-menu-popover" role="menu">
              <button
                type="button"
                className="export-menu-item featured"
                onClick={() => onExport('combined')}
              >
                <span className="menu-icon">⚡</span>
                <div>
                  <strong>导出综合配置 (推荐)</strong>
                  <small>同时包含所选范围内的拾取过滤与自动出售策略，未选副本自动忽略</small>
                </div>
              </button>
              <div className="export-menu-divider" />
              <button
                type="button"
                className="export-menu-item"
                onClick={() => onExport('pickup')}
              >
                <span className="menu-icon">📥</span>
                <div>
                  <strong>仅导出拾取过滤</strong>
                  <small>仅生成已勾选范围的 MY_GKPLoot 插件配置</small>
                </div>
              </button>
              <button
                type="button"
                className="export-menu-item"
                onClick={() => onExport('sell')}
              >
                <span className="menu-icon">💰</span>
                <div>
                  <strong>仅导出自动出售</strong>
                  <small>仅生成已勾选范围的 MY_AutoSell 插件配置</small>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
