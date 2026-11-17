import type { ItemState } from '../domain/types';
import { CATEGORY_LABELS } from '../domain/constants';
import { cloneState } from '../domain/state';
import { itemDisposition, itemMetaParts, itemQualityClass } from './display';
import { DispositionSelector, StateButton } from './primitives';
import type { CategorySummary, DrawerStateView, ItemDisposition, ViewItem } from './types';

export const DRAWER_PAGE_SIZE = 20;

type ItemDrawerProps = {
  summary: CategorySummary;
  drawerQuery: string;
  drawerStateView: DrawerStateView;
  drawerItems: ViewItem[];
  visibleDrawerItems: ViewItem[];
  currentDrawerPage: number;
  drawerTotalPages: number;
  stateMap: Map<string, ItemState>;
  customOverrides: Set<string>;
  catalogIdSet: Set<string>;
  customScopeActive: boolean;
  onDrawerQueryChange: (query: string) => void;
  onDrawerStateViewChange: (view: DrawerStateView) => void;
  onCollapse: () => void;
  onPageChange: (page: number) => void;
  onToggleItem: (item: ViewItem, field: 'skipLoot') => void;
  onSetDisposition: (item: ViewItem, disposition: ItemDisposition) => void;
  onRemoveCustomOverride: (id: string) => void;
  onRemoveHistoricalState: (id: string) => void;
};

