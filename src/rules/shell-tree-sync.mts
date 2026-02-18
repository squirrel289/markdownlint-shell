import {
  analyzeMarkdownFile,
  formatOutOfSyncDetail,
  isFixMode,
  synchronizeMarkdownFile
} from "../core.mjs";
import type { MarkdownlintRule, MarkdownlintRuleParams, RuleConfig } from "../types.mjs";

function toConfig(params: MarkdownlintRuleParams): RuleConfig {
  return (params.config || {}) as RuleConfig;
}

export const shellTreeSyncRule: MarkdownlintRule = {
  names: ["SH001", "shell-tree-sync", "BASH001"],
  description: "Shell tree code fences must match filesystem output",
  information: new URL("https://github.com/squirrel289/markdownlint-shell/blob/main/docs/rules/SH001.md"),
  tags: ["shell", "tree", "generated"],
  parser: "none",
  function: (params, onError) => {
    const fileName = params.name;
    if (typeof fileName !== "string" || !fileName || fileName === "<stdin>") {
      return;
    }

    const config = toConfig(params);

    if (isFixMode()) {
      synchronizeMarkdownFile(fileName, config);
    }

    const analysis = analyzeMarkdownFile(fileName, config);
    if (!analysis) {
      return;
    }

    for (const issue of analysis.parserIssues) {
      onError({
        lineNumber: issue.lineNumber,
        detail: issue.detail
      });
    }

    for (const issue of analysis.syncIssues) {
      onError({
        lineNumber: issue.lineNumber,
        detail: formatOutOfSyncDetail(issue.outOfSyncPaths || [])
      });
    }
  }
};
