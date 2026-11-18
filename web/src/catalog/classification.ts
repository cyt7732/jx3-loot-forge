import rulesJson from './type-label-rules.json';
import { createClassifier, type ClassificationRules } from './classification-core';

export type {
  ClassificationInput,
  ClassificationResult,
  ClassificationSource,
} from './classification-core';

/** The JSON file is the runtime source of truth for all labels and prefixes. */
export const TYPE_LABEL_RULES = rulesJson as unknown as ClassificationRules;

/**
 * 唯一一份分类实现的运行时入口（前端与测试使用）。
 * 分类逻辑本身在 `classification-core.ts`，便于爬虫/重分类脚本注入同一套规则复用。
 */
export const classifyItem = createClassifier(TYPE_LABEL_RULES);

// Explicit aliases keep the small pure API easy to consume from callers that
// describe the operation by its input field.
export const classifyCatalogItem = classifyItem;
export const classifyTypeLabels = classifyItem;
