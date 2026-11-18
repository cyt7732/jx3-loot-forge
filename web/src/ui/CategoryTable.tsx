import type { BatchActionType, ItemCategory, ItemState } from '../domain/types';
import { CATEGORY_LABELS } from '../domain/constants';
import { CATEGORY_ICONS } from './display';
import { ItemDrawer } from './ItemDrawer';
import type { CategorySummary, DrawerStateView, ItemDisposition, ViewItem } from './types';

type DrawerPassthroughProps = {
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

type CategoryTableProps = DrawerPassthroughProps & {
  summaries: CategorySummary[];
  expandedCategory: ItemCategory | null;
  onExpandCategory: (category: ItemCategory) => void;
  onApplyAction: (category: ItemCategory, action: BatchActionType) => void;
};

export function CategoryTable({
  summaries,
  expandedCategory,
  onExpandCategory,
  onApplyAction,
  ...drawerProps
}: CategoryTableProps) {
  return (
    <div className="category-strategy-table" role="table" aria-label="分类策略控制列表">
      <div className="cat-strat-row cat-strat-head" role="row">
        <div className="col-cat">物品分类</div>
        <div className="col-skip">拾取过滤</div>
        <div className="col-sell">出售策略</div>
      </div>
      {summaries.map((catSummary) => {
        const { category, total, skipLootCount, autoSellCount, protectCount, noneCount } = catSummary;
        const allAutoSell = total > 0 && autoSellCount === total;
        const allProtect = total > 0 && protectCount === total;
        const allNone = total > 0 && noneCount === total;
        const allSkip = total > 0 && skipLootCount === total;
        const allUnskip = total > 0 && skipLootCount === 0;
        const isExpanded = expandedCategory === category;
        return (
          <div className={`cat-strat-group ${isExpanded ? 'is-expanded' : ''}`} key={category}>
            <div className="cat-strat-row" role="row">
              <div
                className="col-cat cat-info-cell"
                onClick={() => onExpandCategory(category)}
                role="button"
                tabIndex={0}
                title="点击展开/收起该分类下的物品明细"
              >
                <img className="cat-icon" src={CATEGORY_ICONS[category]} alt="" aria-hidden="true" />
                <div className="cat-name-box">
                  <div className="cat-name-row">
                    <strong>{CATEGORY_LABELS[category]}</strong>
                    <span className="cat-count-badge" title={`共 ${total} 项`}>{total}</span>
                  </div>
                  {(skipLootCount > 0 || autoSellCount > 0 || protectCount > 0) && (
                    <div className="cat-status-pills">
                      {skipLootCount > 0 && (
                        <span className="status-pill pill-skip" title={`当前范围有 ${skipLootCount} 项已设为跳过拾取`}>
                          <i className="pill-dot dot-blue" />
                          {skipLootCount}
                        </span>
                      )}
                      {autoSellCount > 0 && (
                        <span className="status-pill pill-sell" title={`当前范围有 ${autoSellCount} 项已设为自动出售`}>
                          <i className="pill-dot dot-orange" />
                          {autoSellCount}
                        </span>
                      )}
                      {protectCount > 0 && (
                        <span className="status-pill pill-protect" title={`当前范围有 ${protectCount} 项已设为保护不出售`}>
                          <i className="pill-dot dot-green" />
                          {protectCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className={`drawer-toggle-arrow ${isExpanded ? 'open' : ''}`}>
                  {isExpanded ? '▴ 收起' : '▾ 明细'}
                </span>
              </div>

              <div className="col-skip">
                <div className="seg-control skip-seg" role="group" aria-label="拾取策略">
                  <button
                    type="button"
                    className={`seg-btn skipLoot ${allSkip ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onApplyAction(category, 'skipLoot'); }}
                    title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为跳过拾取`}
                  >
                    跳过拾取
                  </button>
                  <button
                    type="button"
                    className={`seg-btn unskip ${allUnskip ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onApplyAction(category, 'unskipLoot'); }}
                    title={`清除当前范围【${CATEGORY_LABELS[category]}】的跳过标记，恢复正常拾取`}
                  >
                    正常拾取
                  </button>
                </div>
              </div>

              <div className="col-sell">
                <div className="seg-control sell-seg" role="group" aria-label="出售策略">
                  <button
                    type="button"
                    className={`seg-btn autoSell ${allAutoSell ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onApplyAction(category, 'autoSell'); }}
                    title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为自动出售`}
                  >
                    自动出售
                  </button>
                  <button
                    type="button"
                    className={`seg-btn protect ${allProtect ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onApplyAction(category, 'protect'); }}
                    title={`一键将当前范围全部 ${total} 项【${CATEGORY_LABELS[category]}】设为保护不出售`}
                  >
                    保护不出售
                  </button>
                  <button
                    type="button"
                    className={`seg-btn none ${allNone ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onApplyAction(category, 'none'); }}
                    title={`清除当前范围【${CATEGORY_LABELS[category]}】的出售/保护策略`}
                  >
                    未处理
                  </button>
                </div>
              </div>
            </div>

            {isExpanded && <ItemDrawer summary={catSummary} {...drawerProps} />}
          </div>
        );
      })}
    </div>
  );
}
