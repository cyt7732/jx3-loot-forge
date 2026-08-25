import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROTECTED_ITEMS,
  DEFAULT_SELL_ITEMS,
  DEFAULT_SKIP_LOOT_ITEMS,
} from '../src/domain/constants';
import {
  createEmptyBulkRules,
  createInitialWorkspace,
  previewBulkRules,
  setStateField,
  stateMapFromWorkspace,
} from '../src/domain/state';
import { validateWorkspace } from '../src/storage/workspace';
import type { CatalogItem } from '../src/domain/types';

describe('three-state domain model', () => {
  it('keeps skip-loot independent and enforces sell/protect exclusion', () => {
    let state = { skipLoot: false, autoSell: false, protect: false };
    state = setStateField(state, 'skipLoot', true);
    state = setStateField(state, 'autoSell', true);
    expect(state).toEqual({ skipLoot: true, autoSell: true, protect: false });
    state = setStateField(state, 'protect', true);
    expect(state).toEqual({ skipLoot: true, autoSell: false, protect: true });
  });

  it('initializes the exact combined default configuration from plugin defaults', () => {
    const workspace = createInitialWorkspace('test', new Date('2026-08-23T00:00:00Z'));
    const states = stateMapFromWorkspace(workspace);
    expect(DEFAULT_PROTECTED_ITEMS).toHaveLength(21);
    expect(DEFAULT_PROTECTED_ITEMS).toContain('水长生 ·雪银莲');
    expect(states.get('水长生 ·雪银莲')).toEqual({ skipLoot: false, autoSell: false, protect: true });
    expect(DEFAULT_SELL_ITEMS).toHaveLength(19);
    for (const name of DEFAULT_SELL_ITEMS) {
      expect(states.get(name)?.autoSell).toBe(true);
    }
    expect(DEFAULT_SKIP_LOOT_ITEMS).toContain('金叶子');
    expect(states.get('金叶子')).toEqual({ skipLoot: true, autoSell: true, protect: false });
  });

  it('does not rewrite the workspace modification time while loading valid saved state', () => {
    const workspace = createInitialWorkspace('test', new Date('2026-08-23T00:00:00Z'));
    workspace.updatedAt = '2026-08-23T01:02:03.000Z';
    expect(validateWorkspace(workspace, 'test').updatedAt).toBe(workspace.updatedAt);
  });

  it('excludes custom overrides from every bulk rule', () => {
    const items: CatalogItem[] = [
      { id: '官方装备', name: '官方装备', category: 'equipment', sources: [] },
      { id: '自定义装备', name: '自定义装备', category: 'equipment', sources: [] },
    ];
    const rules = createEmptyBulkRules();
    rules.equipment.autoSell = 'enable';
    rules.equipment.protect = 'enable';
    const preview = previewBulkRules(items, new Map(), new Set(['自定义装备']), rules);
    expect(preview.excludedCustom).toBe(1);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0].after).toEqual({ skipLoot: false, autoSell: false, protect: true });
  });
});
