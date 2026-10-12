import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esquery from "esquery";
import { describe, expect, it, vi } from "vite-plus/test";
import { checkSvelte, type Config } from "../src/index";
import type { RuleId } from "../src/rules";

/** One component per rule that breaks only that rule. */
const violations: Record<Exclude<RuleId, "restricted-syntax">, string> = {
  "no-svelte-internal": '<script>import { effect } from "svelte/internal/client";</script>',
  "no-svelte-store": '<script>import { writable } from "svelte/store";</script>',
  "runes-only": "<script>let n = 1; $: n = n + 1;</script>",
  "no-inspect": "<script>let n = $state(1); $inspect(n);</script>",
  "no-at-html-tags": "{@html html}",
  "no-at-debug-tags": "{@debug value}",
  "require-each-key": "{#each items as item}<p>{item}</p>{/each}",
  "valid-each-key": "{#each items as item (42)}<p>{item}</p>{/each}",
  "no-dupe-else-if-blocks": "{#if a}A{:else if a}B{/if}",
  "no-object-in-text-mustaches": "<p>{{name: 'value'}}</p>",
  "no-raw-special-elements": "<window />",
  "no-dupe-directives": "<div use:action use:action></div>",
  "no-dom-manipulating":
    "<script>let el; function clear() { el.remove(); }</script><div bind:this={el}></div>",
  "no-not-function-handler": "<button onclick={42}>X</button>",
  "no-console": "<button onclick={() => console.log('X')}>X</button>",
  "no-new-func": "<button onclick={() => new Function('return 1')()}>X</button>",
  "no-implied-eval": "<button onclick={() => setTimeout('alert(1)', 10)}>X</button>",
  "no-unused-svelte-ignore": "<!-- svelte-ignore a11y_autofocus --><p>X</p>",
};

/** The documented defaults: the store ban and the runes requirement are opt-in. */
const defaults: Record<keyof typeof violations, "off" | "warning" | "error"> = {
  "no-svelte-internal": "error",
  "no-svelte-store": "off",
  "runes-only": "off",
  "no-inspect": "warning",
  "no-at-html-tags": "error",
  "no-at-debug-tags": "warning",
  "require-each-key": "error",
  "valid-each-key": "error",
  "no-dupe-else-if-blocks": "error",
  "no-object-in-text-mustaches": "error",
  "no-raw-special-elements": "error",
  "no-dupe-directives": "error",
  "no-dom-manipulating": "error",
  "no-not-function-handler": "error",
  "no-console": "error",
  "no-new-func": "error",
  "no-implied-eval": "error",
  "no-unused-svelte-ignore": "error",
};

const rulesAndSeverities = (source: string, config: Config) =>
  checkSvelte(source, "Component.svelte", config).map(({ rule, severity }) => [rule, severity]);

describe("rules", () => {
  it.each(Object.entries(violations))("%s has its documented default", (rule, source) => {
    const severity = defaults[rule as keyof typeof violations];
    expect(rulesAndSeverities(source, {})).toEqual(severity === "off" ? [] : [[rule, severity]]);
  });

  it.each(Object.entries(violations))("%s can be set to off, warn, or error", (rule, source) => {
    expect(rulesAndSeverities(source, { rules: { [rule]: "off" } })).toEqual([]);
    expect(rulesAndSeverities(source, { rules: { [rule]: "warn" } })).toEqual([[rule, "warning"]]);
    expect(rulesAndSeverities(source, { rules: { [rule]: "error" } })).toEqual([[rule, "error"]]);
  });

  it("no-console names console.warn and console.error by default", () => {
    expect(checkSvelte(violations["no-console"], "Component.svelte", {})).toMatchObject([
      { message: "Use console.warn or console.error instead of other console methods." },
    ]);
  });

  it("no-console takes the consumer's message with its severity", () => {
    const config: Config = {
      rules: { "no-console": { severity: "warn", message: "Use the logger." } },
    };
    expect(checkSvelte(violations["no-console"], "Component.svelte", config)).toMatchObject([
      { rule: "no-console", severity: "warning", message: "Use the logger." },
    ]);
  });
});

describe("restrictedSyntax", () => {
  const restricted: Config = {
    restrictedSyntax: [
      { selector: 'CallExpression[callee.name="track"]', message: "Use the analytics helper." },
      { selector: 'CallExpression[callee.name="track"]', message: "Tracking needs consent." },
      { selector: "DebuggerStatement", message: "Remove debugger statements." },
    ],
  };
  const source = "<script>track(); debugger;</script><button onclick={() => track()}>X</button>";

  it("reports each selector's message under restricted-syntax, in scripts and templates", () => {
    expect(
      checkSvelte(source, "Component.svelte", restricted).map(({ line, column, rule, message }) => [
        line,
        column,
        rule,
        message,
      ]),
    ).toEqual([
      [1, 9, "restricted-syntax", "Use the analytics helper."],
      [1, 9, "restricted-syntax", "Tracking needs consent."],
      [1, 18, "restricted-syntax", "Remove debugger statements."],
      [1, 59, "restricted-syntax", "Use the analytics helper."],
      [1, 59, "restricted-syntax", "Tracking needs consent."],
    ]);
  });

  it("parses each selector once per call with a config passed in", () => {
    const parse = vi.spyOn(esquery, "parse");
    checkSvelte(source, "Component.svelte", restricted);
    expect(parse.mock.calls.map(([selector]) => selector)).toEqual(
      restricted.restrictedSyntax?.map(({ selector }) => selector),
    );
    parse.mockRestore();
  });

  it("follows the restricted-syntax severity", () => {
    const off = checkSvelte(source, "Component.svelte", {
      ...restricted,
      rules: { "restricted-syntax": "off" },
    });
    const warn = checkSvelte(source, "Component.svelte", {
      ...restricted,
      rules: { "restricted-syntax": "warn" },
    });
    expect(off).toEqual([]);
    expect(new Set(warn.map(({ severity }) => severity))).toEqual(new Set(["warning"]));
  });
});

