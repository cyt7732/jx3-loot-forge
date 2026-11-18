/**
 * 装备兑换牌类型反查：兑换牌的 Desc 里嵌着「可兑换目标装备」的物品链接，
 * 目标装备带有权威 TypeLabel（帽子/护腕/戒指…），据此可以精确推导兑换牌的类型，
 * 不必再用名称正则猜测。
 *
 * Desc 形态示例（上游原样返回，含转义）：
 *   <Text>text="能在蓬莱套装供应商处换取如下装备。\n" font=105 </Text>
 *   <Text>text="[儒风·荡山帽]" name="iteminfolink" eventid=513 ... ></Text>
 */

/** 匹配 `name="iteminfolink"` 之前紧邻的 `[...]` 文本，捕获链接显示名。 */
const LINK_PATTERN = /text="\[([^\]\n]+)\]"\s+name="iteminfolink"/gu;

/**
 * 从 Desc 中提取可兑换目标装备名（去重、保序）。
 * 无链接、空字符串、非字符串输入一律返回空数组。
 */
export function extractExchangeTargets(desc) {
  if (typeof desc !== 'string' || desc.length === 0) return [];
  const names = [];
  const seen = new Set();
  for (const match of desc.matchAll(LINK_PATTERN)) {
    const name = match[1].normalize('NFC').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** 判断 Desc 是否携带可兑换目标链接（用于统计反查覆盖率）。 */
export function hasExchangeLinks(desc) {
  return extractExchangeTargets(desc).length > 0;
}
