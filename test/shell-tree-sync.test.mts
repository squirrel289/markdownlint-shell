import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { shellTreeSyncRule } from "../src/rules/shell-tree-sync.mts";
import type { MarkdownlintRuleError } from "../src/types.mts";
import { cleanupTempRepo, createTempRepo, hasTreeCommand, writeText } from "./helpers.mts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempRepo(tempDirs.pop() as string);
  }
});

const testIfTree = hasTreeCommand ? test : test.skip;

function runSyncRule(markdownPath: string, config: Record<string, unknown> = {}): MarkdownlintRuleError[] {
  const errors: MarkdownlintRuleError[] = [];
  shellTreeSyncRule.function({ name: markdownPath, config }, (error) => errors.push(error));
  return errors;
}

testIfTree("reports drift without fixInfo", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, "demo", "sample.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 demo",
      "demo/",
      "```",
      ""
    ].join("\n")
  );

  const errors = runSyncRule(markdownPath);
  expect(errors).toHaveLength(1);
  expect(errors[0]?.fixInfo).toBeUndefined();
  expect(String(errors[0]?.detail || "")).toMatch(/^out_of_sync_paths=/);
  expect(String(errors[0]?.detail || "")).toContain("demo/sample.txt");
});

testIfTree("allows multiple tree paths without annotations", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, "a", "one.txt"), "x");
  writeText(path.join(repoPath, "b", "two.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 a b",
      "stale",
      "```",
      ""
    ].join("\n")
  );

  const errors = runSyncRule(markdownPath);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.some((error) => String(error.detail || "").includes("single path argument"))).toBe(false);
  expect(errors.some((error) => String(error.detail || "").startsWith("out_of_sync_paths="))).toBe(true);
});

testIfTree("fix mode rewrites stale block", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, "demo", "sample.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 demo",
      "stale",
      "```",
      ""
    ].join("\n")
  );

  const originalArgv = [...process.argv];
  process.argv.push("--fix");
  try {
    const errors = runSyncRule(markdownPath);
    expect(errors).toHaveLength(0);
  } finally {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  }

  const updated = fs.readFileSync(markdownPath, "utf8");
  expect(updated).toContain("demo/");
  expect(updated).not.toContain("stale");
});

testIfTree("fix mode avoids post-fix drift errors", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(path.join(repoPath, "demo", "sample.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 demo",
      "stale",
      "```",
      ""
    ].join("\n")
  );

  const originalArgv = [...process.argv];
  process.argv.push("--fix");
  try {
    const errors = runSyncRule(markdownPath);
    expect(errors).toHaveLength(0);
  } finally {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  }
});
