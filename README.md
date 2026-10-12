# svelte-policy

Lint rules for Svelte 5 components that need the compiler's view of a component, and an [oxlint](https://oxc.rs/docs/guide/usage/linter.html) plugin that applies the same syntax rules to TypeScript. One `svelte-policy.json` configures both.

The checker parses each component with your project's Svelte compiler. It sees scripts, template expressions, and blocks the way the compiler does, so it covers what oxlint cannot check in `.svelte` files: keyed each blocks, duplicate else-if branches, unused `svelte-ignore` comments, event handlers that are not functions, and your own restricted syntax inside template expressions.

## Install

```sh
pnpm add -D svelte-policy
npm install --save-dev svelte-policy
```

svelte-policy needs Node 20.19, or 22.12 and later. It uses the `svelte` package your project installs, version 5.57 or later.

## Run the checker

```sh
svelte-policy
svelte-policy src/lib src/App.svelte
```

With no arguments, the CLI checks every `.svelte` file under `./src`. Directories are searched recursively and `node_modules` is skipped. Each diagnostic prints on one line, followed by a summary:

```text
/work/app/src/ui/ChapterList.svelte:52:5 error require-each-key: Give each block a stable key.
Svelte policies: 1 errors, 0 warnings.
```

| Exit code | Meaning                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| 0         | No diagnostic is an error.                                                                    |
| 1         | At least one diagnostic is an error.                                                          |
| 2         | A config file is invalid, a path does not exist, or an option was passed. Nothing is checked. |

The CLI has no options. To fail on a rule that warns, set it to `"error"`.

## Configure

`svelte-policy.json` is optional. Without one, every rule runs at its default severity. A component uses the nearest `svelte-policy.json` in its directory or above. The settings in that file replace the defaults they name, and files further up are not read.

```json
{
  "rules": {
    "no-svelte-store": "error",
    "no-console": { "severity": "error", "message": "Use the logger instead of console methods." }
  },
  "restrictedSyntax": [
    {
      "selector": "CallExpression[callee.name=\"track\"]",
      "message": "Use the analytics helper."
    }
  ]
}
```

`rules` sets a rule to `"off"`, `"warn"`, or `"error"`. `no-console` also accepts an object with `severity` and `message`, so the message can name your logger.

