import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SECTION,
  DISCOVERABLE_ANNOTATION_FILES,
  SHELL_TOKENS,
  TREE_OPTIONS_WITH_VALUE
} from "./constants.mjs";
import type {
  AnalyzeResult,
  AnnotationConfig,
  ParseBlocksResult,
  RuleConfig,
  TreeBlock,
  TreeIssue
} from "./types.mjs";

interface FileContext {
  absolutePath: string;
  repoRoot: string;
  markdownRelPath: string;
}

interface RenderResult {
  bodyText: string;
  selectorIssue: string | null;
  unusedAnnotationKeys: string[];
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitShellTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (const char of input) {
    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (/\s/.test(char)) {
      flush();
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }

  if (quote !== null) {
    throw new Error("invalid command token (unterminated quote)");
  }

  flush();
  return tokens;
}

export function parseTreeBlockCommand(infoText: string): {
  commandArgs: string[];
  annotationToken: string | null;
} | null {
  const tokens = splitShellTokens(infoText.trim());
  if (tokens.length < 2) {
    return null;
  }

  const shellToken = tokens[0]?.toLowerCase();
  if (!shellToken || !SHELL_TOKENS.has(shellToken) || tokens[1] !== "tree") {
    return null;
  }

  const commandArgs: string[] = [];
  let annotationToken: string | null = null;

  for (const token of tokens.slice(2)) {
    if (/^\{[^{}]+\}$/.test(token)) {
      if (annotationToken !== null) {
        throw new Error("multiple annotation selectors are not allowed");
      }
      annotationToken = token;
      continue;
    }
    commandArgs.push(token);
  }

  return {
    commandArgs,
    annotationToken
  };
}

export function parseMarkdownTreeBlocks(content: string): ParseBlocksResult {
  const issues: TreeIssue[] = [];
  const blocks: TreeBlock[] = [];
  const lines = normalizeNewlines(content).split("\n");

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const openMatch = line.match(/^([ \t]*)(`{3,})\s*(.*?)\s*$/);
    if (!openMatch) {
      index += 1;
      continue;
    }

    let parsedCommand: ReturnType<typeof parseTreeBlockCommand>;
    try {
      parsedCommand = parseTreeBlockCommand(openMatch[3] ?? "");
    } catch (error) {
      issues.push({
        lineNumber: index + 1,
        detail: error instanceof Error ? error.message : String(error)
      });
      index += 1;
      continue;
    }

    if (!parsedCommand) {
      index += 1;
      continue;
    }

    const indent = openMatch[1] ?? "";
    const fence = openMatch[2] ?? "```";
    const closePattern = new RegExp(`^${escapeRegExp(indent)}${escapeRegExp(fence)}\\s*$`);

    let closeIndex = -1;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const probeLine = lines[probe] ?? "";
      if (closePattern.test(probeLine)) {
        closeIndex = probe;
        break;
      }
    }

    if (closeIndex < 0) {
      issues.push({
        lineNumber: index + 1,
        detail: "unterminated fenced code block for bash tree command"
      });
      break;
    }

    blocks.push({
      infoText: openMatch[3] ?? "",
      commandArgs: parsedCommand.commandArgs,
      annotationToken: parsedCommand.annotationToken,
      startLineNumber: index + 1,
      bodyStartLineNumber: index + 2,
      openLineIndex: index,
      closeLineIndex: closeIndex,
      bodyText: lines.slice(index + 1, closeIndex).join("\n")
    });

    index = closeIndex + 1;
  }

  return { blocks, issues };
}

function findRepoRoot(startPath: string): string {
  let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);

  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function shouldSkipMarkdown(markdownRelPath: string, config: RuleConfig): boolean {
  const includeBacklog = typeof config.include_backlog === "boolean" ? config.include_backlog : false;
  if (includeBacklog) {
    return false;
  }
  return markdownRelPath.split("/").includes("backlog");
}

function parseYamlScalar(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "";
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      if (value.startsWith('"')) {
        return String(JSON.parse(value));
      }
      return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    } catch {
      return value.slice(1, -1);
    }
  }

  return value;
}

