import { describe, expect, it } from "vite-plus/test";
import { checkSvelte } from "../src/index";

const rulesOf = (source: string) =>
  checkSvelte(source, "Component.svelte", {}).map(({ rule }) => rule);

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
