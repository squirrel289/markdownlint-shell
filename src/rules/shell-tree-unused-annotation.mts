import { analyzeMarkdownFile } from "../core.mjs";
import type { MarkdownlintRule, MarkdownlintRuleParams, RuleConfig } from "../types.mjs";

function toConfig(params: MarkdownlintRuleParams): RuleConfig {
  return (params.config || {}) as RuleConfig;
}

export const shellTreeUnusedAnnotationRule: MarkdownlintRule = {
  names: ["SH003", "shell-tree-unused-annotation"],
  description: "Shell tree annotation labels must map to entries in rendered tree output",
  information: new URL("https://github.com/squirrel289/markdownlint-shell/blob/main/docs/rules/SH003.md"),
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

    for (const issue of analysis.unusedAnnotationIssues) {
      onError({
        lineNumber: issue.lineNumber,
        detail: issue.detail
      });
    }
  }
};