function splitYamlKeyValueLine(raw: string): [string, string] | null {
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!char) {
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote && char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'" || char === '"') {
      if (!quote) {
        quote = char;
      } else if (quote === char) {
        quote = null;
      }
      continue;
    }

    if (char === ":" && !quote) {
      return [raw.slice(0, index), raw.slice(index + 1)];
    }
  }

  return null;
}

function parseYamlEntry(raw: string, lineNumber: number, configPath: string): [string, string] {
  const split = splitYamlKeyValueLine(raw);
  if (!split) {
    throw new Error(`invalid YAML entry at ${configPath}:${lineNumber}: missing ':'`);
  }
  return [parseYamlScalar(split[0] ?? ""), (split[1] ?? "").trim()];
}

function normalizeSectionName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed || trimmed === "default" || trimmed === DEFAULT_SECTION) {
    return DEFAULT_SECTION;
  }
  return trimmed;
}

function normalizeAnnotationKey(rawKey: string): string {
  let normalized = toPosix(rawKey.trim());
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (!normalized || normalized === ".") {
    return ".";
  }
  return normalized;
}

export function parseAnnotationConfig(content: string, configPath: string): AnnotationConfig {
  const sections: Record<string, Record<string, string>> = {};
  let activeSection: string | null = null;

  const entries = normalizeNewlines(content).split("\n").entries();
  for (const [index, rawLine] of entries) {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (rawLine.includes("\t")) {
      throw new Error(`invalid YAML indentation (tab) at ${configPath}:${lineNumber}`);
    }

    const indent = rawLine.length - rawLine.replace(/^\s+/, "").length;
    if (indent !== 0 && indent !== 2) {
      throw new Error(`invalid YAML indentation at ${configPath}:${lineNumber}: expected 0/2 spaces`);
    }

    if (indent === 0) {
      const [key, value] = parseYamlEntry(trimmed, lineNumber, configPath);
      if (value) {
        throw new Error(`invalid section at ${configPath}:${lineNumber}: expected nested mapping`);
      }
      activeSection = normalizeSectionName(key);
      sections[activeSection] ||= {};
      continue;
    }

    if (!activeSection) {
      throw new Error(`invalid YAML structure at ${configPath}:${lineNumber}: note without section`);
    }

    const [rawKey, rawValue] = parseYamlEntry(trimmed, lineNumber, configPath);
    if (!rawValue) {
      throw new Error(`invalid annotation note at ${configPath}:${lineNumber}: note text is required`);
    }

    sections[activeSection][normalizeAnnotationKey(rawKey)] = parseYamlScalar(rawValue);
  }

  return { sections };
}

