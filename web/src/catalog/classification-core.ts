import type { ItemCategory } from '../domain/types';

/**
 * 唯一一份物品分类实现（分类器核心）。
 *
 * 设计要点：本模块**不直接读取 JSON 规则**，而是由调用方注入 `ClassificationRules`。
 * 这样同一份逻辑可以被三种运行环境复用：
 *  - 前端运行时：`classification.ts` 用 Vite 的 JSON import 注入；
 *  - 爬虫脚本：`crawl-catalog.mjs` 用 `readFileSync` 注入；
 *  - 重分类脚本：`reclassify-catalog.mjs` 用 `readFileSync` 注入。
 * （Node ESM 对裸 JSON import 需要 import attribute，故不能写在核心模块里。）
 */

/** 分类结果来源。两个 `type-label*` 之外的值仅为兼容旧快照保留。 */
export type ClassificationSource =
  | 'type-label'
  | 'type-label-other-rule'
  | 'type-label-missing-fallback'
  | 'metadata'
  | 'name-fallback'
  | 'unknown';

export type ClassificationInput = {
  name: string;
  /** 上游原始 TypeLabel；刻意不在此归一化。 */
  typeLabels?: readonly string[];
  isEquip?: boolean;
  slot?: string;
  slots?: readonly string[];
  /** 上游结构化字段：拍卖/装备大类（1 武器、2 投掷、3 防具、4 首饰、22 宠物…）。 */
  aucGenre?: number;
  /** 上游结构化字段：AucGenre 下的子类序数。 */
  aucSubType?: number;
};

export type ClassificationResult = {
  category: ItemCategory;
  classification: ClassificationSource;
  /** 展示用类型（部位名 / 兵器名 / 宠物 …）。 */
  subtype?: string;
  /** 原始标签副本，便于调用方持久化为 `typeLabels`。 */
  typeLabels: string[];
};

export type ClassificationRules = {
  otherTypeLabel: string;
  primaryTypeLabels: Partial<Record<ItemCategory, readonly string[]>>;
  /**
   * TypeLabel 后缀 → 分类。用于上游用「门派秘笈」「各类配方」等前缀变体表达同一类物品的场景，
   * 不必逐条枚举（如 万花秘笈 / 铸造配方 / 缝纫配方 …）。
   */
  typeLabelSuffixCategories?: Record<string, ItemCategory>;
  /** AucGenre → 分类（目前仅 22 → pet 是可靠信号）。 */
  aucGenreCategories?: Record<string, ItemCategory>;
  /** AucGenre → slot；或 AucGenre → { AucSubType → slot }。 */
  aucGenreSlots?: Record<string, string | Record<string, string>>;
  /** TypeLabel → slot（AucGenre 缺失时的回退）。 */
  typeLabelSlots?: Record<string, string>;
  /** 判定为武器的 TypeLabel 集合（AucGenre 缺失时的回退）。 */
  weaponTypeLabels?: readonly string[];
  /** slot → 中文部位名，用于把结构化字段翻译成展示类型。 */
  slotLabels?: Record<string, string>;
  secondaryRules: {
    petWhenEquipWithoutExplicitSlot: boolean;
    /** 部位词 → 标准部位名；用于「名称里带部位」但无其它证据的兑换牌。 */
    partTokenLabels?: Record<string, string>;
    unknownSlotValues: readonly string[];
    companionItemNames?: readonly string[];
    currencyItemNames?: readonly string[];
    specialWeaponNames: readonly string[];
    nameSuffixes: {
      bigIron: string;
      smallIron: string;
    };
    equipmentExchangePrefixes: readonly string[];
    schools: readonly string[];
    equipmentPartTokens: readonly string[];
  };
};

/** 分类本身无法给出类型时，按大类补一个稳定的展示类型。 */
const CATEGORY_DEFAULT_SUBTYPE: Partial<Record<ItemCategory, string>> = {
  pet: '宠物',
  specialWeapon: '特效武器',
};