`restrictedSyntax` lists [esquery](https://github.com/estools/esquery) selectors, each with the message to report where it matches. The checker reports them under `restricted-syntax` in component scripts and template expressions. The oxlint plugin reports them in the TypeScript files you enable it for.

A file with unknown keys, unknown rules, invalid severities, or a selector that esquery cannot parse is an error. The error message names the file.

### Rules

| Rule                          | Default | In oxlint | Reports                                                                                                                 |
| ----------------------------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `restricted-syntax`           | error   | yes       | Code that matches a `restrictedSyntax` selector.                                                                        |
| `no-svelte-internal`          | error   | yes       | Imports and re-exports from `svelte/internal`.                                                                          |
| `no-svelte-store`             | off     | yes       | Imports and re-exports from `svelte/store`.                                                                             |
| `runes-only`                  | off     | yes       | `$:` statements and named `createEventDispatcher` imports.                                                              |
| `no-inspect`                  | warn    | yes       | `$inspect(...)` calls.                                                                                                  |
| `no-at-html-tags`             | error   |           | `{@html ...}` tags.                                                                                                     |
| `no-at-debug-tags`            | warn    |           | `{@debug ...}` tags.                                                                                                    |
| `require-each-key`            | error   |           | An each block with an item and no key.                                                                                  |
| `valid-each-key`              | error   |           | An each block key that does not use the block's item or index.                                                          |
| `no-dupe-else-if-blocks`      | error   |           | An `{:else if}` condition that an earlier branch already covers.                                                        |
| `no-object-in-text-mustaches` | error   |           | An object, array, function, or class literal in text, or in an attribute value that also has text.                      |
| `no-raw-special-elements`     | error   |           | `<head>`, `<body>`, `<window>`, `<document>`, `<element>`, or `<options>` without the `svelte:` prefix.                 |
| `no-dupe-directives`          | error   |           | Two identical `on:` or `use:` directives on one element.                                                                |
| `no-dom-manipulating`         | error   |           | Structural or text changes to an element bound with `bind:this`.                                                        |
| `no-not-function-handler`     | error   |           | An `on*` attribute or `on:` directive whose value is a literal, object, array, or class, directly or through a `const`. |
| `no-console`                  | error   |           | Console methods other than `console.warn` and `console.error`.                                                          |
| `no-new-func`                 | error   |           | `Function(...)` and `new Function(...)`.                                                                                |
| `no-implied-eval`             | error   |           | A string of code passed to `setTimeout`, `setInterval`, or `execScript`.                                                |
| `no-unused-svelte-ignore`     | error   |           | A `svelte-ignore` comment, in markup or in a script, that names no code or suppresses no warning.                       |

The store ban and the runes requirement are off by default because legacy components and stores remain valid Svelte 5. Turn them on when every component uses runes.

A component that does not parse produces one error. Its rule is the compiler's error code, such as `block_unclosed`.

## Use the oxlint plugin

Add the plugin to your `.oxlintrc.json` and turn on the rules you want, for the files you want:

```json
{
  "jsPlugins": ["svelte-policy/oxlint"],
  "overrides": [
    {
      "files": ["src/**/*.ts"],
      "rules": {
        "svelte-policy/restricted-syntax": "error",
        "svelte-policy/no-svelte-internal": "error"
      }
    }
  ]
}
```

The plugin has one rule for each rule marked "In oxlint" in the table. Your `.oxlintrc.json` decides which of them run, on which files, and at which severity. `svelte-policy.json` supplies only the selectors for `restricted-syntax`, read from the file nearest each linted file, so oxlint can run from any directory.

To keep an existing diagnostic prefix, load the plugin under another name: `{ "name": "quickadd", "specifier": "svelte-policy/oxlint" }` reports `quickadd(restricted-syntax)`.

Oxlint's JavaScript plugin API is in alpha. This package is tested against oxlint 1.87.0.

## Call it from code

```ts
import { checkSvelte, type Config, type Diagnostic } from "svelte-policy";

const diagnostics: Diagnostic[] = checkSvelte(source, "/work/app/src/App.svelte");

const config: Config = { rules: { "runes-only": "error" } };
const strict = checkSvelte(source, "App.svelte", config);
```

`checkSvelte(source, filename = "Component.svelte", config?)` returns diagnostics sorted by position. Without `config`, it reads the nearest `svelte-policy.json` above `filename`. With `config`, it validates that object the same way and reads no files. An invalid config throws an `Error`.

Each `Diagnostic` has `filename`, `line` and `column` (both 1-based), `rule`, `message`, and `severity` (`"error"` or `"warning"`).

## Example setups

### QuickAdd

QuickAdd uses runes everywhere, bans stores, routes console output through its logger, and restricts ten Obsidian-specific patterns. `svelte-policy.json` at the repository root:

```json
{
  "rules": {
    "no-svelte-store": "error",
    "runes-only": "error",
    "no-console": {
      "severity": "error",
      "message": "Use the logger utilities instead of console methods."
    }
  },
  "restrictedSyntax": [
    {
      "selector": "CallExpression[callee.type=\"MemberExpression\"][callee.property.name=\"createElement\"]",
      "message": "Use Obsidian DOM helpers; use the owner document window for detached elements."
    },
    {
      "selector": "CallExpression[callee.property.name=\"createDocumentFragment\"]",
      "message": "Use createFragment(), or the owner document window for a specific realm."
    },
    {
      "selector": "CallExpression:matches([callee.name=\"createEl\"], [callee.property.name=\"createEl\"])[arguments.0.value=/^(div|span)$/]",
      "message": "Use createDiv() or createSpan() for these tags."
    },
    {
      "selector": "BinaryExpression[operator=\"instanceof\"][right.name=\"HTMLElement\"]",
      "message": "Use node.instanceOf(HTMLElement) for cross-window checks."
    },
    {
      "selector": "CallExpression[callee.type=\"MemberExpression\"][callee.property.name=\"setDynamicTooltip\"]",
      "message": "Slider values are shown inline; setDynamicTooltip has no effect."
    },
    {
      "selector": "Literal[regex.pattern=/\\(\\?<[=!]/]",
      "message": "No regex lookbehind: iOS before 16.4 cannot parse it, and Obsidian runs on iOS 15.6, so QuickAdd would not load at all."
    },
    {
      "selector": "AssignmentExpression[left.object.type=\"MemberExpression\"][left.object.computed=false][left.object.property.name=\"style\"][right.type=\"Literal\"]",
      "message": "Put a static style in styles.css; set a computed one with setCssStyles, or a CSS variable with setCssProps."
    },
    {
      "selector": "CallExpression[callee.property.name=\"setProperty\"][callee.object.property.name=\"style\"][arguments.1.type=\"Literal\"]",
      "message": "Put a static style in styles.css; set a computed one with setCssStyles, or a CSS variable with setCssProps."
    },
    {
      "selector": "CallExpression[callee.property.name=\"setAttribute\"][arguments.0.value=\"style\"][arguments.1.type=\"Literal\"]",
      "message": "Put a static style in styles.css; set a computed one with setCssStyles, or a CSS variable with setCssProps."
    },
    {
      "selector": "CallExpression[callee.property.name=/^setCss(Props|Styles)$/] > ObjectExpression > Property[key.type=\"Literal\"][key.value=/^(?!--)/]",
      "message": "Put a static style in styles.css; set a computed one with setCssStyles, or a CSS variable with setCssProps."
    }
  ]
}
```

In `.oxlintrc.syntax.json`, load the plugin under QuickAdd's existing prefix and rename its custom rules. The Svelte internals guard runs on every `.ts` file, tests included. The store ban, the dispatcher ban, and the `$inspect` warning stay on shared `.svelte.ts` modules:

```json
{
  "jsPlugins": [{ "name": "quickadd", "specifier": "svelte-policy/oxlint" }],
  "overrides": [
    {
      "files": ["src/**/*.ts"],
      "rules": { "quickadd/restricted-syntax": "error" }
    },
    {
      "files": ["src/**/*.test.ts"],
      "rules": { "quickadd/restricted-syntax": "off" }
    },
    {
      "files": ["**/*.ts"],
      "rules": { "quickadd/no-svelte-internal": "error" }
    },
    {
      "files": ["**/*.svelte.ts"],
      "rules": {
        "quickadd/no-svelte-store": "error",
        "quickadd/runes-only": "error",
        "quickadd/no-inspect": "warn"
      }
    }
  ]
}
```

Keep the other overrides in that file. In `package.json`, set `"lint:svelte": "svelte-policy"`.

Three checker diagnostics change their rule name from `restricted-syntax`: `svelte/store` imports report `no-svelte-store`, `svelte/internal` imports report `no-svelte-internal`, and named `createEventDispatcher` imports report `runes-only`. Their messages are unchanged.

### PodNotes

PodNotes still has legacy components, stores, and `createEventDispatcher`, and wants every other default. It needs no `svelte-policy.json`.

In `.oxlintrc.json`, add the plugin and turn on the Svelte internals guard for source files:

```json
{
  "jsPlugins": ["eslint-plugin-obsidianmd", "svelte-policy/oxlint"],
  "overrides": [
    {
      "files": ["src/**/*.ts"],
      "excludeFiles": ["src/**/*.test.ts", "src/**/*.spec.ts"],
      "rules": {
        "svelte-policy/no-svelte-internal": "error"
      }
    }
  ]
}
```

Add the rule to the existing `src/**/*.ts` override rather than a new one. Oxlint keeps ignoring `**/*.svelte`, because the checker covers components. In `package.json`, append `&& svelte-policy` to the `lint` script.

## Known limitations

- `no-unused-svelte-ignore` reads a comment's codes in the mode the compiler infers from the component, not from `compilerOptions.runes` in your Svelte config. A component that your config forces into runes mode but that uses no runes is read as a legacy component.
- `no-dom-manipulating` follows the name bound with `bind:this`, not aliases of it.
- A `let:` directive on a component also scopes children that fill a named slot, though Svelte gives those children only their own slot's names. `no-not-function-handler` can miss a handler there that names an outer `const`.
- `valid-each-key` checks that the key uses the item or index. It does not prove that keys are unique.
- `no-dupe-else-if-blocks` and `no-dupe-directives` do not see through TypeScript, so they miss duplicates that differ only in a type annotation or assertion.
