# markdownlint-shell

Custom `markdownlint` rules for shell tree code fences and work-item consistency checks.

## Rule Set

- `SH001` / `shell-tree-sync`: verify shell tree blocks are synchronized with filesystem output.
- `SH002` / `shell-tree-annotation-selector`: verify annotation selectors resolve to valid config sections.
- `SH003` / `shell-tree-unused-annotation`: report unused annotation labels.
- `SH004` / `checkbox-state`: enforce checkbox state based on frontmatter conditions.

Rule docs:

- `docs/rules/SH001.md`
- `docs/rules/SH002.md`
- `docs/rules/SH003.md`
- `docs/rules/SH004.md`

## Install

```bash
npm install --save-dev markdownlint-shell@next
```

## markdownlint-cli usage

```bash
markdownlint --config .markdownlint.json --rules markdownlint-shell .
```

## Config

`SH004` uses ordered `conditions` (first match wins). Put separate entries to express OR logic.

```json
{
  "default": false,
  "SH001": {
    "annotations_file": ".bash-tree.yaml"
  },
  "SH002": true,
  "SH003": true,
  "SH004": {
    "scan_fenced_code": false,
    "conditions": [
      {
        "states": {
          "status": ["ready-for-review", "closed"],
          "state_reason": ["completed", "success"]
        },
        "checked": true
      },
      {
        "states": {
          "lifecycle": "draft",
          "status": "proposed"
        },
        "checked": false
      }
    ]
  }
}
```
