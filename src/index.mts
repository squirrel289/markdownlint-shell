import {
  parseAnnotationConfig,
  parseMarkdownTreeBlocks,
  parseTreeBlockCommand,
} from "./core.mjs";
import { shellTreeAnnotationSelectorRule } from "./rules/shell-tree-annotation-selector.mjs";
import { shellTreeSyncRule } from "./rules/shell-tree-sync.mjs";
import { shellTreeUnusedAnnotationRule } from "./rules/shell-tree-unused-annotation.mjs";
import { checkboxStateRule } from "./rules/checkbox-state.mjs";

const rules = [
  shellTreeSyncRule,
  shellTreeAnnotationSelectorRule,
  shellTreeUnusedAnnotationRule,
  checkboxStateRule,
];

export default rules;

export {
  rules,
  shellTreeAnnotationSelectorRule,
  shellTreeSyncRule,
  shellTreeUnusedAnnotationRule,
  checkboxStateRule,
  parseAnnotationConfig,
  parseMarkdownTreeBlocks,
  parseTreeBlockCommand,
};
