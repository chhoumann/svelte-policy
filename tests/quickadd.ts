import { readFileSync } from "node:fs";
import type { Config } from "../src/index";

// QuickAdd's config and syntax-guard fixtures, copied verbatim from QuickAdd's
// tests/tooling/sveltePolicy.test.ts at c7ec79f.
export const quickadd: Config = JSON.parse(
  readFileSync(new URL("fixtures/quickadd.json", import.meta.url), "utf8"),
);

export const forbidden = {
  "create-element": 'document.createElement("div");',
  "create-fragment": "document.createDocumentFragment();",
  "create-div": 'createEl("div");',
  "cross-window": "void (el instanceof HTMLElement);",
  "slider-tooltip": "el.setDynamicTooltip();",
  lookbehind: "void /(?<=a)b/;",
  "style-property": 'el.style.color = "red";',
  "style-set-property": 'el.style.setProperty("color", "red");',
  "style-attribute": 'el.setAttribute("style", "color: red");',
  "style-helper": 'el.setCssStyles({ "color": "red" });',
};
export const permitted = {
  "valid-helper": "el.createDiv();",
  "valid-window": "el.instanceOf(HTMLElement);",
  "valid-css-variable": 'el.setCssProps({ "--color": "red" });',
  "valid-dynamic-style": 'el.style.color = el.dataset.color ?? "";',
  "valid-forward-regex": "void /a(?=b)/;",
};
export const contexts = {
  script: (statement: string) =>
    `<script lang="ts">function probe(el: HTMLElement): void { ${statement} }</script>`,
  template: (statement: string) =>
    `<button onclick={(event) => { const el = event.currentTarget; ${statement} }}>Text</button>`,
};
