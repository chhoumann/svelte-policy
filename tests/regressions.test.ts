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

  it("reorders logical operands only where just their truthiness is read", () => {
    expect(rulesOf("{#if (a || b) === b}A{:else if (b || a) === b}B{/if}")).toEqual([]);
    expect(rulesOf("{#if (a || b) === b}A{:else if (a || b) === b}B{/if}")).toEqual([
      "no-dupe-else-if-blocks",
    ]);
    expect(rulesOf("{#if (a || b) && c}A{:else if (b || a) && c}B{/if}")).toEqual([
      "no-dupe-else-if-blocks",
    ]);
    expect(rulesOf("{#if !(a && b)}A{:else if !(b && a)}B{/if}")).toEqual([
      "no-dupe-else-if-blocks",
    ]);
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

  it("applies a svelte-ignore to the next node past any text", () => {
    expect(check("<!-- svelte-ignore a11y_autofocus -->Name: <input autofocus />")).toEqual([]);
    expect(
      check("<label><!-- svelte-ignore a11y_autofocus -->Name <input autofocus /></label>"),
    ).toEqual([]);
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

  it("checks svelte-ignore comments in scripts and template expressions", () => {
    expect(
      check(
        [
          "<script>",
          "let n = $state(0);",
          "// svelte-ignore state_referenced_locally",
          "const copy = n;",
          "/* svelte-ignore state_referenced_locally */ const other = 1;",
          "const last = 2; // svelte-ignore state_referenced_locally",
          "</script>",
          "<button onclick={() => {",
          "  // svelte-ignore state_referenced_locally",
          "  console.warn(n);",
          "}}>{copy}{other}{last}</button>",
        ].join("\n"),
      ),
    ).toEqual([
      unused("state_referenced_locally", 1, 5),
      unused("state_referenced_locally", 17, 6),
      unused("state_referenced_locally", 3, 9),
    ]);
  });

  describe("reads svelte-ignore codes as Svelte reads them", () => {
    it("treats words after the code list as prose in runes mode", () => {
      expect(
        check(
          "<script>let n = $state(0);</script><!-- svelte-ignore a11y_autofocus because the dialog opens on demand --><input autofocus value={n} />",
        ),
      ).toEqual([]);
    });

    it("reads every word as a code in legacy mode", () => {
      expect(check("<!-- svelte-ignore a11y_autofocus focus --><input autofocus />")).toEqual([
        unused("focus"),
      ]);
    });

    it("honors Svelte 4 codes in legacy mode", () => {
      expect(
        check("<script>\n// svelte-ignore unused-export-let\nexport let unused;</script>"),
      ).toEqual([]);
      expect(check('<!-- svelte-ignore avoid-is --><div is="my-el"></div>')).toEqual([]);
      expect(
        check("<div><!-- svelte-ignore a11y-structure --><figcaption>X</figcaption></div>"),
      ).toEqual([]);
    });

    it("honors only exact codes in runes mode", () => {
      expect(
        check(
          "<script>let n = $state(0);</script><!-- svelte-ignore a11y-autofocus --><input autofocus value={n} />",
        ),
      ).toEqual([unused("a11y-autofocus", 36)]);
    });
  });

  it("counts a svelte-ignore for a runtime-only warning as used when it applies to a node", () => {
    expect(
      check(
        "<script>\nlet s = $state({});\n// svelte-ignore state_snapshot_uncloneable\nconst copy = $state.snapshot(s);\n</script>{copy}",
      ),
    ).toEqual([]);
    expect(check("<p>X</p><!-- svelte-ignore hydration_html_changed -->")).toEqual([
      unused("hydration_html_changed", 9),
    ]);
  });

  it("reports an object literal in an attribute value with more than one part", () => {
    expect(check('<p title="x {{a: 1}}" data-a="{{b: 2}}" data-b={{c: 3}}>X</p>')).toEqual([
      {
        line: 1,
        column: 13,
        rule: "no-object-in-text-mustaches",
        message: "Interpolate a display value instead of an object or function.",
      },
    ]);
  });

  it("does not require a key on an each block without an item", () => {
    expect(check("{#each {length: 3}}<p>X</p>{/each}")).toEqual([]);
  });

  it("resolves member names written as backtick strings", () => {
    expect(
      rulesOf("<button onclick={() => window[`setTimeout`]('alert(1)', 1)}>X</button>"),
    ).toEqual(["no-implied-eval"]);
    expect(
      rulesOf(
        "<script>let el; function clear() { el[`remove`](); }</script><div bind:this={el}></div>",
      ),
    ).toEqual(["no-dom-manipulating"]);
    expect(rulesOf("<button onclick={() => console[`warn`]('X')}>X</button>")).toEqual([]);
    expect(
      rulesOf("<button onclick={() => window[`set${'Timeout'}`]('alert(1)', 1)}>X</button>"),
    ).toEqual([]);
  });

  describe("no-not-function-handler", () => {
    it.each([
      ["a number attribute", "<button onclick={42}>X</button>"],
      ["a quoted string attribute", "<button onclick=\"{'alert(1)'}\">X</button>"],
      ["a template literal", "<button onclick={`alert(1)`}>X</button>"],
      ["an object", "<button onclick={{handleEvent() {}}}>X</button>"],
      ["an array", "<button onclick={[]}>X</button>"],
      ["a class", "<button onclick={class {}}>X</button>"],
      ["a boolean", "<svelte:window onkeydown={true} />"],
      ["a regex", "<svelte:document onclick={/x/} />"],
      ["a bigint", "<svelte:body onclick={1n} />"],
      ["an on: directive", "<button on:click={'handler'}>X</button>"],
      ["a const", "<script>const handler = 42;</script><button onclick={handler}>X</button>"],
      [
        "a const of a const",
        "<script>const value = {}; const handler = value;</script><button on:click={handler}>X</button>",
      ],
      [
        "a module const",
        "<script module>const handler = 'x';</script><script>let n = $state(0);</script><button onclick={handler}>{n}</button>",
      ],
      ["an @const", "{#if ready}{@const handler = 42}<button onclick={handler}>X</button>{/if}"],
      [
        "a const behind TypeScript assertions",
        '<script lang="ts">const handler = 42 as unknown as () => void;</script><button onclick={handler}>X</button>',
      ],
      [
        "an as const literal",
        '<script lang="ts">const handler = 42 as const;</script><button onclick={handler}>X</button>',
      ],
      [
        "a non-null const of a const",
        '<script lang="ts">const value = "x"; const handler = value!;</script><button onclick={handler}>X</button>',
      ],
      [
        "a satisfies expression",
        '<script lang="ts"></script><button onclick={"x" satisfies string}>X</button>',
      ],
    ])("reports %s", (_name, source) => {
      expect(rulesOf(source)).toEqual(["no-not-function-handler"]);
    });

    it.each([
      ["a function", "<button onclick={() => {}}>X</button>"],
      [
        "a function behind a TypeScript assertion",
        '<script lang="ts">const handler = (() => {}) as unknown as () => void;</script><button onclick={handler}>X</button>',
      ],
      ["null", "<button onclick={null}>X</button>"],
      ["undefined", "<button onclick={undefined}>X</button>"],
      ["a let", "<script>let handler = 42;</script><button onclick={handler}>X</button>"],
      [
        "a destructured const",
        "<script>const { handler } = { handler: 42 };</script><button onclick={handler}>X</button>",
      ],
      [
        "a const shadowed by a parameter",
        "<script>const handler = 42;</script>{#snippet row(handler)}<button onclick={handler}>X</button>{/snippet}",
      ],
      [
        "a let: name on a slotted element",
        '<script>const handler = 42;</script><Widget><button slot="default" let:handler onclick={handler}>X</button></Widget>',
      ],
      ["a component prop", "<Widget onclick={42} />"],
      ["an attribute with text around the value", '<button onclick="x {42}">X</button>'],
      ["a forwarded on: directive", "<button on:click>X</button>"],
      [
        "consts that refer to each other",
        "<script>const a = b; const b = a;</script><button onclick={a}>X</button>",
      ],
    ])("accepts %s", (_name, source) => {
      expect(rulesOf(source)).toEqual([]);
    });

    it("reports at the handler expression with the rule's message", () => {
      expect(
        check("<script>const handler = 42;</script>\n<button onclick={handler}>X</button>"),
      ).toEqual([
        {
          line: 2,
          column: 18,
          rule: "no-not-function-handler",
          message: "Pass a function as the event handler.",
        },
      ]);
    });
  });

  describe("sees through TypeScript wrappers, which Svelte strips", () => {
    const ts = (script: string, markup = "") => `<script lang="ts">${script}</script>${markup}`;
    const bound = (body: string, target = "el") =>
      ts(`let el: HTMLElement; function clear() { ${body} }`, `<div bind:this={${target}}></div>`);

    it.each([
      [
        "an object in a text mustache",
        ts("", "<p>{{ a: 1 } as { a: number }}</p>"),
        "no-object-in-text-mustaches",
      ],
      [
        "an object in a multi-part attribute",
        ts("", '<p title="x {({ a: 1 } satisfies { a: number })}">X</p>'),
        "no-object-in-text-mustaches",
      ],
      ["a non-null console", ts('console!.log("x");'), "no-console"],
      ["a cast console", ts('(console as Console).log("x");'), "no-console"],
      [
        "an asserted console in a handler",
        ts("", '<button onclick={() => (<Console>console).info("x")}>X</button>'),
        "no-console",
      ],
      ["a non-null bound element", bound("el!.replaceChildren();"), "no-dom-manipulating"],
      ["a cast bound element", bound('(el as HTMLElement).innerHTML = "";'), "no-dom-manipulating"],
      [
        "a cast assignment target",
        bound('(el.textContent as string) = "";'),
        "no-dom-manipulating",
      ],
      ["a non-null method", bound("el.remove!();"), "no-dom-manipulating"],
      ["a cast optional method", bound("(el?.remove as () => void)();"), "no-dom-manipulating"],
      [
        "a method name cast to its literal type",
        bound('el["remove" as const]();'),
        "no-dom-manipulating",
      ],
      [
        "an element bound through an assertion",
        bound("el.remove();", "el!"),
        "no-dom-manipulating",
      ],
      ["a cast Function call", ts('(Function as FunctionConstructor)("return 1");'), "no-new-func"],
      ["a cast Function constructor", ts('new (Function as any)("return 1");'), "no-new-func"],
      ["a cast code string", ts('setTimeout("work()" as string, 1);'), "no-implied-eval"],
      ["a cast timer", ts('(setTimeout as any)("work()");'), "no-implied-eval"],
      ["a non-null global object", ts('window!.setTimeout("work()");'), "no-implied-eval"],
      [
        "a cast timer member",
        ts('(window.setInterval as typeof setInterval)("work()");'),
        "no-implied-eval",
      ],
      [
        "a timer name cast to its literal type",
        ts('globalThis["setTimeout" as const]("work()");'),
        "no-implied-eval",
      ],
    ])("reports %s", (_name, source, rule) => {
      expect(rulesOf(source)).toEqual([rule]);
    });

    it.each([
      ["a cast number in a text mustache", ts("let n = 1;", "<p>{n as number}</p>")],
      [
        "a console parameter behind a cast",
        ts('function log(console: Console) { (console as Console).log("x"); }'),
      ],
      ["a non-null console.warn", ts('console!.warn("x");')],
      [
        "an element parameter behind assertions",
        ts(
          'let el: HTMLElement; function clear(el: HTMLElement) { el!.remove(); (el.textContent as string) = ""; }',
          "<div bind:this={el!}></div>",
        ),
      ],
      ["reading a bound element's text", bound("return (el!.textContent as string).trim();")],
      [
        "a Function parameter behind a cast",
        ts(
          'function make(Function: FunctionConstructor) { (Function as FunctionConstructor)("return 1"); }',
        ),
      ],
      [
        "timer parameters behind assertions",
        ts(
          'function run(setTimeout: (code: string) => void, window: { setTimeout(code: string): void }) { (setTimeout as any)("work()"); window!.setTimeout("work()"); }',
        ),
      ],
      ["a cast callback", ts("setTimeout((() => {}) as () => void, 1);")],
    ])("accepts %s", (_name, source) => {
      expect(rulesOf(source)).toEqual([]);
    });

    it("reports at the wrapped expression's own position", () => {
      expect(
        check(
          '<script lang="ts">\n(console as Console).log("x");\nsetTimeout("work()" as string);\n</script>\n<p>{{} as object}</p>',
        ),
      ).toEqual([
        {
          line: 2,
          column: 1,
          rule: "no-console",
          message: "Use console.warn or console.error instead of other console methods.",
        },
        {
          line: 3,
          column: 1,
          rule: "no-implied-eval",
          message: "Pass a callback instead of a code string.",
        },
        {
          line: 5,
          column: 4,
          rule: "no-object-in-text-mustaches",
          message: "Interpolate a display value instead of an object or function.",
        },
      ]);
    });
  });
});
