import { describe, expect, it } from "vite-plus/test";
import { checkSvelte } from "../src/index";
import { contexts, forbidden, permitted, quickadd } from "./quickadd";

// Every fixture comes from QuickAdd's tests/tooling/sveltePolicy.test.ts at c7ec79f and runs
// with QuickAdd's config. Four import fixtures now report under their own rule ids instead of
// restricted-syntax: no-svelte-store, no-svelte-internal (twice), and runes-only.
const guards = quickadd.restrictedSyntax ?? [];

function checkSvelteAsQuickAdd(source: string, filename = "Component.svelte") {
  return checkSvelte(source, filename, quickadd);
}

describe("custom syntax guards", () => {
  for (const [context, component] of Object.entries(contexts)) {
    it.each(
      Object.entries(forbidden).map(([name, statement], index) => [
        name,
        statement,
        guards[index]?.message,
      ]),
    )(`rejects %s in a Svelte ${context}`, (_name, statement, message) => {
      const diagnostics = checkSvelteAsQuickAdd(component(statement));
      expect(diagnostics.filter((item) => item.rule === "restricted-syntax")).toEqual([
        expect.objectContaining({ message }),
      ]);
    });
    it.each(Object.entries(permitted))(`accepts %s in a Svelte ${context}`, (_name, statement) => {
      expect(checkSvelteAsQuickAdd(component(statement))).toEqual([]);
    });
  }
});