/** 从结构化字段解析 slot；AucGenre 缺失或不认识时返回 undefined。 */
export function slotFromAucGenre(
  rules: ClassificationRules,
  aucGenre?: number,
  aucSubType?: number,
): string | undefined {
  if (aucGenre === undefined || aucGenre === null) return undefined;
  const genreEntry = rules.aucGenreSlots?.[String(aucGenre)];
  if (!genreEntry) return undefined;
  if (typeof genreEntry === 'string') return genreEntry;
  if (aucSubType === undefined || aucSubType === null) return undefined;
  return genreEntry[String(aucSubType)];
}

export function createClassifier(rules: ClassificationRules) {
  const specialWeaponSet = new Set(rules.secondaryRules.specialWeaponNames);
  const companionItemSet = new Set(rules.secondaryRules.companionItemNames ?? []);
  const currencyItemSet = new Set(rules.secondaryRules.currencyItemNames ?? []);
  const unknownSlotValues = new Set(rules.secondaryRules.unknownSlotValues.map((value) => value.toLocaleLowerCase()));
  const partTokens = [...rules.secondaryRules.equipmentPartTokens].sort((left, right) => right.length - left.length);

  function hasExplicitSlot(input: ClassificationInput): boolean {
    const values = [input.slot, ...(input.slots ?? [])];
    return values.some((value) => {
      if (typeof value !== 'string') return false;
      const normalized = value.trim().toLocaleLowerCase();
      return normalized.length > 0 && !unknownSlotValues.has(normalized);
    });
  }

  function endsWithEquipmentPart(value: string): string | undefined {
    return partTokens.find((token) => value.endsWith(token));
  }

  function isSetAndSchoolName(name: string): boolean {
    const parts = name.split('·');
    if (parts.length < 2) return false;
    const school = parts.at(-1);
    if (!school || !rules.secondaryRules.schools.includes(school)) return false;
    const setAndPart = parts.slice(0, -1).join('·');
    return setAndPart.length > 0 && endsWithEquipmentPart(setAndPart) !== undefined;
  }

  function hasEquipmentPartSegment(name: string): boolean {
    return name.split('·').some((part) => endsWithEquipmentPart(part) !== undefined);
  }

  /** 结构化字段 → 展示类型（部位名）。 */
  function subtypeFromAucGenre(input: ClassificationInput): string | undefined {
    const slot = slotFromAucGenre(rules, input.aucGenre, input.aucSubType);
    if (!slot) return undefined;
    return rules.slotLabels?.[slot];
  }

  /**
   * 名称部位词 → 展示类型。
   * 仅用于兑换牌：它们中不少既无 TypeLabel、也无 AucGenre、Desc 里也没有目标链接
   * （例如「三宿岩·戒」「儒风帽·凌雪阁」），但名称本身就带部位。
   */
  function subtypeFromNameParts(name: string): string | undefined {
    const tokenLabels = rules.secondaryRules.partTokenLabels;
    if (!tokenLabels) return undefined;
    for (const segment of name.split('·')) {
      const token = partTokens.find((candidate) => segment.endsWith(candidate) && tokenLabels[candidate]);
      if (token) return tokenLabels[token];
    }
    return undefined;
  }

  function secondaryCategory(input: ClassificationInput, allowSpecialDropFallback: boolean): ItemCategory | undefined {
    const { secondaryRules } = rules;

    // 1. 结构化字段最优先：AucGenre 明确给出的大类（目前只有 22 → pet 足够可靠）。
    //    它能修正「宠物装备/礼盒」这类没有 TypeLabel、又没有装槽信息的漏判。
    if (input.aucGenre !== undefined && input.aucGenre !== null) {
      const genreCategory = rules.aucGenreCategories?.[String(input.aucGenre)];
      if (genreCategory) return genreCategory;
    }

    // 2. 可装备但没有可用装槽 = 宠物（名称启发式的历史主判据）。
    if (secondaryRules.petWhenEquipWithoutExplicitSlot && input.isEquip === true && !hasExplicitSlot(input)) {
      return 'pet';
    }

    if (input.name.endsWith(secondaryRules.nameSuffixes.bigIron)) return 'bigIron';
    if (input.name.endsWith(secondaryRules.nameSuffixes.smallIron)) return 'smallIron';

    if (secondaryRules.equipmentExchangePrefixes.some((prefix) => input.name.startsWith(prefix))) {
      return 'equipmentExchange';
    }

    if (isSetAndSchoolName(input.name)) return 'equipmentExchange';
    if (hasEquipmentPartSegment(input.name)) return 'equipmentExchange';

    return allowSpecialDropFallback ? 'specialDrop' : undefined;
  }

  return function classifyItem(input: ClassificationInput): ClassificationResult {
    const typeLabels = [...(input.typeLabels ?? [])];
    const normalizedName = input.name.normalize('NFC').trim();
    const meaningfulLabels = [...new Set(
      typeLabels.filter((label) => label && label.trim().length > 0 && label !== rules.otherTypeLabel),
    )];
    // 多个不同的有效标签意味着「同名物品跨来源类型不一致」，此时不给类型，避免任意挑一个误导展示。
    const explicitSubtype = meaningfulLabels.length === 1 ? meaningfulLabels[0] : undefined;
    const isExactlyOther = typeLabels.length === 1 && typeLabels[0] === rules.otherTypeLabel;
    const isMissingTypeLabel = typeLabels.length === 0 || typeLabels.every((label) => label.trim().length === 0);
    const hasAmbiguousLabels = meaningfulLabels.length > 1;

    /** 类型回退链：显式 TypeLabel → 结构化部位 → 兑换牌名称部位词 → 大类默认值。 */
    const resolveSubtype = (category: ItemCategory): string | undefined => {
      if (hasAmbiguousLabels) return undefined;
      return explicitSubtype
        ?? subtypeFromAucGenre(input)
        ?? (category === 'equipmentExchange' ? subtypeFromNameParts(normalizedName) : undefined)
        ?? CATEGORY_DEFAULT_SUBTYPE[category];
    };

    const finish = (category: ItemCategory, classification: ClassificationSource): ClassificationResult => {
      const subtype = resolveSubtype(category);
      return { category, classification, ...(subtype ? { subtype } : {}), typeLabels };
    };

    // 名称白名单优先级最高（特效武器含其升级道具 / 侠客秘卷 / 货币，均无结构化字段可依）。
    if (specialWeaponSet.has(normalizedName) || companionItemSet.has(normalizedName) || currencyItemSet.has(normalizedName)) {
      const category: ItemCategory = specialWeaponSet.has(normalizedName)
        ? 'specialWeapon'
        : companionItemSet.has(normalizedName)
          ? 'companion'
          : 'currency';
      const classification: ClassificationSource = explicitSubtype
        ? 'type-label'
        : isExactlyOther
          ? 'type-label-other-rule'
          : isMissingTypeLabel
            ? 'type-label-missing-fallback'
            : 'type-label';
      return finish(category, classification);
    }

    // TypeLabel 主映射：命中即沿用上游权威分类与标签。
    for (const typeLabel of typeLabels) {
      if (!typeLabel || typeLabel === rules.otherTypeLabel) continue;
      for (const [category, labels] of Object.entries(rules.primaryTypeLabels)) {
        if (labels?.includes(typeLabel)) {
          return { category: category as ItemCategory, classification: 'type-label', subtype: typeLabel, typeLabels };
        }
      }
      // 后缀规则（门派秘笈、各类配方等变体词表）
      for (const [suffix, category] of Object.entries(rules.typeLabelSuffixCategories ?? {})) {
        if (typeLabel.endsWith(suffix)) {
          return { category, classification: 'type-label', subtype: typeLabel, typeLabels };
        }
      }
    }

    // 非「其他」且非空的未知标签：不套用任何名称规则，直接判未分类。
    if (!isExactlyOther && !isMissingTypeLabel) {
      return { category: 'unknown', classification: 'unknown', typeLabels };
    }

    const category = secondaryCategory(input, isExactlyOther);
    if (category === undefined) {
      return { category: 'unknown', classification: 'type-label-missing-fallback', typeLabels };
    }

    return finish(category, isExactlyOther ? 'type-label-other-rule' : 'type-label-missing-fallback');
  };
}

export type Classifier = ReturnType<typeof createClassifier>;
