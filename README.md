# markdownlint-shell

Custom `markdownlint` rules for shell tree code fences.

## Rule Set

- `SH001` / `shell-tree-sync`: verify shell tree blocks are synchronized with filesystem output.
- `SH002` / `shell-tree-annotation-selector`: verify annotation selectors resolve to valid config sections.
- `SH003` / `shell-tree-unused-annotation`: report unused annotation labels.

Rule docs:

- `docs/rules/SH001.md`
- `docs/rules/SH002.md`
- `docs/rules/SH003.md`

## Install

```bash
npm install --save-dev github:squirrel289/markdownlint-shell
```

## markdownlint-cli usage

```bash
markdownlint --config .markdownlint.json --rules markdownlint-shell .
```

## Config

```json
{
  "default": false,
  "SH001": {
    "include_backlog": false
  },
  "SH002": {
    "include_backlog": false
  },
  "SH003": {
    "include_backlog": false
  }
}
```