describe("Svelte template policies", () => {
  const invalid = [
    ["no-at-html-tags", "{@html html}"],
    ["require-each-key", "{#each items as item}<p>{item}</p>{/each}"],
    ["valid-each-key", "{#each items as item (42)}<p>{item}</p>{/each}"],
    ["valid-each-key", "{#each items as item (obj.item)}<p>{item}</p>{/each}"],
    ["valid-each-key", "{#each items as item ((item => item)(1))}<p>{item}</p>{/each}"],
    [
      "valid-each-key",
      "{#each items as item ((function item() { return 42; })())}<p>{item}</p>{/each}",
    ],
    [
      "valid-each-key",
      "{#each items as item ((function item() { return item; })())}<p>{item}</p>{/each}",
    ],
    ["valid-each-key", "{#each items as item ((class item {}))}<p>{item}</p>{/each}"],
    [
      "valid-each-key",
      "{#each items as item ((function key() { if (true) { var item = 42; } return item; })())}<p>{item}</p>{/each}",
    ],
    [
      "no-dom-manipulating",
      '<script>let el; function clear() { el.innerHTML = ""; }</script><div bind:this={el}></div>',
    ],
    [
      "no-dom-manipulating",
      "<script>let el; function clear() { el?.replaceChildren(); }</script><div bind:this={el}></div>",
    ],
    [
      "no-dom-manipulating",
      "<script context='module'>let el; function clear() { el.remove(); }</script><div bind:this={el}></div>",
    ],
    ["no-dupe-directives", "<div use:action use:action></div>"],
    ["no-dupe-directives", "<button on:click={handler} on:click={handler}>X</button>"],
    [
      "no-dupe-directives",
      "<button on:click|capture|once={handler} on:click|once|capture={handler}>X</button>",
    ],
    [
      "no-dupe-directives",
      "<button on:click={first || second} on:click={first || second}>X</button>",
    ],
    [
      "no-dupe-directives",
      "<button on:click={() => handle(1n)} on:click={() => handle(1n)}>X</button>",
    ],
    ["no-dupe-else-if-blocks", "{#if a || b}A{:else if b && c}B{/if}"],
    ["no-dupe-else-if-blocks", "{#if a}A{:else if b}B{:else if a || b}C{/if}"],
    ["no-dupe-else-if-blocks", "{#if status === 'ready'}A{:else if status === 'ready'}B{/if}"],
    ["no-dupe-else-if-blocks", "{#if value === 1n}A{:else if value === 1n}B{/if}"],
    ["no-object-in-text-mustaches", "<p>{{name: 'value'}}</p>"],
    ["no-raw-special-elements", "<window />"],
    ["no-at-debug-tags", "{@debug value}"],
    ["no-inspect", "<script>let n = $state(1); $inspect(n);</script>"],
    ["runes-only", "<script>let n = 1; $: n = n + 1;</script>"],
    ["no-svelte-store", '<script>import { writable } from "svelte/store";</script>'],
    ["no-svelte-internal", '<script>import { effect } from "svelte/internal/client";</script>'],
    ["no-svelte-internal", '<script>void import("svelte/internal/client");</script>'],
    [
      "runes-only",
      '<script>import { createEventDispatcher as dispatcher } from "svelte"; const dispatch = dispatcher();</script>',
    ],
    ["no-console", "<button onclick={() => console.log('X')}>X</button>"],
    [
      "no-console",
      "<script context='module'>console.log('X');</script><script>const console = {log() {}};</script>",
    ],
    [
      "no-console",
      "{#await value then console}<p>{console.log('X')}</p>{:catch error}<p>{console.log('X')}</p>{/await}",
    ],
    ["no-console", "{#each console.log('X') as console (console.id)}<p>{console.id}</p>{/each}"],
    [
      "no-console",
      "{#each items as console (console.id)}<p>{console.id}</p>{:else}<p>{console.log('X')}</p>{/each}",
    ],
    [
      "no-console",
      "{#each items as item, console (item.id)}<p>{item.id}</p>{:else}<p>{console.log('X')}</p>{/each}",
    ],
    [
      "no-console",
      "<button onclick={() => { function inner() { var console = {log() {}}; } console.log('X'); }}>X</button>",
    ],
    [
      "no-console",
      "<script>function run(value = console.log('X')) { var console = {log() {}}; }</script>",
    ],
    [
      "no-console",
      "<Component let:console config={console.log('X')}><p>{console.log('X')}</p></Component>",
    ],
    [
      "no-console",
      "<script>class Local { static { var console = {log() {}}; } } console.log('X');</script>",
    ],
    [
      "no-console",
      "<button onclick={() => { switch (console.log('X')) { case 1: const console = {log() {}}; console.log('X'); } }}>X</button>",
    ],
    [
      "no-console",
      "<button onclick={() => { switch (1) { case 1: { const console = {log() {}}; break; } default: console.log('X'); } }}>X</button>",
    ],
    ["no-new-func", "<button onclick={() => new Function('return 1')()}>X</button>"],
    ["no-new-func", "<button onclick={() => Function('return 1')()}>X</button>"],
    ["no-implied-eval", "<button onclick={() => setTimeout('alert(1)', 10)}>X</button>"],
    ["no-implied-eval", "<button onclick={() => window.setInterval('alert(1)', 10)}>X</button>"],
    [
      "no-implied-eval",
      "<button onclick={() => globalThis['setTimeout']('alert(1)', 10)}>X</button>",
    ],
    ["no-implied-eval", "<button onclick={() => self.setTimeout(`alert(1)`, 10)}>X</button>"],
    ["no-implied-eval", "<button onclick={() => global.setTimeout('alert(1)', 10)}>X</button>"],
    ["no-implied-eval", "<button onclick={() => execScript('alert(1)')}>X</button>"],
    ["no-unused-svelte-ignore", "<!-- svelte-ignore a11y_click_events_have_key_events --><p>X</p>"],
    [
      "no-unused-svelte-ignore",
      "<!-- svelte-ignore a11y_no_static_element_interactions --><div></div><div onclick={() => {}}>X</div>",
    ],
  ];
  it.each(invalid)("rejects %s: %s", (rule, source) => {
    expect(checkSvelteAsQuickAdd(source).map((item) => item.rule)).toContain(rule);
  });
  it.each([
    "{#each items as item (item.id)}<p>{item.name}</p>{/each}",
    "{#each items as {id, name} (id)}<p>{name}</p>{/each}",
    "{#each items as item, i (i)}<p>{item}</p>{/each}",
    "{#each items as item ((function key() { return item.id; })())}<p>{item}</p>{/each}",
    "{#each items as item ((function key() { function inner() { var item = 42; } return item.id; })())}<p>{item}</p>{/each}",
    "{#if a}A{:else if b}B{/if}",
    "{#if a}{#if a}A{/if}{/if}",
    "{#if next()}A{:else if next()}B{/if}",
    "{#if a && next()}A{:else if a && next()}B{/if}",
    "{#if object.ready}A{:else if object.ready}B{/if}",
    "{#if i++}A{:else if i++}B{/if}",
    "{#if (a = next())}A{:else if (a = next())}B{/if}",
    "{#if a < b}A{:else if a < b}B{/if}",
    "{#if a}A{:else if next()}B{:else if a}C{/if}",
    "<Component config={{name: 'value'}} />",
    "<button on:click|capture={handler} on:click={handler}>X</button>",
    "<button on:click={first || second} on:click={second || first}>X</button>",
    "<button on:click={first && second} on:click={second && first}>X</button>",
    "<div use:action={first || second} use:action={second || first}></div>",
    "<button on:click={() => handle(1n)}>X</button>",
    "<button on:click={() => handle(1n)} on:click={() => handle(2n)}>X</button>",
    "<button on:click={() => handle(1n)} on:click={() => handle('1')}>X</button>",
    "{#if value === 1n}A{:else if value === 1}B{/if}",
    "<script>let el; function clear(el) { el.remove(); }</script><div bind:this={el}></div>",
    "<script>let el; function clear() { const el = {}; el.remove(); }</script><div bind:this={el}></div>",
    "<script>let el; const clear = function el() { el.remove(); };</script><div bind:this={el}></div>",
    "<script context='module'>const el = {remove() {}}; el.remove();</script><script>let el;</script><div bind:this={el}></div>",
    "<script>let el; function inspect() { return el.textContent; }</script><div bind:this={el}></div>",
    "<button onclick={() => setTimeout(() => {}, 10)}>X</button>",
    "<button onclick={() => console.error('X')}>X</button>",
    "<button onclick={(console) => console.log('X')}>X</button>",
    "<script>function run(Function) { return Function('value'); }</script>",
    "<script>function run(Function) { return new Function('value'); }</script>",
    "<script>function run() { const console = {log() {}}; console.log('X'); }</script>",
    "<button onclick={() => { if (true) { var console = {log() {}}; } console.log('X'); }}>X</button>",
    "<button onclick={() => { if (true) { var Function = value => value; } Function('value'); }}>X</button>",
    "<button onclick={() => { if (true) { var setTimeout = value => value; } setTimeout('short'); }}>X</button>",
    "<script>if (true) { var console = {log() {}}; } console.log('X');</script>",
    "<script>class Local { static { var console = {log() {}}; console.log('X'); } }</script>",
    "<Component let:console><p>{console.log('X')}</p></Component>",
    "<Component let:logger={console}><p>{console.log('X')}</p></Component>",
    "<Component let:logger={{log: console}}><p>{console.log('X')}</p></Component>",
    "<button onclick={() => { switch (1) { case 1: const console = {log() {}}; console.log('X'); break; } }}>X</button>",
    "<script>const console = {log() {}}; console.log('X');</script>",
    "<script>import console from './logger';</script><button onclick={() => console.log('X')}>X</button>",
    "<script>export const Function = value => value;</script><button onclick={() => Function('value')}>X</button>",
    "<script context='module'>const console = {log() {}}; console.log('X');</script>",
    "<script context='module'>const console = {log() {}};</script><script>console.log('X');</script>",
    "{#each entries as console (console.id)}<p>{console.log('X')}</p>{/each}",
    "{#snippet render(console)}<p>{console.log('X')}</p>{/snippet}",
    "{#await value then console}<p>{console.log('X')}</p>{/await}",
    "{#await value}<p>Waiting</p>{:catch Function}<p>{Function('value')}</p>{/await}",
    "{#if ready}{@const console = logger}<p>{console.log('X')}</p>{/if}",
    "<button onclick={() => settings.setTimeout('short')}>X</button>",
    "<button onclick={() => settings['setInterval']('short')}>X</button>",
    "<button onclick={(setTimeout) => setTimeout('short')}>X</button>",
    "<button onclick={(window) => window.setTimeout('short')}>X</button>",
    "<script>const setTimeout = value => value;</script><button onclick={() => setTimeout('short')}>X</button>",
    "<button onclick={() => window.setTimeout(() => {}, 10)}>X</button>",
    "<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions --><div onclick={() => {}}>X</div>",
    "<!-- svelte-ignore a11y_click_events_have_key_events --><!-- svelte-ignore a11y_no_static_element_interactions --><div onclick={() => {}}>X</div>",
  ])("accepts valid template code: %s", (source) => {
    expect(checkSvelteAsQuickAdd(source)).toEqual([]);
  });
  it("reports template expressions at their original line and column", () => {
    const [diagnostic] = checkSvelteAsQuickAdd(
      "<p>Text</p>\n<button onclick={() => document.createElement('div')}>X</button>",
      "Probe.svelte",
    );
    expect(diagnostic).toMatchObject({
      filename: "Probe.svelte",
      line: 2,
      column: 24,
      rule: "restricted-syntax",
    });
  });
  it("rejects malformed components instead of skipping them", () => {
    expect(checkSvelteAsQuickAdd("{#if ready}<p>X</p>")).toMatchObject([{ severity: "error" }]);
  });
});
