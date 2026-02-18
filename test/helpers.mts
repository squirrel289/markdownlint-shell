import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTempRepo(prefix = "markdownlint-shell-"): string {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(repoPath, ".git"));
  return repoPath;
}

export function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function cleanupTempRepo(repoPath: string): void {
  fs.rmSync(repoPath, { recursive: true, force: true });
}

export const hasTreeCommand: boolean = (() => {
  const result = childProcess.spawnSync("tree", ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
})();
