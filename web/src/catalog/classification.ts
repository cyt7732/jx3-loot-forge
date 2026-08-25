import type { ItemCategory } from '../domain/types';
import rulesJson from './type-label-rules.json';

/**
 * How the category was obtained. The two `type-label*` values are emitted by
 * this classifier; the older values remain accepted for legacy snapshots.
 */
export type ClassificationSource =
  | 'type-label'
  | 'type-label-other-rule'
  | 'type-label-missing-fallback'
  | 'metadata'
  | 'name-fallback'
  | 'unknown';

export type ClassificationInput = {
  name: string;
  /** Raw TypeLabel values. They are intentionally not normalized here. */
  typeLabels?: readonly string[];
  isEquip?: boolean;
  slot?: string;
  slots?: readonly string[];
};

export type ClassificationResult = {
  category: ItemCategory;
  classification: ClassificationSource;
  /** The exact primary TypeLabel which supplied the category, when applicable. */
  subtype?: string;
  /** A copy of the raw values so callers can persist them as `typeLabels`. */
  typeLabels: string[];
};

type TypeLabelRules = {
  version: number;
  otherTypeLabel: string;
  categoryIds: readonly ItemCategory[];
  primaryTypeLabels: Partial<Record<ItemCategory, readonly string[]>>;
  secondaryRules: {
    petWhenEquipWithoutExplicitSlot: boolean;
    unknownSlotValues: readonly string[];
    nameSuffixes: {
      bigIron: string;
      smallIron: string;
    };
    equipmentExchangePrefixes: readonly string[];
    schools: readonly string[];
    equipmentPartTokens: readonly string[];
  };
};

/** The JSON file is the runtime source of truth for all labels and prefixes. */
export const TYPE_LABEL_RULES = rulesJson as TypeLabelRules;

const equipmentExchangeCategory: ItemCategory = 'equipmentExchange';

function hasExplicitSlot(input: ClassificationInput): boolean {
  const values = [input.slot, ...(input.slots ?? [])];
  const unknownValues = new Set(
    TYPE_LABEL_RULES.secondaryRules.unknownSlotValues.map((value) => value.toLocaleLowerCase()),
  );

  return values.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLocaleLowerCase();
    return normalized.length > 0 && !unknownValues.has(normalized);
  });
}

function endsWithEquipmentPart(value: string): string | undefined {
  const tokens = [...TYPE_LABEL_RULES.secondaryRules.equipmentPartTokens]
    .sort((left, right) => right.length - left.length);
  return tokens.find((token) => value.endsWith(token));
}

function isSetAndSchoolName(name: string): boolean {
  const parts = name.split('·');
  if (parts.length < 2) return false;
  const school = parts.at(-1);
  if (!school || !TYPE_LABEL_RULES.secondaryRules.schools.includes(school)) return false;
  const setAndPart = parts.slice(0, -1).join('·');
  return setAndPart.length > 0 && endsWithEquipmentPart(setAndPart) !== undefined;
}

function hasEquipmentPartSegment(name: string): boolean {
  return name.split('·').some((part) => endsWithEquipmentPart(part) !== undefined);
}

function secondaryCategory(input: ClassificationInput, allowSpecialDropFallback = true): ItemCategory | undefined {
  const { secondaryRules } = TYPE_LABEL_RULES;

  // This is deliberately first: an equip item without a usable slot is the
  // confirmed pet signal, even if its name happens to contain an iron suffix.
  if (
    secondaryRules.petWhenEquipWithoutExplicitSlot
    && input.isEquip === true
    && !hasExplicitSlot(input)
  ) {
    return 'pet';
  }

  if (input.name.endsWith(secondaryRules.nameSuffixes.bigIron)) return 'bigIron';
  if (input.name.endsWith(secondaryRules.nameSuffixes.smallIron)) return 'smallIron';

  if (secondaryRules.equipmentExchangePrefixes.some((prefix) => input.name.startsWith(prefix))) {
    return equipmentExchangeCategory;
  }

  if (isSetAndSchoolName(input.name)) return equipmentExchangeCategory;
  if (hasEquipmentPartSegment(input.name)) return equipmentExchangeCategory;

  return allowSpecialDropFallback ? 'specialDrop' : undefined;
}

/**
 * Classifies one catalog item from its raw TypeLabel values and optional
 * metadata. This function is pure: it neither mutates its argument nor the
 * JSON rules, and it only permits name rules for an exactly single `其他`
 * TypeLabel.
 */
export function classifyItem(input: ClassificationInput): ClassificationResult {
  const typeLabels = [...(input.typeLabels ?? [])];

  for (const typeLabel of typeLabels) {
    if (!typeLabel || typeLabel === TYPE_LABEL_RULES.otherTypeLabel) continue;
    for (const [category, labels] of Object.entries(TYPE_LABEL_RULES.primaryTypeLabels)) {
      if (labels?.includes(typeLabel)) {
        return {
          category: category as ItemCategory,
          classification: 'type-label',
          subtype: typeLabel,
          typeLabels,
        };
      }
    }
  }

  const isExactlyOther = typeLabels.length === 1 && typeLabels[0] === TYPE_LABEL_RULES.otherTypeLabel;
  const isMissingTypeLabel = typeLabels.length === 0 || typeLabels.every((typeLabel) => typeLabel.trim().length === 0);
  if (!isExactlyOther && !isMissingTypeLabel) {
    return { category: 'unknown', classification: 'unknown', typeLabels };
  }

  const category = secondaryCategory(input, isExactlyOther);
  if (category === undefined) {
    return { category: 'unknown', classification: 'type-label-missing-fallback', typeLabels };
  }

  return {
    category,
    classification: isExactlyOther ? 'type-label-other-rule' : 'type-label-missing-fallback',
    typeLabels,
  };
}

// Explicit aliases keep the small pure API easy to consume from the crawler
// migration and from callers that describe the operation by its input field.
export const classifyCatalogItem = classifyItem;
export const classifyTypeLabels = classifyItem;
