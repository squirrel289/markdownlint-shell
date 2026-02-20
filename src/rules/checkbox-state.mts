import type {
  CheckboxStateCondition,
  MarkdownlintRule,
  MarkdownlintRuleParams,
  WorkItemRuleConfig,
} from "../types.mjs";

type FrontMatterMap = Record<string, string>;
type NormalizedCondition = {
  states: Record<string, string[]>;
  checked: boolean;
};

const TASK_CHECKBOX_PATTERN =
  /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[( |x|X)\](?:\s+|$)/;

function parseScalar(value: string): string {
  let normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  } else {
    normalized = normalized.replace(/\s+#.*$/, "").trim();
  }

  return normalized.trim();
}

function parseFrontMatter(frontMatterLines: string[]): FrontMatterMap {
  const values: FrontMatterMap = {};

  for (const rawLine of frontMatterLines) {
    const trimmed = rawLine.trim();
    if (
      !trimmed ||
      trimmed === "---" ||
      trimmed === "..." ||
      trimmed.startsWith("#")
    ) {
      continue;
    }

    const match = rawLine.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    values[match[1].toLowerCase()] = parseScalar(match[2]);
  }

  return values;
}

function normalizeConditionValues(value: string | string[]): Set<string> {
  const valuesArray = Array.isArray(value) ? value : [value];
  return new Set(
    valuesArray
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase(),
      )
      .filter((item) => item.length > 0),
  );
}

function normalizeConditions(
  conditions: CheckboxStateCondition[] | undefined,
): NormalizedCondition[] {
  const source = Array.isArray(conditions) ? conditions : [];

  return source
    .map((condition) => {
      if (typeof condition.checked !== "boolean") {
        return null;
      }

      const normalizedStates: Record<string, string[]> = {};
      for (const [key, rawValue] of Object.entries(condition.states || {})) {
        const normalizedKey = String(key || "")
          .trim()
          .toLowerCase();
        if (!normalizedKey) {
          continue;
        }

        const normalizedValues = [...normalizeConditionValues(rawValue)];
        if (normalizedValues.length === 0) {
          continue;
        }
        normalizedStates[normalizedKey] = normalizedValues;
      }

      return {
        states: normalizedStates,
        checked: condition.checked,
      };
    })
    .filter(
      (condition): condition is NormalizedCondition =>
        condition !== null && Object.keys(condition.states).length > 0,
    );
}

function getExpectedCheckboxState(
  frontMatter: FrontMatterMap,
  config: WorkItemRuleConfig,
): boolean | null {
  const normalizedConditions = normalizeConditions(config.conditions);

  for (const condition of normalizedConditions) {
    const matchedAll = Object.entries(condition.states).every(
      ([field, expectedValues]) => {
        const frontMatterValue = String(frontMatter[field] || "")
          .trim()
          .toLowerCase();
        if (!frontMatterValue) {
          return false;
        }

        return normalizeConditionValues(expectedValues).has(frontMatterValue);
      },
    );

    if (matchedAll) {
      return condition.checked;
    }
  }

  return null;
}

function isFenceDelimiter(
  line: string,
): { marker: "`" | "~"; length: number } | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }

  const sequence = match[1];
  const marker = sequence.startsWith("`") ? "`" : "~";
  return {
    marker,
    length: sequence.length,
  };
}

function getCheckboxState(line: string): boolean | null {
  const match = line.match(TASK_CHECKBOX_PATTERN);
  if (!match) {
    return null;
  }

  const marker = match[1] || " ";
  return marker !== " ";
}

function getCheckboxContext(line: string): string {
  const match = line.match(
    /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[(?: |x|X)\](?:\s+|$)/,
  );
  if (!match) {
    return line.trim();
  }
  return `${match[1]}[...]`.trimEnd();
}

export const checkboxStateRule: MarkdownlintRule = {
  names: ["SH004", "checkbox-state"],
  description: "Checkbox states must match configured frontmatter conditions",
  information: new URL(
    "https://github.com/squirrel289/markdownlint-shell/blob/main/docs/rules/SH004.md",
  ),
  tags: ["tasks", "front-matter", "state"],
  parser: "none",
  function: (params: MarkdownlintRuleParams, onError) => {
    const config = (params.config || {}) as WorkItemRuleConfig;

    const lines = params.lines || [];
    const frontMatterLines = params.frontMatterLines || [];

    if (!lines.length || !frontMatterLines.length) {
      return;
    }

    const frontMatter = parseFrontMatter(frontMatterLines);
    const expectedChecked = getExpectedCheckboxState(frontMatter, config);
    if (expectedChecked === null) {
      return;
    }

    const scanFencedCode = config.scan_fenced_code === true;
    let activeFence: { marker: "`" | "~"; length: number } | null = null;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || "";
      const fence = isFenceDelimiter(line);
      if (fence) {
        if (!activeFence) {
          activeFence = fence;
        } else if (
          fence.marker === activeFence.marker &&
          fence.length >= activeFence.length
        ) {
          activeFence = null;
        }
        continue;
      }

      if (activeFence && !scanFencedCode) {
        continue;
      }

      const checkboxChecked = getCheckboxState(line);
      if (checkboxChecked === null || checkboxChecked === expectedChecked) {
        continue;
      }

      const expectedLabel = expectedChecked ? "checked" : "unchecked";
      const bracketColumn = Math.max(1, line.indexOf("[") + 1);
      onError({
        lineNumber: index + 1,
        detail: `Checkbox must be ${expectedLabel} for the matching document state.`,
        context: getCheckboxContext(line),
        range: [bracketColumn, 3],
      });
    }
  },
};
