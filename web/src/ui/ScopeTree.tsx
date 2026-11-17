import type { Dispatch, SetStateAction } from 'react';
import type { CatalogMap } from '../domain/types';
import { CUSTOM_SCOPE_ID } from '../domain/constants';
import { sourceKey } from './display';
import { ChevronIcon } from './primitives';
import type { FocusedScope, ScopeLevelGroup } from './types';
import type { GameClient } from '../domain/constants';

type ScopeTreeProps = {
  levelGroups: ScopeLevelGroup[];
  client: GameClient;
  searchActive: boolean;
  selectedMaps: Set<number>;
  selectedBosses: Set<string>;
  focusedScope: FocusedScope;
  customCount: number;
  setFocusedScope: Dispatch<SetStateAction<FocusedScope>>;
  onToggleMap: (mapId: number) => void;
  onToggleBoss: (mapId: number, bossName: string, mapBossNames?: string[]) => void;
  onToggleMapGroup: (maps: CatalogMap[]) => void;
};

export function ScopeTree({
  levelGroups,
  client,
  searchActive,
  selectedMaps,
  selectedBosses,
  focusedScope,
  customCount,
  setFocusedScope,
  onToggleMap,
  onToggleBoss,
  onToggleMapGroup,
}: ScopeTreeProps) {
  const mapSelection = (map: CatalogMap) => {
    if (selectedMaps.has(map.mapId)) return { full: true, partial: false };
    const selectedBossCount = map.bossNames.reduce((count, boss) => count + (selectedBosses.has(sourceKey(map.mapId, boss)) ? 1 : 0), 0);
    return {
      full: map.bossNames.length > 0 && selectedBossCount === map.bossNames.length,
      partial: selectedBossCount > 0 && selectedBossCount < map.bossNames.length,
    };
  };

  const mapsSelection = (maps: CatalogMap[]) => {
    const selectedMapCount = maps.filter((map) => selectedMaps.has(map.mapId)).length;
    const fullCount = maps.filter((map) => mapSelection(map).full).length;
    const partial = maps.some((map) => mapSelection(map).partial);
    return {
      selectedMapCount,
      full: maps.length > 0 && fullCount === maps.length,
      partial: partial || (fullCount > 0 && fullCount < maps.length),
    };
  };

  return (
    <nav className="dungeon-tree" aria-label="副本范围">
      <div className={`tree-group custom-scope-group ${selectedMaps.has(CUSTOM_SCOPE_ID) ? 'active' : ''} ${focusedScope.type === 'custom' ? 'is-focused' : ''}`}>
        <div
          className={`custom-scope-row ${focusedScope.type === 'custom' ? 'focused-row' : ''}`}
          onClick={() => setFocusedScope((curr) => (curr.type === 'custom' ? { type: 'all' } : { type: 'custom' }))}
          role="button"
          tabIndex={0}
          title="点击单选聚焦：只看并管理用户自定义物品"
        >
          <button
            className={`tree-check ${selectedMaps.has(CUSTOM_SCOPE_ID) ? 'checked' : ''}`}
            type="button"
            aria-pressed={selectedMaps.has(CUSTOM_SCOPE_ID)}
            aria-label="切换用户自定义范围勾选"
            title="勾选自定义物品用于导出"
            onClick={(e) => { e.stopPropagation(); onToggleMap(CUSTOM_SCOPE_ID); }}
          >
            {selectedMaps.has(CUSTOM_SCOPE_ID) ? '✓' : ''}
          </button>
          <div className="custom-scope-meta">
            <strong>
              ✨ 用户自定义
              {focusedScope.type === 'custom' && <span className="focus-pill">正在编辑</span>}
            </strong>
            <small>手动添加 / 外部导入 / 历史条目</small>
          </div>
          <span className="custom-scope-badge">{customCount} 项</span>
        </div>
      </div>

      {levelGroups.map((levelGroup) => {
        const levelSelection = mapsSelection(levelGroup.maps);
        const isLevelFocused = focusedScope.type === 'level' && focusedScope.id === levelGroup.id;
        const eraBadgeClass = levelGroup.era === 'yu' ? 'era-badge-yu' : levelGroup.era === 'wei' ? 'era-badge-wei' : 'era-badge-unknown';
        return (
          <details className={`tree-group level-group ${isLevelFocused ? 'is-focused' : ''}`} key={levelGroup.id} open={searchActive ? true : undefined}>
            <summary className={`${levelSelection.full || levelSelection.partial ? 'active' : ''} ${isLevelFocused ? 'focused-summary' : ''}`}>
              <button
                className={`tree-check ${levelSelection.full ? 'checked' : levelSelection.partial ? 'partial' : ''}`}
                type="button"
                aria-pressed={levelSelection.full}
                aria-label={`切换${levelGroup.label}全部副本勾选`}
                title={levelSelection.full ? '取消勾选该年代所有副本（不影响视图）' : '勾选该年代所有副本用于导出'}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleMapGroup(levelGroup.maps); }}
              >
                {levelSelection.full ? '✓' : levelSelection.partial ? '−' : ''}
              </button>
              <span
                className="level-title-clickable"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setFocusedScope((curr) => (curr.type === 'level' && curr.id === levelGroup.id ? { type: 'all' } : {
                    type: 'level',
                    id: levelGroup.id,
                    name: levelGroup.name,
                    era: levelGroup.era,
                    eraName: levelGroup.eraName,
                    level: levelGroup.level,
                    mapIds: levelGroup.maps.map((m) => m.mapId),
                  }));
                }}
                title={`点击单选聚焦：只看并配置『${levelGroup.name}』(${levelGroup.maps.length}个副本)的策略`}
              >
                <strong>
                  『{levelGroup.name}』
                  {isLevelFocused && <span className="focus-pill">正在编辑</span>}
                </strong>
                <em>
                  {client === 'std' && levelGroup.eraName && (
                    <span className={`era-badge ${eraBadgeClass}`}>{levelGroup.eraName}</span>
                  )}
                  {levelGroup.level !== null ? `Lv.${levelGroup.level}` : '未知等级'}
                </em>
              </span>
              <small>{levelSelection.selectedMapCount}/{levelGroup.maps.length}</small>
              <span className="tree-arrow-indicator" title="展开/收起年代详情"><ChevronIcon /></span>
            </summary>
            <div className="tree-children difficulty-children">
              {levelGroup.difficultyGroups.length === 0 ? (
                <div className="tree-empty-hint">✨ 鱼历新时代秘境待上线，敬请期待</div>
              ) : (
                levelGroup.difficultyGroups.map((difficultyGroup) => {
                  const difficultySelection = mapsSelection(difficultyGroup.maps);
                  const isDiffFocused = focusedScope.type === 'difficulty' && focusedScope.label === difficultyGroup.label && focusedScope.levelName === levelGroup.name;
                  return (
                    <details className={`difficulty-node ${isDiffFocused ? 'is-focused' : ''}`} key={difficultyGroup.id} open={searchActive ? true : undefined}>
                      <summary className={`tree-parent ${difficultySelection.full || difficultySelection.partial ? 'active' : ''} ${isDiffFocused ? 'focused-summary' : ''}`}>
                        <button
                          className={`tree-check ${difficultySelection.full ? 'checked' : difficultySelection.partial ? 'partial' : ''}`}
                          type="button"
                          aria-pressed={difficultySelection.full}
                          aria-label={`切换${levelGroup.label}${difficultyGroup.label}全部副本勾选`}
                          title="勾选/取消勾选该难度所有副本用于导出"
                          onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleMapGroup(difficultyGroup.maps); }}
                        >
                          {difficultySelection.full ? '✓' : difficultySelection.partial ? '−' : ''}
                        </button>
                        <span
                          className="diff-title-clickable"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setFocusedScope((curr) => (curr.type === 'difficulty' && curr.label === difficultyGroup.label && curr.levelName === levelGroup.name ? { type: 'all' } : {
                              type: 'difficulty',
                              levelName: levelGroup.name,
                              label: difficultyGroup.label,
                              mapIds: difficultyGroup.maps.map((m) => m.mapId),
                            }));
                          }}
                          title={`点击单选聚焦：只看并配置【${levelGroup.name} · ${difficultyGroup.label}】的策略`}
                        >
                          <span>
                            {difficultyGroup.label}
                            {isDiffFocused && <span className="focus-pill">正在编辑</span>}
                          </span>
                        </span>
                        <small>{difficultySelection.selectedMapCount}/{difficultyGroup.maps.length}</small>
                        <span className="tree-arrow-indicator" title="展开/收起难度分组"><ChevronIcon /></span>
                      </summary>
                      <div className="tree-children map-children">
                        {difficultyGroup.maps.map((map) => {
                          const mapState = mapSelection(map);
                          const isMapFocused = focusedScope.type === 'map' && focusedScope.mapId === map.mapId;
                          return (
                            <details className={`map-node ${isMapFocused ? 'is-focused' : ''}`} key={map.mapId}>
                              <summary className={`${mapState.full || mapState.partial ? 'active' : ''} ${isMapFocused ? 'focused-summary' : ''}`}>
                                <button
                                  className={`tree-check ${mapState.full ? 'checked' : mapState.partial ? 'partial' : ''}`}
                                  type="button"
                                  aria-pressed={mapState.full}
                                  aria-label={`切换${map.name}${map.difficulty}勾选`}
                                  title="勾选/取消勾选该副本用于导出"
                                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleMap(map.mapId); }}
                                >
                                  {mapState.full ? '✓' : mapState.partial ? '−' : ''}
                                </button>
                                <span
                                  className="map-title-clickable"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setFocusedScope((curr) => (curr.type === 'map' && curr.mapId === map.mapId ? { type: 'all' } : {
                                      type: 'map',
                                      mapId: map.mapId,
                                      name: map.name,
                                      difficulty: map.difficulty,
                                      levelName: levelGroup.name,
                                    }));
                                  }}
                                  title={`点击单选聚焦：只看并配置【${map.name} (${map.difficulty})】的策略`}
                                >
                                  <strong>
                                    {map.name}
                                    {isMapFocused && <span className="focus-pill">正在编辑</span>}
                                  </strong>
                                  <em>{map.difficulty}</em>
                                </span>
                                <small>{map.bossNames.length} Boss</small>
                                <span className="tree-arrow-indicator" title="展开/收起Boss列表"><ChevronIcon /></span>
                              </summary>
                              <div className="boss-list">
                                {map.bossNames.map((boss) => {
                                  const isBossChecked = selectedBosses.has(sourceKey(map.mapId, boss)) || selectedMaps.has(map.mapId);
                                  const isBossFocused = focusedScope.type === 'boss' && focusedScope.mapId === map.mapId && focusedScope.bossName === boss;
                                  return (
                                    <button
                                      className={`boss-badge-btn ${isBossChecked ? 'checked' : ''} ${isBossFocused ? 'is-focused' : ''}`}
                                      type="button"
                                      key={boss}
                                      aria-pressed={isBossChecked}
                                      onClick={() => {
                                        setFocusedScope((curr) => (curr.type === 'boss' && curr.mapId === map.mapId && curr.bossName === boss ? { type: 'all' } : {
                                          type: 'boss',
                                          mapId: map.mapId,
                                          mapName: map.name,
                                          bossName: boss,
                                          levelName: levelGroup.name,
                                        }));
                                      }}
                                      onDoubleClick={(event) => {
                                        event.preventDefault();
                                        onToggleBoss(map.mapId, boss, map.bossNames);
                                      }}
                                      onContextMenu={(event) => {
                                        event.preventDefault();
                                        onToggleBoss(map.mapId, boss, map.bossNames);
                                      }}
                                      title={`点击单选聚焦【${boss}】的掉落；双击或右键可切换导出勾选`}
                                    >
                                      <span>{boss}</span>
                                      {isBossFocused && <i className="boss-focus-dot" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                }))}
              </div>
            </details>
          );
        })}
    </nav>
  );
}
