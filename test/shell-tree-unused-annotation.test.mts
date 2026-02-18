import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { shellTreeUnusedAnnotationRule } from "../src/rules/shell-tree-unused-annotation.mts";
import type { MarkdownlintRuleError } from "../src/types.mts";
import { cleanupTempRepo, createTempRepo, hasTreeCommand, writeText } from "./helpers.mts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempRepo(tempDirs.pop() as string);
  }
});

const testIfTree = hasTreeCommand ? test : test.skip;

function runUnusedRule(markdownPath: string): MarkdownlintRuleError[] {
  const errors: MarkdownlintRuleError[] = [];
  shellTreeUnusedAnnotationRule.function({ name: markdownPath, config: {} }, (error) => errors.push(error));
  return errors;
}

testIfTree("reports unused annotation labels", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, ".bash-tree.yaml"), ["{demo}:", "  missing.txt: Missing note", ""].join("\n"));
  writeText(path.join(repoPath, "demo", "sample.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 demo {demo}",
      "stale",
      "```",
      ""
    ].join("\n")
  );

  const errors = runUnusedRule(markdownPath);
  expect(errors).toHaveLength(1);
  expect(String(errors[0]?.detail || "")).toContain("unused_annotation_labels=missing.txt");
});