export function discoverAnnotationConfigPath(markdownAbsolutePath: string, ruleConfig: RuleConfig): string | null {
  const configuredPath = typeof ruleConfig.annotations_file === "string" ? ruleConfig.annotations_file.trim() : "";
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  let current = path.dirname(markdownAbsolutePath);
  for (;;) {
    for (const filename of DISCOVERABLE_ANNOTATION_FILES) {
      const candidate = path.join(current, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

export function loadAnnotationConfig(configPath: string | null): AnnotationConfig | null {
  if (!configPath) {
    return null;
  }

  const relativeConfigPath = toPosix(path.relative(process.cwd(), configPath));
  const content = fs.readFileSync(configPath, "utf8");
  return parseAnnotationConfig(content, relativeConfigPath);
}

function determineTreePositionalArgs(commandArgs: string[]): string[] {
  const positional: string[] = [];
  let expectValue = false;

  for (let index = 0; index < commandArgs.length; index += 1) {
    const token = commandArgs[index] ?? "";

    if (expectValue) {
      expectValue = false;
      continue;
    }

    if (token === "--") {
      positional.push(...commandArgs.slice(index + 1));
      break;
    }

    if (TREE_OPTIONS_WITH_VALUE.has(token)) {
      expectValue = true;
      continue;
    }

    if (/^-(L|P|I).+/.test(token)) {
      continue;
    }

    if (/^--(charset|filelimit)=/.test(token)) {
      continue;
    }

    if (token.startsWith("-")) {
      continue;
    }

    positional.push(token);
  }

  return positional;
}

function determineTreeRootPath(commandArgs: string[]): string {
  const positional = determineTreePositionalArgs(commandArgs);
  if (positional.length === 0) {
    return ".";
  }
  if (positional.length > 1) {
    throw new Error("bash tree block supports a single path argument when applying annotations");
  }
  return positional[0] ?? ".";
}

function runTreeCommand(repoRoot: string, commandArgs: string[]): string {
  const result = childProcess.spawnSync("tree", commandArgs, {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.error) {
    throw new Error(`failed to run tree: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "tree command failed").trim();
    throw new Error(detail || "tree command failed");
  }

  const normalized = normalizeNewlines(result.stdout).replace(/\u00A0/g, " ");
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
}

function normalizeTreeEntryName(rawName: string): string {
  let name = rawName.trim();
  name = name.replace(/\s+#\s.*$/, "").trimEnd();

  const arrowIndex = name.indexOf(" -> ");
  if (arrowIndex >= 0) {
    name = name.slice(0, arrowIndex);
  }

  if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"))) {
    name = name.slice(1, -1);
  }

  if (/[\/@=*|]$/.test(name)) {
    name = name.slice(0, -1);
  }

  return name;
}

interface ParsedTreeRow {
  line: string;
  relPath: string | null;
  isDirectory: boolean;
}

function parseTreeRows(treeOutput: string, treeRootAbsolutePath: string): ParsedTreeRow[] {
  const rows: ParsedTreeRow[] = [];
  const pathAtDepth: string[] = ["."];
  const lines = treeOutput ? treeOutput.split("\n") : [];
  let sawRoot = false;

  for (const line of lines) {
    const normalizedLine = line.replace(/\u00A0/g, " ");

    if (!sawRoot) {
      sawRoot = true;
      rows.push({ line: normalizedLine, relPath: ".", isDirectory: true });
      continue;
    }

    const unicodeMatch = normalizedLine.match(/^((?:│   |    )*)([├└]── )(.*)$/);
    const asciiMatch = normalizedLine.match(/^((?:\|   |    )*)(\|-- |`-- )(.*)$/);
    const matched = unicodeMatch || asciiMatch;

    if (!matched) {
      rows.push({ line: normalizedLine, relPath: null, isDirectory: false });
      continue;
    }

    const depth = matched[1].length / 4 + 1;
    const rawName = matched[3] ?? "";
    const normalizedName = normalizeTreeEntryName(rawName);

    const parentPath = pathAtDepth[depth - 1] || ".";
    const relPath = parentPath === "." ? normalizedName : `${parentPath}/${normalizedName}`;

    const absolutePath = path.resolve(treeRootAbsolutePath, relPath);
    let isDirectory = false;

    try {
      isDirectory = fs.statSync(absolutePath).isDirectory();
    } catch {
      isDirectory = /\/$/.test(rawName);
    }

    pathAtDepth[depth] = relPath;
    pathAtDepth.length = depth + 1;
    rows.push({ line: normalizedLine, relPath, isDirectory });
  }

  return rows;
}

function lookupAnnotation(
  relPath: string | null,
  isDirectory: boolean,
  notes: Record<string, string>
): [string | null, string | null] {
  if (!relPath || relPath === ".") {
    const rootNote = notes["."];
    return [rootNote || null, rootNote ? "." : null];
  }

  if (isDirectory) {
    const directoryKey = `${relPath}/`;
    if (Object.prototype.hasOwnProperty.call(notes, directoryKey)) {
      return [notes[directoryKey], directoryKey];
    }
    if (Object.prototype.hasOwnProperty.call(notes, relPath)) {
      return [notes[relPath], relPath];
    }
    return [null, null];
  }

  if (Object.prototype.hasOwnProperty.call(notes, relPath)) {
    return [notes[relPath], relPath];
  }

  return [null, null];
}

function formatAnnotatedRows(rows: Array<{ line: string; note: string | null }>): string[] {
  if (!rows.some((row) => Boolean(row.note))) {
    return rows.map((row) => row.line);
  }

  const maxWidth = Math.max(...rows.map((row) => row.line.length));
  const noteColumn = maxWidth + 2;

  return rows.map((row) => {
    if (!row.note) {
      return row.line;
    }
    const padding = " ".repeat(Math.max(1, noteColumn - row.line.length));
    return `${row.line}${padding}# ${row.note}`;
  });
}

function resolveNotesForBlock(
  annotationConfig: AnnotationConfig | null,
  annotationToken: string | null
): { notes: Record<string, string>; selectorIssue: string | null; selectedSection: string | null } {
  if (!annotationConfig) {
    return {
      notes: {},
      selectorIssue: annotationToken
        ? `annotation selector ${annotationToken} was provided but no annotation config file was discovered`
        : null,
      selectedSection: null
    };
  }

  if (annotationToken) {
    const selected = annotationConfig.sections[annotationToken];
    if (selected) {
      return {
        notes: selected,
        selectorIssue: null,
        selectedSection: annotationToken
      };
    }

    return {
      notes: annotationConfig.sections[DEFAULT_SECTION] || {},
      selectorIssue: `annotation selector ${annotationToken} did not match any configured section`,
      selectedSection: DEFAULT_SECTION
    };
  }

  return {
    notes: annotationConfig.sections[DEFAULT_SECTION] || {},
    selectorIssue: null,
    selectedSection: DEFAULT_SECTION
  };
}

function renderBlockBody(
  block: TreeBlock,
  repoRoot: string,
  annotationConfig: AnnotationConfig | null
): RenderResult {
  const treeOutput = runTreeCommand(repoRoot, block.commandArgs);
  const resolved = resolveNotesForBlock(annotationConfig, block.annotationToken);
  const noteKeys = Object.keys(resolved.notes);

  if (noteKeys.length === 0) {
    return {
      bodyText: treeOutput,
      selectorIssue: resolved.selectorIssue,
      unusedAnnotationKeys: []
    };
  }

  const treeRootArg = determineTreeRootPath(block.commandArgs);
  const treeRootAbsolutePath = path.resolve(repoRoot, treeRootArg);

  const parsedRows = parseTreeRows(treeOutput, treeRootAbsolutePath);
  const usedAnnotationKeys = new Set<string>();
  const decoratedRows: Array<{ line: string; note: string | null }> = [];

  for (const row of parsedRows) {
    const [note, key] = lookupAnnotation(row.relPath, row.isDirectory, resolved.notes);
    if (key) {
      usedAnnotationKeys.add(key);
    }
    decoratedRows.push({ line: row.line, note });
  }

  const unusedAnnotationKeys = noteKeys
    .filter((key) => !usedAnnotationKeys.has(key))
    .sort((left, right) => left.localeCompare(right));

  return {
    bodyText: formatAnnotatedRows(decoratedRows).join("\n"),
    selectorIssue: resolved.selectorIssue,
    unusedAnnotationKeys
  };
}

function collectTreeBodyDifferenceLines(expectedBodyText: string, actualBodyText: string): number[] {
  const expectedLines = expectedBodyText ? expectedBodyText.split("\n") : [];
  const actualLines = actualBodyText ? actualBodyText.split("\n") : [];
  const lineCount = Math.max(expectedLines.length, actualLines.length);
  const differences: number[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      differences.push(index + 1);
    }
  }

  return differences;
}

function safeTreeRootForDetail(commandArgs: string[]): string | null {
  try {
    return determineTreeRootPath(commandArgs);
  } catch {
    return null;
  }
}

function parseBodyRelPaths(bodyText: string): Array<string | null> {
  const lines = bodyText ? bodyText.split("\n") : [];
  const relPaths: Array<string | null> = [];
  const pathAtDepth: string[] = ["."];
  let sawRoot = false;

  for (const line of lines) {
    const normalizedLine = line.replace(/\u00A0/g, " ");

    if (!sawRoot) {
      sawRoot = true;
      relPaths.push(".");
      continue;
    }

    const unicodeMatch = normalizedLine.match(/^((?:│   |    )*)([├└]── )(.*)$/);
    const asciiMatch = normalizedLine.match(/^((?:\|   |    )*)(\|-- |`-- )(.*)$/);
    const matched = unicodeMatch || asciiMatch;

    if (!matched) {
      relPaths.push(null);
      continue;
    }

    const depth = matched[1].length / 4 + 1;
    const normalizedName = normalizeTreeEntryName(matched[3] ?? "");
    const parentPath = pathAtDepth[depth - 1] || ".";
    const relPath = parentPath === "." ? normalizedName : `${parentPath}/${normalizedName}`;

    pathAtDepth[depth] = relPath;
    pathAtDepth.length = depth + 1;
    relPaths.push(relPath);
  }

  return relPaths;
}

function normalizeRootPath(rootPath: string | null): string {
  if (!rootPath) {
    return ".";
  }

  let normalized = toPosix(rootPath.trim());
  if (!normalized || normalized === ".") {
    return ".";
  }
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || ".";
}

function qualifyPath(rootPath: string | null, relPath: string | null): string | null {
  if (!relPath || relPath === ".") {
    return null;
  }

  const normalizedRoot = normalizeRootPath(rootPath);
  if (normalizedRoot === ".") {
    return relPath;
  }
  return `${normalizedRoot}/${relPath}`;
}

export function collectOutOfSyncPaths(block: TreeBlock, renderedBodyText: string): string[] {
  const differenceLines = collectTreeBodyDifferenceLines(renderedBodyText, block.bodyText);
  const expectedRelPaths = parseBodyRelPaths(renderedBodyText);
  const actualRelPaths = parseBodyRelPaths(block.bodyText);
  const root = safeTreeRootForDetail(block.commandArgs);
  const outOfSyncPaths: string[] = [];
  const seen = new Set<string>();

  for (const lineNumber of differenceLines) {
    const index = lineNumber - 1;
    const candidates = [expectedRelPaths[index] ?? null, actualRelPaths[index] ?? null];
    for (const relPath of candidates) {
      const qualifiedPath = qualifyPath(root, relPath);
      if (!qualifiedPath || seen.has(qualifiedPath)) {
        continue;
      }
      seen.add(qualifiedPath);
      outOfSyncPaths.push(qualifiedPath);
    }
  }

  return outOfSyncPaths;
}

export function formatOutOfSyncDetail(outOfSyncPaths: string[]): string {
  if (!outOfSyncPaths.length) {
    return "out_of_sync_paths=<unknown>";
  }
  return `out_of_sync_paths=${outOfSyncPaths.join(",")}`;
}

function hasTreeFence(content: string): boolean {
  return /`{3,}\s*(?:bash|sh|zsh|shell)\s+tree\b/.test(content);
}

function resolveFileContext(fileName: string, config: RuleConfig): FileContext | null {
  const absolutePath = path.isAbsolute(fileName) ? fileName : path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  if (path.extname(absolutePath).toLowerCase() !== ".md") {
    return null;
  }

  const repoRoot = findRepoRoot(absolutePath);
  const markdownRelPath = toPosix(path.relative(repoRoot, absolutePath));
  if (markdownRelPath.startsWith("..") || path.isAbsolute(markdownRelPath)) {
    return null;
  }

  if (shouldSkipMarkdown(markdownRelPath, config)) {
    return null;
  }

  return {
    absolutePath,
    repoRoot,
    markdownRelPath
  };
}

function analyzeContent(
  content: string,
  context: FileContext,
  config: RuleConfig
): AnalyzeResult {
  const parsed = parseMarkdownTreeBlocks(content);
  const parserIssues: TreeIssue[] = [...parsed.issues];
  const syncIssues: TreeIssue[] = [];
  const selectorIssues: TreeIssue[] = [];
  const unusedAnnotationIssues: TreeIssue[] = [];

  const annotationConfigPath = discoverAnnotationConfigPath(context.absolutePath, config);
  let annotationConfig: AnnotationConfig | null = null;

  try {
    annotationConfig = loadAnnotationConfig(annotationConfigPath);
  } catch (error) {
    parserIssues.push({
      lineNumber: 1,
      detail: error instanceof Error ? error.message : String(error)
    });
    return {
      parserIssues,
      syncIssues,
      selectorIssues,
      unusedAnnotationIssues
    };
  }

  for (const block of parsed.blocks) {
    let rendered: RenderResult;
    try {
      rendered = renderBlockBody(block, context.repoRoot, annotationConfig);
    } catch (error) {
      parserIssues.push({
        lineNumber: block.startLineNumber,
        detail: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    if (rendered.selectorIssue) {
      selectorIssues.push({
        lineNumber: block.startLineNumber,
        detail: rendered.selectorIssue
      });
    }

    if (rendered.unusedAnnotationKeys.length > 0) {
      unusedAnnotationIssues.push({
        lineNumber: block.startLineNumber,
        detail: `unused_annotation_labels=${rendered.unusedAnnotationKeys.join(",")}`
      });
    }

    if (rendered.bodyText !== block.bodyText) {
      const outOfSyncPaths = collectOutOfSyncPaths(block, rendered.bodyText);
      syncIssues.push({
        lineNumber: block.startLineNumber,
        detail: formatOutOfSyncDetail(outOfSyncPaths),
        outOfSyncPaths
      });
    }
  }

  return {
    parserIssues,
    syncIssues,
    selectorIssues,
    unusedAnnotationIssues
  };
}

export function analyzeMarkdownFile(fileName: string, config: RuleConfig = {}): AnalyzeResult | null {
  const context = resolveFileContext(fileName, config);
  if (!context) {
    return null;
  }

  const content = fs.readFileSync(context.absolutePath, "utf8");
  if (!hasTreeFence(content)) {
    return null;
  }

  return analyzeContent(content, context, config);
}

export function synchronizeMarkdownContent(
  content: string,
  markdownAbsolutePath: string,
  repoRoot: string,
  ruleConfig: RuleConfig,
  annotationConfigPath: string | null,
  annotationConfig: AnnotationConfig | null
): { content: string; issues: TreeIssue[] } {
  const parsed = parseMarkdownTreeBlocks(content);
  const issues: TreeIssue[] = [...parsed.issues];
  const lines = normalizeNewlines(content).split("\n");

  const replacements: Array<{ start: number; deleteCount: number; insertLines: string[] }> = [];

  for (const block of parsed.blocks) {
    let rendered: RenderResult;
    try {
      rendered = renderBlockBody(block, repoRoot, annotationConfig);
    } catch (error) {
      issues.push({
        lineNumber: block.startLineNumber,
        detail: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    replacements.push({
      start: block.openLineIndex + 1,
      deleteCount: block.closeLineIndex - block.openLineIndex - 1,
      insertLines: rendered.bodyText ? rendered.bodyText.split("\n") : []
    });
  }

  replacements.sort((left, right) => right.start - left.start);
  for (const replacement of replacements) {
    lines.splice(replacement.start, replacement.deleteCount, ...replacement.insertLines);
  }

  return {
    content: lines.join("\n"),
    issues
  };
}

export function synchronizeMarkdownFile(fileName: string, config: RuleConfig = {}): { updated: boolean; issues: TreeIssue[] } | null {
  const context = resolveFileContext(fileName, config);
  if (!context) {
    return null;
  }

  const content = fs.readFileSync(context.absolutePath, "utf8");
  if (!hasTreeFence(content)) {
    return null;
  }

  const annotationConfigPath = discoverAnnotationConfigPath(context.absolutePath, config);
  let annotationConfig: AnnotationConfig | null = null;

  try {
    annotationConfig = loadAnnotationConfig(annotationConfigPath);
  } catch (error) {
    return {
      updated: false,
      issues: [
        {
          lineNumber: 1,
          detail: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  const synced = synchronizeMarkdownContent(
    content,
    context.absolutePath,
    context.repoRoot,
    config,
    annotationConfigPath,
    annotationConfig
  );

  const updated = synced.content !== content;
  if (updated) {
    fs.writeFileSync(context.absolutePath, synced.content, "utf8");
  }

  return {
    updated,
    issues: synced.issues
  };
}

export function isFixMode(): boolean {
  return process.argv.includes("--fix") || process.argv.includes("-f");
}
