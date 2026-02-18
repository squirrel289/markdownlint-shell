import { analyzeMarkdownFile } from "../core.mjs";
import type { MarkdownlintRule, MarkdownlintRuleParams, RuleConfig } from "../types.mjs";

function toConfig(params: MarkdownlintRuleParams): RuleConfig {
  return (params.config || {}) as RuleConfig;
}

export const shellTreeAnnotationSelectorRule: MarkdownlintRule = {
  names: ["SH002", "shell-tree-annotation-selector"],
  description: "Shell tree annotation selectors must resolve to known annotation sections",
  information: new URL("https://github.com/squirrel289/markdownlint-shell/blob/main/docs/rules/SH002.md"),
  tags: ["shell", "tree", "annotations"],
  parser: "none",
  function: (params, onError) => {
    const fileName = params.name;
    if (typeof fileName !== "string" || !fileName || fileName === "<stdin>") {
      return;
    }

    const analysis = analyzeMarkdownFile(fileName, toConfig(params));
    if (!analysis) {
      return;
    }

    for (const issue of analysis.selectorIssues) {
      onError({
        lineNumber: issue.lineNumber,
        detail: issue.detail
      });
    }
  }
};
