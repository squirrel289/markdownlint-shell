import { expect, test } from "vitest";
import { checkboxStateRule } from "../src/rules/checkbox-state.mts";
import type { MarkdownlintRuleError } from "../src/types.mts";

const completionConditions = [
  {
    states: {
      status: ["ready-for-review", "closed"],
    },
    checked: true,
  },
  {
    states: {
      status_reason: ["completed"],
    },
    checked: true,
  },
];

function runRule(params: {
  lines: string[];
  frontMatterLines: string[];
  config?: Record<string, unknown>;
}): MarkdownlintRuleError[] {
  const errors: MarkdownlintRuleError[] = [];
  checkboxStateRule.function(
    {
      lines: params.lines,
      frontMatterLines: params.frontMatterLines,
      config: params.config || {},
    },
    (error) => errors.push(error),
  );
  return errors;
}

function makeDocument(
  frontMatterEntries: string[],
  bodyLines: string[],
): {
  lines: string[];
  frontMatterLines: string[];
} {
  const frontMatterLines = ["---", ...frontMatterEntries, "---"];
  return {
    frontMatterLines,
    lines: bodyLines,
  };
}

test("reports unchecked task for matched checked true condition", () => {
  const doc = makeDocument(
    ["status: ready-for-review"],
    ["- [ ] finalize docs"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.lineNumber).toBe(1);
  expect(String(errors[0]?.detail || "")).toContain("must be checked");
});

test("supports alternate state keys via config", () => {
  const doc = makeDocument(
    ["status_reason: completed"],
    ["1. [ ] finish changelog"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.lineNumber).toBe(1);
});

test("applies matched checked false condition", () => {
  const doc = makeDocument(
    ["status: proposed", "lifecycle: draft"],
    ["- [x] should not be checked"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            lifecycle: "draft",
            status: "proposed",
          },
          checked: false,
        },
      ],
    },
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.lineNumber).toBe(1);
  expect(String(errors[0]?.detail || "")).toContain("must be unchecked");
});

test("does not report for checked false condition when tasks are unchecked", () => {
  const doc = makeDocument(
    ["status: proposed", "lifecycle: draft"],
    ["- [ ] expected for draft proposal"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            lifecycle: "draft",
            status: "proposed",
          },
          checked: false,
        },
      ],
    },
  });

  expect(errors).toHaveLength(0);
});

test("does not report when all task checkboxes are checked for final status", () => {
  const doc = makeDocument(
    ["status: ready-for-review"],
    ["- [x] finalize docs", "- [X] add tests"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(0);
});

test("does not report task lines inside fences when scan_fenced_code is false", () => {
  const doc = makeDocument(
    ["status_reason: completed"],
    [
      "```markdown",
      "- [ ] example task inside code block",
      "```",
      "- [x] actual done task",
    ],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(0);
});

test("reports task lines inside fences when scan_fenced_code is true", () => {
  const doc = makeDocument(
    ["status_reason: completed"],
    ["```markdown", "- [ ] example task inside code block", "```"],
  );
  const errors = runRule({
    ...doc,
    config: {
      scan_fenced_code: true,
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.lineNumber).toBe(2);
});

test("does not report when no conditions are configured", () => {
  const doc = makeDocument(
    ["status: ready-for-review"],
    ["- [ ] unchecked allowed without configured conditions"],
  );
  const errors = runRule(doc);

  expect(errors).toHaveLength(0);
});

test("does not report when configured conditions do not match", () => {
  const doc = makeDocument(
    ["status: proposed"],
    ["- [ ] allowed while in progress"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: completionConditions,
    },
  });

  expect(errors).toHaveLength(0);
});

test("matches conditions with AND semantics across multiple fields", () => {
  const doc = makeDocument(
    ["status: ready-for-review", "state_reason: success"],
    ["- [ ] must be checked once both fields match"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            status: ["ready-for-review", "closed"],
            state_reason: ["completed", "success"],
          },
          checked: true,
        },
      ],
    },
  });

  expect(errors).toHaveLength(1);
});

test("skips AND condition when one field does not match", () => {
  const doc = makeDocument(
    ["status: ready-for-review", "state_reason: pending"],
    ["- [ ] unchecked should not be reported"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            status: ["ready-for-review", "closed"],
            state_reason: ["completed", "success"],
          },
          checked: true,
        },
      ],
    },
  });

  expect(errors).toHaveLength(0);
});

test("uses first matching condition in order", () => {
  const doc = makeDocument(["status: closed"], ["- [x] done"]);
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            status: "closed",
          },
          checked: false,
        },
        {
          states: {
            status: "closed",
          },
          checked: true,
        },
      ],
    },
  });

  expect(errors).toHaveLength(1);
  expect(String(errors[0]?.detail || "")).toContain("must be unchecked");
});

test("matches nested frontmatter values via dot-path keys", () => {
  const doc = makeDocument(
    [
      "status: completed",
      "compliance:",
      "  profiles:",
      "    fisma:",
      "      certification: true",
    ],
    ["- [ ] this must be checked"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            "compliance.profiles.fisma.certification": true,
            status: "completed",
          },
          checked: true,
        },
      ],
    },
  });

  expect(errors).toHaveLength(1);
  expect(errors[0]?.lineNumber).toBe(1);
});

test("does not match dot-path condition when nested value differs", () => {
  const doc = makeDocument(
    [
      "status: completed",
      "compliance:",
      "  profiles:",
      "    fisma:",
      "      certification: false",
    ],
    ["- [ ] allowed because condition does not match"],
  );
  const errors = runRule({
    ...doc,
    config: {
      conditions: [
        {
          states: {
            "compliance.profiles.fisma.certification": true,
            status: "completed",
          },
          checked: true,
        },
      ],
    },
  });

  expect(errors).toHaveLength(0);
});
