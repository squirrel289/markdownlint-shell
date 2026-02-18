import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { shellTreeAnnotationSelectorRule } from "../src/rules/shell-tree-annotation-selector.mts";
import type { MarkdownlintRuleError } from "../src/types.mts";
import { cleanupTempRepo, createTempRepo, hasTreeCommand, writeText } from "./helpers.mts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempRepo(tempDirs.pop() as string);
  }
});

const testIfTree = hasTreeCommand ? test : test.skip;

function runSelectorRule(markdownPath: string): MarkdownlintRuleError[] {
  const errors: MarkdownlintRuleError[] = [];
  shellTreeAnnotationSelectorRule.function({ name: markdownPath, config: {} }, (error) => errors.push(error));
  return errors;
}

testIfTree("reports selector when no annotation config exists", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

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

  const errors = runSelectorRule(markdownPath);
  expect(errors).toHaveLength(1);
  expect(String(errors[0]?.detail || "")).toContain("no annotation config file was discovered");
});

testIfTree("reports unknown selector section", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, ".bash-tree.yaml"), ["{other}:", "  sample.txt: sample", ""].join("\n"));
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

  const errors = runSelectorRule(markdownPath);
  expect(errors).toHaveLength(1);
  expect(String(errors[0]?.detail || "")).toContain("did not match any configured section");
});
