import { describe, expect, it } from 'vitest';
import { buildExportBatch } from '../src/config/exporter';
import { parseManagedConfig, previewImport } from '../src/config/importer';
import { parseLuaChunk } from '../src/config/lua-parser';
import { APP_VERSION, DEFAULT_PROTECTED_ITEMS } from '../src/domain/constants';
import { decodeGbk, encodeGbk } from '../src/encoding/gbk';

const EXPECTED_PROTECTED_ITEMS = [
  '炎枪重黎', '腾空', '圆月双角', '五项斩', '麒王逐魂', '金红狩命', '秋声烛影',
  '旧禅镇', '相映红', '石剑·溟灵', '秋露白', '曳影残剑', '赐清平', '卦预乾坤',
  '朝露昙华', '夜话白鹭·鸿', '金红狩命·鸿', '秋声烛影·鸿', '钧天·鸿',
  '水长生 ·雪银莲', '溯·鸿',
];

const EXPECTED_PICKUP_PATHS = [
  'MY_GKPLoot.tAutoPickupFilters', 'MY_GKPDoodad.bCustom', 'MY_GKPDoodad.bOpenLoot', 'MY_GKPDoodad.fNameScale',
  'MY_GKPDoodad.bReadInscriptionDoodad', 'MY_GKPLoot.anchor', 'MY_GKPDoodad.bOpenLootEvenFight',
  'MY_GKPLoot.bAutoPickupFilterBookRead', 'MY_GKPDoodad.bQuestDoodad',
  'MY_GKPDoodad.bShowName', 'MY_GKPLoot.bOn', 'MY_GKPLoot.bAutoPickupBook', 'MY_GKPLoot.bInBattlefield',
  'MY_GKPLoot.bAutoPickupFilterBookHave', 'MY_GKPLoot.bInRaidDungeon', 'MY_GKPDoodad.bUnreadInscriptionDoodad',
  'MY_GKPDoodad.bMiniFlag', 'MY_GKPLoot.bInTeamDungeon', 'MY_GKPDoodad.bAllDoodad', 'MY_GKPDoodad.szCustom',
  'MY_GKPLoot.bInOtherMap', 'MY_GKPDoodad.bRecent', 'MY_GKPLoot.bAutoPickupQuality', 'MY_GKPLoot.bAutoPickupTaskItem',
];

