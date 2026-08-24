type TokenType = 'braceOpen' | 'braceClose' | 'bracketOpen' | 'bracketClose' | 'equals' | 'comma' | 'string' | 'number' | 'identifier' | 'eof';

type Token = { type: TokenType; value?: string; offset: number };

export type LuaValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'table'; fields: LuaField[] };

export type LuaField = { key: string; value: LuaValue };

const MAX_SOURCE_LENGTH = 5 * 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_TOKENS = 250_000;

class Lexer {
  private offset = 0;
  private tokenCount = 0;

  constructor(private readonly source: string) {
    if (source.length > MAX_SOURCE_LENGTH) throw new Error('配置文本超过 5 MiB 限制。');
  }

  next(): Token {
    this.skipWhitespace();
    this.tokenCount += 1;
    if (this.tokenCount > MAX_TOKENS) throw new Error('配置包含过多语法单元。');
    const offset = this.offset;
    if (offset >= this.source.length) return { type: 'eof', offset };
    const character = this.source[offset];
    const punctuation: Partial<Record<string, TokenType>> = {
      '{': 'braceOpen', '}': 'braceClose', '[': 'bracketOpen', ']': 'bracketClose', '=': 'equals', ',': 'comma',
    };
    if (punctuation[character]) {
      this.offset += 1;
      return { type: punctuation[character]!, offset };
    }
    if (character === '"') return this.readString();
    if (character === '-' || character === '.' || /[0-9]/u.test(character)) return this.readNumber();
    if (/[A-Za-z_]/u.test(character)) return this.readIdentifier();
    throw new Error(`配置在第 ${offset + 1} 个字符处包含不支持的语法。`);
  }

  private skipWhitespace(): void {
    while (this.offset < this.source.length && /\s/u.test(this.source[this.offset])) this.offset += 1;
  }

  private readString(): Token {
    const offset = this.offset;
    this.offset += 1;
    let value = '';
    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      this.offset += 1;
      if (character === '"') return { type: 'string', value, offset };
      if (character === '\\') {
        const escaped = this.source[this.offset];
        this.offset += 1;
        if (escaped !== '\\' && escaped !== '"') throw new Error('配置字符串只允许 \\\\ 和 \\" 转义。');
        value += escaped;
        continue;
      }
      if (character.codePointAt(0)! < 0x20 || character.codePointAt(0) === 0x7f) throw new Error('配置字符串包含控制字符。');
      value += character;
    }
    throw new Error('配置字符串缺少结束引号。');
  }

  private readNumber(): Token {
    const offset = this.offset;
    const match = this.source.slice(offset).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u);
    if (!match) throw new Error(`配置在第 ${offset + 1} 个字符处包含无效数字。`);
    this.offset += match[0].length;
    return { type: 'number', value: match[0], offset };
  }

  private readIdentifier(): Token {
    const offset = this.offset;
    const match = this.source.slice(offset).match(/^[A-Za-z_][A-Za-z0-9_]*/u)!;
    this.offset += match[0].length;
    return { type: 'identifier', value: match[0], offset };
  }
}

class Parser {
  private current: Token;

  constructor(private readonly lexer: Lexer) {
    this.current = lexer.next();
  }

  parseChunk(): LuaValue & { kind: 'table' } {
    this.expectIdentifier('return');
    const value = this.parseValue(0);
    if (value.kind !== 'table') throw new Error('配置必须返回一个 Lua 表。');
    this.expect('eof');
    return value;
  }

  private parseValue(depth: number): LuaValue {
    if (depth > MAX_DEPTH) throw new Error('配置嵌套超过 32 层限制。');
    if (this.current.type === 'braceOpen') return this.parseTable(depth + 1);
    if (this.current.type === 'string') return { kind: 'string', value: this.take('string').value! };
    if (this.current.type === 'number') {
      const value = Number(this.take('number').value);
      if (!Number.isFinite(value)) throw new Error('配置包含无效数字。');
      return { kind: 'number', value };
    }
    if (this.current.type === 'identifier' && (this.current.value === 'true' || this.current.value === 'false')) {
      return { kind: 'boolean', value: this.take('identifier').value === 'true' };
    }
    throw new Error(`配置在第 ${this.current.offset + 1} 个字符处包含不支持的值。`);
  }

  private parseTable(depth: number): LuaValue & { kind: 'table' } {
    this.expect('braceOpen');
    const fields: LuaField[] = [];
    const keys = new Set<string>();
    while (this.current.type !== 'braceClose') {
      let key: string;
      if (this.current.type === 'bracketOpen') {
        this.expect('bracketOpen');
        key = this.take('string').value!;
        this.expect('bracketClose');
      } else {
        key = this.take('identifier').value!;
      }
      this.expect('equals');
      if (keys.has(key)) throw new Error(`配置包含重复键：${key}`);
      keys.add(key);
      fields.push({ key, value: this.parseValue(depth) });
      if (this.current.type === 'comma') {
        this.expect('comma');
        if ((this.current as Token).type === 'braceClose') break;
      } else if ((this.current as Token).type !== 'braceClose') {
        throw new Error(`配置在第 ${this.current.offset + 1} 个字符处缺少逗号。`);
      }
    }
    this.expect('braceClose');
    return { kind: 'table', fields };
  }

  private expectIdentifier(value: string): void {
    if (this.current.type !== 'identifier' || this.current.value !== value) throw new Error(`配置必须以 ${value} 开始。`);
    this.current = this.lexer.next();
  }

  private take(type: TokenType): Token {
    if (this.current.type !== type) throw new Error(`配置在第 ${this.current.offset + 1} 个字符处应为 ${type}。`);
    const token = this.current;
    this.current = this.lexer.next();
    return token;
  }

  private expect(type: TokenType): void {
    this.take(type);
  }
}

export function parseLuaChunk(source: string): LuaValue & { kind: 'table' } {
  return new Parser(new Lexer(source)).parseChunk();
}

export function getField(table: LuaValue & { kind: 'table' }, key: string): LuaValue | undefined {
  return table.fields.find((field) => field.key === key)?.value;
}
