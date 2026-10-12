export type Severity = "off" | "warn" | "error";

/** An esquery selector and the message reported where it matches. */
export interface Selector {
  readonly selector: string;
  readonly message: string;
}

interface RuleSpec {
  readonly severity: Severity;
  /** Present on the rules that are selector lists. */
  readonly selectors?: readonly Selector[];
}

/**
 * Every rule, its default severity, and the built-in selectors of the selector rules. Rule ids
 * in svelte-policy.json and in diagnostics come from this table.
 */
export const rules = {
  /** The consumer's `restrictedSyntax` selectors. */
  "restricted-syntax": { severity: "error", selectors: [] },
  "no-svelte-internal": {
    severity: "error",
    selectors: [
      {
        selector:
          ":matches(ImportDeclaration, ImportExpression, ExportNamedDeclaration, ExportAllDeclaration)[source.value=/^svelte\\/internal(\\/|$)/]",
        message: "Use Svelte's public API instead of svelte/internal.",
      },
    ],
  },
  "no-svelte-store": {
    severity: "off",
    selectors: [
      {
        selector:
          ':matches(ImportDeclaration, ImportExpression, ExportNamedDeclaration, ExportAllDeclaration)[source.value="svelte/store"]',
        message: "Use Svelte runes for component state instead of legacy stores.",
      },
    ],
  },
  "runes-only": {
    severity: "off",
    selectors: [
      {
        selector: 'LabeledStatement[label.name="$"]',
        message: "Use $derived or $effect instead of legacy $: statements.",
      },
      {
        selector:
          'ImportDeclaration[source.value="svelte"] > ImportSpecifier[imported.name="createEventDispatcher"]',
        message: "Use callback props instead of createEventDispatcher.",
      },
    ],
  },
  "no-inspect": {
    severity: "warn",
    selectors: [
      {
        selector:
          'CallExpression:matches([callee.name="$inspect"], [callee.object.name="$inspect"])',
        message: "Remove $inspect before shipping.",
      },
    ],
  },
  "no-at-html-tags": { severity: "error" },
  "no-at-debug-tags": { severity: "warn" },
  "require-each-key": { severity: "error" },
  "valid-each-key": { severity: "error" },
  "no-dupe-else-if-blocks": { severity: "error" },
  "no-object-in-text-mustaches": { severity: "error" },
  "no-raw-special-elements": { severity: "error" },
  "no-dupe-directives": { severity: "error" },
  "no-dom-manipulating": { severity: "error" },
  "no-not-function-handler": { severity: "error" },
  "no-console": { severity: "error" },
  "no-new-func": { severity: "error" },
  "no-implied-eval": { severity: "error" },
  "no-unused-svelte-ignore": { severity: "error" },
} as const satisfies Record<string, RuleSpec>;

export type RuleId = keyof typeof rules;

export type SelectorRuleId = {
  [Id in RuleId]: (typeof rules)[Id] extends { readonly selectors: readonly Selector[] }
    ? Id
    : never;
}[RuleId];

export function isRuleId(id: string): id is RuleId {
  return Object.hasOwn(rules, id);
}

export const ruleIds: readonly RuleId[] = Object.keys(rules).filter(isRuleId);

export const selectorRuleIds: readonly SelectorRuleId[] = ruleIds.filter(
  (id): id is SelectorRuleId => "selectors" in rules[id],
);
