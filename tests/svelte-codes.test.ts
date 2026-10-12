import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { replacements, runtimeWarnings } from "../src/svelte-codes";

const svelteSource = new URL("../node_modules/svelte/src/", import.meta.url);

describe("lists copied from the installed Svelte", () => {
  it("has Svelte's replacements for Svelte 4 codes", () => {
    const source = readFileSync(
      new URL("compiler/utils/extract_svelte_ignore.js", svelteSource),
      "utf8",
    );
    const [, body = ""] = /const replacements = \{([^}]*)\}/.exec(source) ?? [];
    const entries = [...body.matchAll(/'([^']+)': '([^']+)'/g)].map(([, from, to]) => [from, to]);
    expect([...replacements]).toEqual(entries);
  });

  it("has Svelte's runtime-only warning codes", async () => {
    const { IGNORABLE_RUNTIME_WARNINGS }: { IGNORABLE_RUNTIME_WARNINGS: unknown } = await import(
      new URL("constants.js", svelteSource).href
    );
    expect([...runtimeWarnings]).toEqual(IGNORABLE_RUNTIME_WARNINGS);
  });
});
