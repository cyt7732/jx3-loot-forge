import { describe, expect, it } from 'vitest';
import { extractExchangeTargets, hasExchangeLinks } from '../scripts/exchange-targets.mjs';

/** 上游 Desc 的真实形态（含转义与多余属性）。 */
function desc(...links: string[]): string {
  return [
    '<Text>text="能在蓬莱套装供应商处换取如下装备。\\n" font=105 </Text>',
    ...links.map((name) => `<Text>text="[${name}]" name="iteminfolink" eventid=513 script="this.nVersion=0 this.dwTabType=7 this.dwIndex=112310 this.OnItemLButtonDown=function() OnItemLinkDown(this) end" font=100 r=255 g=40 b=255 </Text>`),
  ].join('');
}

describe('extractExchangeTargets', () => {
  it('extracts a single linked target name', () => {
    expect(extractExchangeTargets(desc('儒风·荡山帽'))).toEqual(['儒风·荡山帽']);
  });

  it('extracts multiple distinct targets in order and deduplicates', () => {
    expect(extractExchangeTargets(desc('元元·照痕冠', '元元·惊霓冠', '元元·照痕冠'))).toEqual(['元元·照痕冠', '元元·惊霓冠']);
  });

  it('returns an empty array when there is no link', () => {
    expect(extractExchangeTargets('<Text>text="五毒与唐门可凭此物换取戒指。"</Text>')).toEqual([]);
  });

  it('ignores bracketed text that is not an item link', () => {
    const plain = '<Text>text="[不是链接] 只是方括号文本"</Text>';
    expect(extractExchangeTargets(plain)).toEqual([]);
  });

  it('tolerates non-string and empty input', () => {
    expect(extractExchangeTargets(undefined)).toEqual([]);
    expect(extractExchangeTargets(null)).toEqual([]);
    expect(extractExchangeTargets('')).toEqual([]);
    expect(extractExchangeTargets(42 as unknown as string)).toEqual([]);
  });

  it('normalizes the target name to NFC', () => {
    const decomposed = '儒风·荡山帽'.normalize('NFD');
    const [name] = extractExchangeTargets(desc(decomposed));
    expect(name).toBe('儒风·荡山帽'.normalize('NFC'));
  });

  it('reports link presence', () => {
    expect(hasExchangeLinks(desc('三宿·戒'))).toBe(true);
    expect(hasExchangeLinks('<Text>text="无链接"</Text>')).toBe(false);
  });
});
