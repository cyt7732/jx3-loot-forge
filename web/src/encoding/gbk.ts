let encodeMap: Map<string, Uint8Array> | null = null;

function decoder(fatal: boolean): TextDecoder {
  try {
    return new TextDecoder('gbk', { fatal });
  } catch {
    throw new Error('当前浏览器不支持 GBK/CP936 编码，请使用最新版 Chrome、Edge 或 Firefox。');
  }
}

function getEncodeMap(): Map<string, Uint8Array> {
  if (encodeMap) return encodeMap;
  const map = new Map<string, Uint8Array>();
  const looseDecoder = decoder(false);
  for (let byte = 0; byte <= 0x7f; byte += 1) map.set(String.fromCodePoint(byte), Uint8Array.of(byte));
  for (let byte = 0x80; byte <= 0xff; byte += 1) {
    const value = looseDecoder.decode(Uint8Array.of(byte));
    if (value && value !== '\uFFFD' && [...value].length === 1 && !map.has(value)) map.set(value, Uint8Array.of(byte));
  }
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue;
      const bytes = Uint8Array.of(lead, trail);
      const value = looseDecoder.decode(bytes);
      if (value && value !== '\uFFFD' && [...value].length === 1 && !map.has(value)) map.set(value, bytes);
    }
  }
  encodeMap = map;
  return map;
}

export function decodeGbk(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('配置文件不能包含 UTF-8 BOM。');
  const text = decoder(true).decode(bytes);
  if (text.includes('\u0000') || text.includes('\uFFFD')) throw new Error('配置文件包含非法 GBK 字节。');
  return text;
}

export function encodeGbk(text: string): Uint8Array {
  const map = getEncodeMap();
  const output: number[] = [];
  for (const character of text) {
    const bytes = map.get(character);
    if (!bytes) throw new Error(`字符“${character}”无法使用 GBK/CP936 编码。`);
    output.push(...bytes);
  }
  const encoded = Uint8Array.from(output);
  if (decodeGbk(encoded) !== text) throw new Error('GBK 编码往返校验失败。');
  return encoded;
}

export function assertGbkEncodable(text: string): void {
  encodeGbk(text);
}