describe("config validation", () => {
  const check = (config: unknown) => () =>
    checkSvelte("<p>X</p>", "Component.svelte", config as Config);

  it.each([
    ["a non-object config", [], "svelte-policy config: expected a JSON object."],
    [
      "an unknown key",
      { selectors: [] },
      'svelte-policy config: unknown key "selectors"; expected "rules" or "restrictedSyntax".',
    ],
    ["non-object rules", { rules: [] }, 'svelte-policy config: "rules" must be an object.'],
    [
      "an unknown rule",
      { rules: { "no-foo": "error" } },
      'svelte-policy config: unknown rule "no-foo".',
    ],
    [
      "an invalid severity",
      { rules: { "no-at-html-tags": "on" } },
      'svelte-policy config: rules["no-at-html-tags"] must be "off", "warn", or "error".',
    ],
    [
      "an options object on a rule without options",
      { rules: { "no-at-html-tags": { severity: "error", message: "No." } } },
      'svelte-policy config: rules["no-at-html-tags"] must be "off", "warn", or "error".',
    ],
    [
      "a no-console object without a message",
      { rules: { "no-console": { severity: "error" } } },
      'svelte-policy config: rules["no-console"] must be "off", "warn", "error", or { "severity", "message" }.',
    ],
    [
      "a no-console object with an empty message",
      { rules: { "no-console": { severity: "error", message: " " } } },
      'svelte-policy config: rules["no-console"] must be "off", "warn", "error", or { "severity", "message" }.',
    ],
    [
      "a no-console object with an invalid severity",
      { rules: { "no-console": { severity: "on", message: "Use the logger." } } },
      'svelte-policy config: rules["no-console"] must be "off", "warn", "error", or { "severity", "message" }.',
    ],
    [
      "non-array restrictedSyntax",
      { restrictedSyntax: {} },
      'svelte-policy config: "restrictedSyntax" must be an array.',
    ],
    [
      "a restrictedSyntax entry without a message",
      { restrictedSyntax: [{ selector: "DebuggerStatement" }] },
      'svelte-policy config: restrictedSyntax[0] must be { "selector", "message" } with non-empty strings.',
    ],
    [
      "a restrictedSyntax entry with an extra key",
      { restrictedSyntax: [{ selector: "DebuggerStatement", message: "No.", severity: "warn" }] },
      'svelte-policy config: restrictedSyntax[0] must be { "selector", "message" } with non-empty strings.',
    ],
  ])("rejects %s", (_name, config, message) => {
    expect(check(config)).toThrow(new Error(message));
  });

  it("rejects a selector esquery cannot parse, even when restricted-syntax is off", () => {
    expect(
      check({
        rules: { "restricted-syntax": "off" },
        restrictedSyntax: [{ selector: "CallExpression[", message: "No." }],
      }),
    ).toThrow(/^svelte-policy config: restrictedSyntax\[0\]\.selector does not parse: Expected /);
  });
});

describe("svelte-policy.json discovery", () => {
  const html = violations["no-at-html-tags"];
  const consoleLog = violations["no-console"];
  const project = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "svelte-policy-discovery-"));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  };
  const severities = (source: string, filename: string) =>
    checkSvelte(source, filename).map(({ rule, severity }) => [rule, severity]);

  it("uses the nearest file above the component, without merging", () => {
    const root = project({
      "svelte-policy.json": JSON.stringify({ rules: { "no-console": "off" } }),
      "app/svelte-policy.json": JSON.stringify({ rules: { "no-at-html-tags": "warn" } }),
    });
    expect(severities(html, join(root, "app/ui/Component.svelte"))).toEqual([
      ["no-at-html-tags", "warning"],
    ]);
    expect(severities(consoleLog, join(root, "app/ui/Component.svelte"))).toEqual([
      ["no-console", "error"],
    ]);
    expect(severities(consoleLog, join(root, "Component.svelte"))).toEqual([]);
  });

  it("uses the defaults when no file exists", () => {
    const root = project({});
    expect(severities(html, join(root, "Component.svelte"))).toEqual([
      ["no-at-html-tags", "error"],
    ]);
  });

  it("skips discovery when a config is passed", () => {
    const root = project({
      "svelte-policy.json": JSON.stringify({ rules: { "no-at-html-tags": "off" } }),
    });
    expect(checkSvelte(html, join(root, "Component.svelte"), {})).toMatchObject([
      { rule: "no-at-html-tags" },
    ]);
  });

  it("names the file when it is not valid JSON or not a valid config", () => {
    const broken = project({ "svelte-policy.json": "{ rules: }" });
    expect(() => checkSvelte(html, join(broken, "Component.svelte"))).toThrow(
      new RegExp(`^${join(broken, "svelte-policy.json")}: `),
    );
    const invalid = project({
      "svelte-policy.json": JSON.stringify({ rules: { "no-foo": "off" } }),
    });
    expect(() => checkSvelte(html, join(invalid, "Component.svelte"))).toThrow(
      new Error(`${join(invalid, "svelte-policy.json")}: unknown rule "no-foo".`),
    );
  });
});
