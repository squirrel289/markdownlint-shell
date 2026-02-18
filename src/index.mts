import { parseAnnotationConfig, parseMarkdownTreeBlocks, parseTreeBlockCommand } from "./core.mjs";
import { shellTreeAnnotationSelectorRule } from "./rules/shell-tree-annotation-selector.mjs";
import { shellTreeSyncRule } from "./rules/shell-tree-sync.mjs";
import { shellTreeUnusedAnnotationRule } from "./rules/shell-tree-unused-annotation.mjs";

const rules = [shellTreeSyncRule, shellTreeAnnotationSelectorRule, shellTreeUnusedAnnotationRule];

export default rules;

export {
  rules,
  shellTreeAnnotationSelectorRule,
  shellTreeSyncRule,
  shellTreeUnusedAnnotationRule,
  parseAnnotationConfig,
  parseMarkdownTreeBlocks,
  parseTreeBlockCommand
};
