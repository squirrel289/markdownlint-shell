export const DEFAULT_SECTION = "[default]";

export const SHELL_TOKENS = new Set(["bash", "sh", "zsh", "shell"]);

export const TREE_OPTIONS_WITH_VALUE = new Set([
  "-L",
  "-P",
  "-I",
  "-o",
  "-H",
  "-T",
  "--charset",
  "--filelimit"
]);

export const DISCOVERABLE_ANNOTATION_FILES = [
  ".bash-tree.yaml",
  ".bash-tree.yml"
];