describe('GBK config export', () => {
  it('exports deterministic single-line files with shared current marker', () => {
    const batch = buildExportBatch([
      { name: '拾取项', state: { skipLoot: true, autoSell: false, protect: false } },
      { name: '出售项', state: { skipLoot: false, autoSell: true, protect: false } },
      { name: '水长生 ·雪银莲', state: { skipLoot: false, autoSell: false, protect: true } },
    ], new Date('2026-08-23T12:15:42Z'));
    expect(batch.fingerprint).toBe(`『剑网3掉落工坊』 v${APP_VERSION} by 凌千羽·龙争虎斗 <20260823_201542>`);
    expect(batch.combined.filename.endsWith('.us.jx3dat')).toBe(true);
    expect(batch.pickup.filename.endsWith('.us.jx3dat')).toBe(true);
    expect(batch.sell.filename.endsWith('.us.jx3dat')).toBe(true);
    expect(batch.combined.text.includes('\n')).toBe(false);
    expect(batch.pickup.text.includes('\n')).toBe(false);
    expect(batch.sell.text.includes('\n')).toBe(false);
    expect(batch.combined.text).toContain(batch.fingerprint);
    expect(batch.pickup.text).toContain(batch.fingerprint);
    expect(batch.sell.text).toContain(batch.fingerprint);
    expect(batch.combined.text).toContain('水长生 ·雪银莲');
    expect(batch.sell.text).toContain('水长生 ·雪银莲');
    expect(Array.from(batch.pickup.bytes.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeGbk(batch.combined.bytes)).toBe(batch.combined.text);
    expect(decodeGbk(batch.pickup.bytes)).toBe(batch.pickup.text);
    expect(decodeGbk(batch.sell.bytes)).toBe(batch.sell.text);
    expect(Array.from(batch.sell.bytes.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it('preserves the complete 24-setting pickup shell and target position', () => {
    const batch = buildExportBatch([], new Date('2026-08-23T12:15:42Z'));
    const table = parseLuaChunk(batch.pickup.text);
    expect(table.fields.map((field) => field.key)).toEqual(EXPECTED_PICKUP_PATHS);
    expect(table.fields[0].key).toBe('MY_GKPLoot.tAutoPickupFilters');
  });

  it('emits marker-only main tables and an explicit empty protection table', () => {
    const batch = buildExportBatch([], new Date('2026-08-23T12:15:42Z'));
    const parsedCombined = parseManagedConfig(batch.combined.text);
    const parsedPickup = parseManagedConfig(batch.pickup.text);
    const parsedSell = parseManagedConfig(batch.sell.text);
    expect(parsedCombined.skipLoot).toEqual([]);
    expect(parsedCombined.autoSell).toEqual([]);
    expect(parsedCombined.protect).toEqual([]);
    expect(parsedCombined.declared.has('skipLoot')).toBe(true);
    expect(parsedCombined.declared.has('autoSell')).toBe(true);
    expect(parsedCombined.declared.has('protect')).toBe(true);
    expect(parsedPickup.skipLoot).toEqual([]);
    expect(parsedSell.autoSell).toEqual([]);
    expect(parsedSell.protect).toEqual([]);
    expect(parsedSell.declared.has('protect')).toBe(true);
  });

  it('preserves the protected baseline whitespace as golden GBK bytes', () => {
    const bytes = encodeGbk('水长生 ·雪银莲');
    expect(Array.from(bytes)).toEqual([0xcb, 0xae, 0xb3, 0xa4, 0xc9, 0xfa, 0x20, 0xa1, 0xa4, 0xd1, 0xa9, 0xd2, 0xf8, 0xc1, 0xab]);
    expect(DEFAULT_PROTECTED_ITEMS[19]).toBe('水长生 ·雪银莲');
    expect([...DEFAULT_PROTECTED_ITEMS]).toEqual(EXPECTED_PROTECTED_ITEMS);
  });

  it('correctly filters out items not in selected scopes during export preparation', () => {
    // 模拟所选范围：70~120级老本物品与自定义物品
    const scopedItemIds = new Set(['老本装备A', '老本牌子B', '自定义物品C']);
    const fullStateMap = new Map([
      ['老本装备A', { skipLoot: false, autoSell: true, protect: false }],
      ['老本牌子B', { skipLoot: true, autoSell: false, protect: false }],
      ['丝路风语未选本装备D', { skipLoot: false, autoSell: true, protect: false }], // 未选年代物品
      ['丝路风语未选本牌子E', { skipLoot: true, autoSell: false, protect: false }], // 未选年代物品
      ['自定义物品C', { skipLoot: false, autoSell: false, protect: true }],
    ]);

    const filteredNamedStates = [...fullStateMap.entries()]
      .filter(([id, state]) => scopedItemIds.has(id) && (state.skipLoot || state.autoSell || state.protect))
      .map(([id, state]) => ({ name: id, state }));

    const batch = buildExportBatch(filteredNamedStates, new Date('2026-08-23T12:15:42Z'));

    // 断言导出的配置中包含老本与自定义物品
    expect(batch.combined.text).toContain('老本装备A');
    expect(batch.combined.text).toContain('老本牌子B');
    expect(batch.combined.text).toContain('自定义物品C');

    // 断言未选中的丝路风语物品不会出现在导出文件中
    expect(batch.combined.text).not.toContain('丝路风语未选本装备D');
    expect(batch.combined.text).not.toContain('丝路风语未选本牌子E');
    expect(batch.sell.text).not.toContain('丝路风语未选本装备D');
    expect(batch.pickup.text).not.toContain('丝路风语未选本牌子E');
  });
});

describe('restricted Lua import', () => {
  it('ignores current and legacy markers and resolves sell/protect conflicts to protection', () => {
    const source = 'return {["MY_AutoSell.tProtectItem"]={d={["冲突物品"]=true},v=""},["MY_AutoSell.tSellItem"]={d={["【JX3 Loot Forge|by 凌千羽@龙争虎斗|自动出售|20260823-200241】"]=true,["冲突物品"]=true},v=""},["MY_AutoSell.bEnable"]={d=true,v=""}}';
    const parsed = parseManagedConfig(source);
    expect(parsed.autoSell).toEqual(['冲突物品']);
    const preview = previewImport(parsed, 'merge', new Map(), []);
    expect(preview.conflictsResolved).toBe(1);
    expect(preview.changes[0].after).toEqual({ skipLoot: false, autoSell: false, protect: true });
  });

  it('supports scoped replace with an explicitly empty table', () => {
    const source = 'return {["MY_AutoSell.tProtectItem"]={d={},v=""}}';
    const parsed = parseManagedConfig(source);
    const preview = previewImport(parsed, 'replace', new Map([['旧保护', { skipLoot: true, autoSell: false, protect: true }]]), []);
    expect(preview.changes[0].after).toEqual({ skipLoot: true, autoSell: false, protect: false });
  });

  it.each([
    'return (function() os.execute("bad") end)()',
    'return {} os.execute("bad")',
    'return {["MY_AutoSell.tSellItem"]={d={["a"]=true,["a"]=false},v=""}}',
    'return {["MY_AutoSell.tSellItem"]={d={["a"]=function() end},v=""}}',
  ])('rejects hostile or ambiguous Lua without execution', (source) => {
    expect(() => parseLuaChunk(source)).toThrow();
  });
});