export function ItemDrawer({
  summary,
  drawerQuery,
  drawerStateView,
  drawerItems,
  visibleDrawerItems,
  currentDrawerPage,
  drawerTotalPages,
  stateMap,
  customOverrides,
  catalogIdSet,
  customScopeActive,
  onDrawerQueryChange,
  onDrawerStateViewChange,
  onCollapse,
  onPageChange,
  onToggleItem,
  onSetDisposition,
  onRemoveCustomOverride,
  onRemoveHistoricalState,
}: ItemDrawerProps) {
  const { category, total, autoSellCount, skipLootCount } = summary;
  return (
    <div className="cat-drawer-container">
      <div className="cat-drawer-sticky-header">
        {((autoSellCount > 0 && autoSellCount < total) || (skipLootCount > 0 && skipLootCount < total)) && (
          <div className="drawer-cross-scope-tip">
            💡 当前分类包含跨副本通用掉落配置（{autoSellCount > 0 ? `${autoSellCount} 项自动出售` : ''}{autoSellCount > 0 && skipLootCount > 0 ? '、' : ''}{skipLootCount > 0 ? `${skipLootCount} 项跳过拾取` : ''}），如需统一策略可点击上方分类直选按钮。
          </div>
        )}
        <div className="cat-drawer-toolbar">
          <label className="drawer-search-box">
            <span>⌕</span>
            <input
              value={drawerQuery}
              onChange={(e) => onDrawerQueryChange(e.target.value)}
              placeholder={`在【${CATEGORY_LABELS[category]}】中搜索物品名称或 Boss...`}
            />
            {drawerQuery && <button type="button" className="drawer-clear-btn" onClick={() => onDrawerQueryChange('')}>×</button>}
          </label>
          <select
            className="drawer-select"
            value={drawerStateView}
            onChange={(e) => onDrawerStateViewChange(e.target.value as DrawerStateView)}
          >
            <option value="all">全部状态</option>
            <option value="configured">只看已配置</option>
            <option value="unconfigured">只看未配置</option>
            <option value="protected">只看已保护</option>
          </select>
          <span className="drawer-count-info">
            {drawerItems.length > 0 ? `${(currentDrawerPage - 1) * DRAWER_PAGE_SIZE + 1}–${Math.min(currentDrawerPage * DRAWER_PAGE_SIZE, drawerItems.length)} / 共 ${drawerItems.length} 项` : '0 项'}
          </span>
          <button
            type="button"
            className="button ghost compact"
            onClick={onCollapse}
          >
            收起 ▴
          </button>
        </div>

        <div className="item-row item-head" role="row">
          <span>物品与来源</span>
          <span className="head-center">类型</span>
          <span className="head-center">品质等级</span>
          <span className="head-center">跳过拾取</span>
          <span className="head-center">出售策略</span>
        </div>
      </div>

      <div className="drawer-item-list" role="table" aria-label={`${CATEGORY_LABELS[category]}物品列表`}>
        {visibleDrawerItems.map((item) => {
          const state = cloneState(stateMap.get(item.id));
          const source = item.sources[0];
          const isCustomLocked = !customScopeActive && Boolean(item.customOverride || customOverrides.has(item.id));
          const lockedTitle = `“${item.name}”已在【用户自定义】中维护（最高优先级），副本内设置不生效。如需修改请前往【用户自定义】。`;
          const metaParts = itemMetaParts(item);
          return (
            <div className={`item-row ${item.customOverride ? 'custom-row' : ''} ${item.historical ? 'historical-row' : ''} ${isCustomLocked ? 'custom-locked' : ''}`} role="row" key={item.id}>
              <div className="item-name">
                <strong className={itemQualityClass(item)}>
                  {item.name}
                  {item.systemSeed && <span className="seed-badge">推荐保护</span>}
                  {item.customOverride && (
                    isCustomLocked ? (
                      <span className="custom-badge priority-badge" title="已在【用户自定义】中维护（最高优先级），副本内设置不生效">🔒 自定义优先</span>
                    ) : (
                      <span className="custom-badge">自定义</span>
                    )
                  )}
                  {item.historical && <span className="history-badge">历史</span>}
                </strong>
                <small title={item.sources.map((entry) => `${entry.expansion} / ${entry.mapName} / ${entry.bossName}`).join('\n')}>
                  {source ? `${source.expansion} · ${source.mapName} · ${source.bossName}${item.sources.length > 1 ? ` 等 ${item.sources.length} 个来源` : ''}` : item.subtype ?? '手动维护'}
                </small>
                {item.customOverride && (
                   <button
                     className="text-action"
                     type="button"
                     onClick={() => onRemoveCustomOverride(item.id)}
                     title={catalogIdSet.has(item.id) ? '从自定义库移除（后续可继续随所属副本批量规则管理）' : '从自定义库移除'}
                   >
                     移除
                   </button>
                 )}
                {item.historical && <button className="text-action" type="button" onClick={() => onRemoveHistoricalState(item.id)}>清除历史状态并停止导出</button>}
              </div>
              {/* 类型与品质等级各自独占一列（第2/3列）；无数据直接留空，控件用显式列号固定在第4/5列 */}
              {metaParts.type && <span className="category-pill meta-type">{metaParts.type}</span>}
              {metaParts.qualityLevel && <span className="category-pill meta-quality">{metaParts.qualityLevel} 品</span>}
              <StateButton className="col-skip-toggle" state={state} onClick={() => onToggleItem(item, 'skipLoot')} locked={isCustomLocked} lockedTitle={lockedTitle} />
              <DispositionSelector className="col-disposition" disposition={itemDisposition(state)} onChange={(disposition) => onSetDisposition(item, disposition)} locked={isCustomLocked} lockedTitle={lockedTitle} />
            </div>
          );
        })}
        {visibleDrawerItems.length === 0 && (
          <div className="empty-state compact">
            <strong>没有匹配的物品</strong>
            <p>请尝试调整搜索关键词或状态筛选。</p>
          </div>
        )}
      </div>

      {drawerTotalPages > 1 && (
        <div className="pagination">
          <button type="button" disabled={currentDrawerPage <= 1} onClick={() => onPageChange(Math.max(1, currentDrawerPage - 1))}>上一页</button>
          <span>第 {currentDrawerPage} / {drawerTotalPages} 页</span>
          <button type="button" disabled={currentDrawerPage >= drawerTotalPages} onClick={() => onPageChange(Math.min(drawerTotalPages, currentDrawerPage + 1))}>下一页</button>
        </div>
      )}
    </div>
  );
}
