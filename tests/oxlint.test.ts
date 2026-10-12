import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { checkSvelte } from "../src/index";
import { contexts, forbidden, permitted, quickadd } from "./quickadd";

interface OxlintDiagnostic {
  readonly filename: string;
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

const root = fileURLToPath(new URL("..", import.meta.url));

/** A consumer workspace that installs this package and lints from its src directory. */
function lint(files: Record<string, string>): {
  status: number | null;
  diagnostics: OxlintDiagnostic[];
} {
  const workspace = mkdtempSync(join(tmpdir(), "svelte-policy-oxlint-"));
  mkdirSync(join(workspace, "node_modules"));
  symlinkSync(root, join(workspace, "node_modules/svelte-policy"), "dir");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(workspace, path, ".."), { recursive: true });
    writeFileSync(join(workspace, path), content);
  }
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/oxlint/bin/oxlint"),
      "-c",
      "../.oxlintrc.json",
      "--format",
      "json",
      ".",
    ],
    { cwd: join(workspace, "src"), encoding: "utf8", timeout: 30_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  const output: { diagnostics: OxlintDiagnostic[] } = JSON.parse(result.stdout);
  return { status: result.status, diagnostics: output.diagnostics };
}

const oxlintrc = {
  categories: { correctness: "off" },
  jsPlugins: ["svelte-policy/oxlint"],
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        "svelte-policy/restricted-syntax": "error",
        "svelte-policy/no-svelte-internal": "error",
      },
    },
    { files: ["src/**/*.test.ts"], rules: { "svelte-policy/restricted-syntax": "off" } },
    {
      files: ["**/*.svelte.ts"],
      rules: {
        "svelte-policy/no-svelte-store": "error",
        "svelte-policy/runes-only": "error",
        "svelte-policy/no-inspect": "warn",
      },
    },
  ],
};

/** Rows as sortable lines, for comparing diagnostics whose order oxlint does not fix. */
const lines = (rows: (string | undefined)[][]) => rows.map((row) => row.join(" | ")).toSorted();

const checkerMessage = (source: string, rule: string) =>
  checkSvelte(source, "Component.svelte", quickadd).find((diagnostic) => diagnostic.rule === rule)
    ?.message;

it("runs every selector rule from a subdirectory with the checker's messages", () => {
  const probes = Object.entries({ ...forbidden, ...permitted }).map(([name, statement]) => [
    `src/${name}.ts`,
    `export function probe(el: HTMLElement): void { ${statement} }`,
  ]);
  const { status, diagnostics } = lint({
    ".oxlintrc.json": JSON.stringify(oxlintrc),
    "svelte-policy.json": JSON.stringify(quickadd),
    ...Object.fromEntries(probes),
    "src/excluded.test.ts": 'document.createElement("div");',
    "src/internal.ts": 'export { effect } from "svelte/internal/client";',
    "src/store.ts": 'export { writable } from "svelte/store";',
    "src/state.svelte.ts": 'export { writable } from "svelte/store";',
    "src/legacy.svelte.ts": 'import { createEventDispatcher } from "svelte";',
    "src/debug.svelte.ts": "const value = 1; $inspect(value);",
  });

  expect(status).toBe(1);
  const found = (code: string) =>
    diagnostics
      .filter((diagnostic) => diagnostic.code === `svelte-policy(${code})`)
      .map(({ filename, message, severity }) => [filename, message, severity]);
  expect(lines(found("restricted-syntax"))).toEqual(
    lines(
      Object.entries(forbidden).map(([name, statement]) => [
        `${name}.ts`,
        checkerMessage(contexts.template(statement), "restricted-syntax"),
        "error",
      ]),
    ),
  );
  expect(found("no-svelte-internal")).toEqual([
    [
      "internal.ts",
      checkerMessage(
        '<script>export { effect } from "svelte/internal/client";</script>',
        "no-svelte-internal",
      ),
      "error",
    ],
  ]);
  expect(found("no-svelte-store")).toEqual([
    [
      "state.svelte.ts",
      checkerMessage(
        '<script>export { writable } from "svelte/store";</script>',
        "no-svelte-store",
      ),
      "error",
    ],
  ]);
  expect(found("runes-only")).toEqual([
    [
      "legacy.svelte.ts",
      checkerMessage(
        '<script>import { createEventDispatcher } from "svelte";</script>',
        "runes-only",
      ),
      "error",
    ],
  ]);
  expect(found("no-inspect")).toEqual([
    [
      "debug.svelte.ts",
      checkerMessage("<script>$inspect(value);</script>", "no-inspect"),
      "warning",
    ],
  ]);
  expect(diagnostics).toHaveLength(14);
});

it("reads restricted selectors from the svelte-policy.json nearest each file", () => {
  const { diagnostics } = lint({
    ".oxlintrc.json": JSON.stringify(oxlintrc),
    "svelte-policy.json": JSON.stringify({
      restrictedSyntax: [{ selector: "DebuggerStatement", message: "Remove debugger statements." }],
    }),
    "src/app.ts": "debugger;",
    "src/feature/svelte-policy.json": JSON.stringify({
      restrictedSyntax: [
        { selector: 'CallExpression[callee.name="track"]', message: "Use the analytics helper." },
        { selector: 'CallExpression[callee.name="track"]', message: "Tracking needs consent." },
      ],
    }),
    "src/feature/view.ts": "debugger; track();",
  });
  expect(
    lines(diagnostics.map(({ filename, code, message }) => [filename, code, message])),
  ).toEqual([
    "app.ts | svelte-policy(restricted-syntax) | Remove debugger statements.",
    "feature/view.ts | svelte-policy(restricted-syntax) | Tracking needs consent.",
    "feature/view.ts | svelte-policy(restricted-syntax) | Use the analytics helper.",
  ]);
});
