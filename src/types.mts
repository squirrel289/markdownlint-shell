export interface MarkdownlintFixInfo {
  lineNumber?: number;
  editColumn?: number;
  deleteCount?: number;
  insertText?: string;
}

export interface MarkdownlintRuleError {
  lineNumber: number;
  detail?: string;
  context?: string;
  range?: [number, number];
  fixInfo?: MarkdownlintFixInfo;
}

export type MarkdownlintOnError = (errorInfo: MarkdownlintRuleError) => void;

export interface MarkdownlintRuleParams {
  name?: string;
  config?: Record<string, unknown>;
  lines?: string[];
  frontMatterLines?: string[];
  version?: string;
  parsers?: Record<string, unknown>;
}

export interface MarkdownlintRule {
  names: string[];
  description: string;
  tags: string[];
  parser: "none" | "markdownit" | "micromark";
  information?: URL;
  asynchronous?: boolean;
  function: (params: MarkdownlintRuleParams, onError: MarkdownlintOnError) => void;
}

export interface RuleConfig {
  include_backlog?: boolean;
  annotations_file?: string;
}

export interface TreeBlock {
  infoText: string;
  commandArgs: string[];
  annotationToken: string | null;
  startLineNumber: number;
  bodyStartLineNumber: number;
  openLineIndex: number;
  closeLineIndex: number;
  bodyText: string;
}

export interface TreeIssue {
  lineNumber: number;
  detail: string;
  outOfSyncPaths?: string[];
}

export interface AnnotationConfig {
  sections: Record<string, Record<string, string>>;
}

export interface ParseBlocksResult {
  blocks: TreeBlock[];
  issues: TreeIssue[];
}

export interface AnalyzeResult {
  syncIssues: TreeIssue[];
  selectorIssues: TreeIssue[];
  unusedAnnotationIssues: TreeIssue[];
  parserIssues: TreeIssue[];
}
