import { describe, expect, it } from "vite-plus/test";
import { checkSvelte } from "../src/index";

const rulesOf = (source: string) =>
  checkSvelte(source, "Component.svelte", {}).map(({ rule }) => rule);
const check = (source: string) =>
  checkSvelte(source, "Component.svelte", {}).map(({ line, column, rule, message }) => ({
    line,
    column,
    rule,
    message,
  }));
const unused = (code: string, column = 1, line = 1) => ({
  line,
  column,
  rule: "no-unused-svelte-ignore",
  message: `Remove the unused svelte-ignore for ${code}.`,
});

describe("analysis", () => {
  it("compares else-if literals by type and value", () => {
    expect(rulesOf("{#if s === 'ready'}A{:else if s === \"ready\"}B{/if}")).toEqual([
      "no-dupe-else-if-blocks",
    ]);
    expect(rulesOf("{#if v === 0x1n}A{:else if v === 1n}B{/if}")).toEqual([
      "no-dupe-else-if-blocks",
    ]);
    expect(rulesOf("{#if v === 1n}A{:else if v === '1'}B{/if}")).toEqual([]);
    expect(rulesOf("{#if v === 1}A{:else if v === '1'}B{/if}")).toEqual([]);
  });

  it("skips an else-if chain whose test has an unstable part", () => {
    expect(rulesOf("{#if a}A{:else if a && next()}B{/if}")).toEqual([]);
  });

  it("compares directive expressions by structure, not spelling", () => {
    expect(
      rulesOf('<button on:click={() => handle("a  b")} on:click={() => handle("a b")}>X</button>'),
    ).toEqual([]);
    expect(
      rulesOf("<button on:click={() => handle(0x1n)} on:click={() => handle(1n)}>X</button>"),
    ).toEqual(["no-dupe-directives"]);
    expect(
      rulesOf("<button on:click={() => handle('x')} on:click={() => handle(\"x\")}>X</button>"),
    ).toEqual(["no-dupe-directives"]);
  });

  it("does not count a name in a type as a reference to the each item", () => {
    expect(
      rulesOf(
        '<script lang="ts">let items: { id: string }[] = [];</script>{#each items as item ((items.length as unknown as typeof item))}<p>X</p>{/each}',
      ),
    ).toEqual(["valid-each-key"]);
  });
});

describe("fixes to QuickAdd #2224", () => {
  it("reads dashed and comma-separated svelte-ignore codes as whole codes", () => {
    expect(
      check(
        '<!-- svelte-ignore a11y-autofocus, a11y-positive-tabindex --><input autofocus tabindex="1" />',
      ),
    ).toEqual([]);
  });

  it("recognizes a svelte-ignore followed by a newline", () => {
    expect(check("<!-- svelte-ignore\n  a11y_autofocus --><p>X</p>")).toEqual([
      unused("a11y_autofocus"),
    ]);
  });

  it("checks svelte-ignore comments in legacy components", () => {
    expect(
      check("<script>export let x;</script><!-- svelte-ignore a11y_autofocus --><p>{x}</p>"),
    ).toEqual([unused("a11y_autofocus", 31)]);
  });

  it("reports a svelte-ignore without a code", () => {
    expect(
      check("<!-- svelte-ignore --><p>X</p>\n<!--svelte-ignore (no reason) --><p>Y</p>"),
    ).toEqual([
      {
        line: 1,
        column: 1,
        rule: "no-unused-svelte-ignore",
        message: "Name the warning code this svelte-ignore suppresses.",
      },
      {
        line: 2,
        column: 1,
        rule: "no-unused-svelte-ignore",
        message: "Name the warning code this svelte-ignore suppresses.",
      },
    ]);
  });
});
