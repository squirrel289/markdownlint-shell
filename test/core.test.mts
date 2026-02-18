import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  discoverAnnotationConfigPath,
  loadAnnotationConfig,
  parseTreeBlockCommand,
  synchronizeMarkdownContent
} from "../src/core.mts";
import { cleanupTempRepo, createTempRepo, hasTreeCommand, writeText } from "./helpers.mts";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempRepo(tempDirs.pop() as string);
  }
});

test("parseTreeBlockCommand extracts tree args and annotation id", () => {
  const parsed = parseTreeBlockCommand("bash tree --noreport -F --charset utf-8 -L 3 examples {examples}");
  expect(parsed).not.toBeNull();
  expect(parsed?.annotationToken).toBe("{examples}");
  expect(parsed?.commandArgs).toContain("--noreport");
  expect(parsed?.commandArgs).toContain("examples");
});

test("parseTreeBlockCommand rejects multiple annotation selectors", () => {
  expect(() => parseTreeBlockCommand("bash tree --noreport -L 2 demo {a} {b}")).toThrow(
    "multiple annotation selectors"
  );
});

const testIfTree = hasTreeCommand ? test : test.skip;

testIfTree("synchronizeMarkdownContent renders annotations", () => {
  const repoPath = createTempRepo();
  tempDirs.push(repoPath);

  writeText(
    path.join(repoPath, ".bash-tree.yaml"),
    ["{demo}:", "  file.txt: File note", ""].join("\n")
  );
  writeText(path.join(repoPath, "demo", "file.txt"), "x");

  const markdownPath = path.join(repoPath, "README.md");
  writeText(
    markdownPath,
    [
      "```bash tree --noreport -F --charset utf-8 -L 2 demo {demo}",
      "demo/",
      "```",
      ""
    ].join("\n")
  );

  const content = fs.readFileSync(markdownPath, "utf8");
  const annotationConfigPath = discoverAnnotationConfigPath(markdownPath, {});
  const annotationConfig = loadAnnotationConfig(annotationConfigPath);
  const synced = synchronizeMarkdownContent(
    content,
    markdownPath,
    repoPath,
    {},
    annotationConfigPath,
    annotationConfig
  );

  expect(synced.content).toContain("# File note");
  expect(synced.issues).toHaveLength(0);
});
