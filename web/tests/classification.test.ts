import { describe, expect, it } from 'vitest';
import { classifyItem } from '../src/catalog/classification';

function classify(name: string, typeLabels: readonly string[], extra: Partial<Parameters<typeof classifyItem>[0]> = {}) {
  return classifyItem({ name, typeLabels, ...extra });
}

describe('TypeLabel primary classification', () => {
  it.each([
    ['傲霜刀', 'equipment'],
    ['帽子', 'equipment'],
    ['材料', 'material'],
    ['五行石', 'material'],
    ['背部挂件', 'specialDrop'],
    ['坐骑', 'specialDrop'],
    ['道学', 'recipe'],
    ['杂集', 'recipe'],
    ['家具', 'furniture'],
    ['建筑', 'furniture'],
    ['武器', 'smallEnchant'],
    ['物品强化', 'bigEnchant'],
  ] as const)('maps %s to %s', (typeLabel, category) => {
    expect(classify('普通名称', [typeLabel])).toMatchObject({
      category,
      classification: 'type-label',
      subtype: typeLabel,
      typeLabels: [typeLabel],
    });
  });

  it('does not apply name rules to a non-other unknown TypeLabel', () => {
    expect(classify('这件物品玄晶', ['上游新标签'])).toMatchObject({
      category: 'unknown',
      classification: 'unknown',
    });
  });

  it('uses a recognized non-other label even when another raw label is 其他', () => {
    expect(classify('焕彩玉·鞋子', ['其他', '材料'])).toMatchObject({
      category: 'material',
      classification: 'type-label',
    });
  });
});

describe('TypeLabel=其他 guard and secondary rules', () => {
  it('requires the raw TypeLabel array to be exactly one 其他', () => {
    expect(classify('普通掉落', [])).toMatchObject({ category: 'unknown', classification: 'type-label-missing-fallback' });
    expect(classify('普通掉落', ['其他', '其他'])).toMatchObject({ category: 'unknown', classification: 'unknown' });
    expect(classify('普通掉落', ['其他', '未收录标签'])).toMatchObject({ category: 'unknown', classification: 'unknown' });
    expect(classify('普通掉落', [' 其他'])).toMatchObject({ category: 'unknown', classification: 'unknown' });
  });

  it('recognizes a pet from equip metadata without a usable slot before name rules', () => {
    expect(classify('一件玄晶宠物', ['其他'], { isEquip: true })).toMatchObject({ category: 'pet', classification: 'type-label-other-rule' });
    expect(classify('一件玄晶宠物', ['其他'], { isEquip: true, slots: ['unknown'] })).toMatchObject({ category: 'pet' });
    expect(classify('一件玄晶宠物', ['其他'], { isEquip: true, slot: '' })).toMatchObject({ category: 'pet' });
    expect(classify('一件玄晶', ['其他'], { isEquip: true, slot: 'head' })).toMatchObject({ category: 'bigIron' });
  });

  it.each([
    ['玄晶', 'bigIron'],
    ['陨铁', 'smallIron'],
  ] as const)('maps a name ending in %s to %s', (suffix, category) => {
    expect(classify(`物品${suffix}`, ['其他'])).toMatchObject({ category, classification: 'type-label-other-rule' });
  });

  it.each([
    ['秘境宝藏·空城殿·上·奇', 'equipmentExchange'],
    ['三宿岩·戒', 'equipmentExchange'],
    ['三宿·任意名称', 'equipmentExchange'],
    ['神兵玉匣·长歌', 'equipmentExchange'],
    ['秘境宝藏碎片·上衣', 'equipmentExchange'],
  ] as const)('maps exchange prefix/name %s to %s', (name, category) => {
    expect(classify(name, ['其他'])).toMatchObject({ category, classification: 'type-label-other-rule' });
  });

  it('recognizes a set + equipment part + school structure', () => {
    expect(classify('蚩灵护腕·霸刀', ['其他'])).toMatchObject({ category: 'equipmentExchange' });
    expect(classify('套装·上衣·七秀', ['其他'])).toMatchObject({ category: 'equipmentExchange' });
    expect(classify('蚩灵·不存在门派', ['其他'])).toMatchObject({ category: 'specialDrop' });
  });

  it.each([
    '三宿岩·项链',
    '探幽宝藏·武器',
    '探幽宝藏·首饰',
    '焕彩玉·鞋子',
    '超拔之玉·帽',
    '烛天帽·精制',
    '蚩灵护腕·霸刀',
    '焕彩玉·上装',
    '焕彩石·头/腕/腰',
    '探幽宝藏·防具',
  ])('recognizes an equipment-part token in %s', (name) => {
    expect(classify(name, ['其他'])).toMatchObject({ category: 'equipmentExchange' });
  });

  it('uses specialDrop as the final other-label fallback', () => {
    expect(classify('没有规则命中的掉落', ['其他'])).toMatchObject({
      category: 'specialDrop',
      classification: 'type-label-other-rule',
    });
  });
});

describe('missing TypeLabel positive fallback', () => {
  it.each([
    ['破军衣·七秀', 'equipmentExchange'],
    ['秘境宝藏·空城殿·上·奇', 'equipmentExchange'],
    ['三宿岩·戒', 'equipmentExchange'],
    ['神兵玉匣·天极帽', 'equipmentExchange'],
    ['秘境宝藏碎片·英雄一之窟', 'equipmentExchange'],
    ['焕彩玉·鞋子', 'equipmentExchange'],
  ] as const)('uses exchange rules for %s', (name, category) => {
    expect(classify(name, [])).toMatchObject({
      category,
      classification: 'type-label-missing-fallback',
      typeLabels: [],
    });
  });

  it('recognizes the current 刀宗 school in the set structure', () => {
    expect(classify('鹤梦帽·刀宗', [])).toMatchObject({
      category: 'equipmentExchange',
      classification: 'type-label-missing-fallback',
    });
  });

  it.each([
    ['飞仙玄晶', 'bigIron'],
    ['鸣沙陨铁', 'smallIron'],
  ] as const)('uses the iron suffix rule for missing TypeLabel %s', (name, category) => {
    expect(classify(name, [])).toMatchObject({
      category,
      classification: 'type-label-missing-fallback',
      typeLabels: [],
    });
  });

  it('recognizes a pet from missing TypeLabel equipment metadata', () => {
    expect(classify('大眼崽', [], { isEquip: true, slots: ['unknown'] })).toMatchObject({
      category: 'pet',
      classification: 'type-label-missing-fallback',
      typeLabels: [],
    });
  });

  it('keeps an unmatched missing TypeLabel item unclassified', () => {
    expect(classify('没有规则命中的掉落', [])).toMatchObject({
      category: 'unknown',
      classification: 'type-label-missing-fallback',
      typeLabels: [],
    });
  });

  it('does not let an empty label mixed with another unknown label trigger name rules', () => {
    expect(classify('秘境宝藏·空城殿·上·奇', ['', '上游新标签'])).toMatchObject({
      category: 'unknown',
      classification: 'unknown',
    });
  });
});

describe('classification purity and raw-label preservation', () => {
  it('does not mutate or normalize the caller TypeLabel array', () => {
    const labels = ['其他'] as const;
    const result = classify('普通掉落', labels);
    expect(result.typeLabels).toEqual(['其他']);
    expect(result.typeLabels).not.toBe(labels);
    expect(labels).toEqual(['其他']);
  });

  it('does not misclassify a non-other name containing 玄晶', () => {
    expect(classify('普通玄晶名称', ['未知上游标签'])).toMatchObject({ category: 'unknown' });
  });
});
