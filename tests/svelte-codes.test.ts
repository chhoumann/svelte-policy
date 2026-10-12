import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { replacements } from "../src/svelte-codes";

const svelteSource = (path: string) =>
  readFileSync(new URL(`../node_modules/svelte/src/${path}`, import.meta.url), "utf8");

describe("lists copied from the installed Svelte", () => {
  it("has Svelte's replacements for Svelte 4 codes", () => {
    const source = svelteSource("compiler/utils/extract_svelte_ignore.js");
    const [, body = ""] = /const replacements = \{([^}]*)\}/.exec(source) ?? [];
    const entries = [...body.matchAll(/'([^']+)': '([^']+)'/g)].map(([, from, to]) => [from, to]);
    expect([...replacements]).toEqual(entries);
  });
});
