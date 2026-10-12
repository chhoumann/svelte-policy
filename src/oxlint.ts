import { dirname } from "node:path";
import { policyFor } from "./config";
import { rules, type Selector, type SelectorRuleId } from "./rules";

/** The part of oxlint's JS plugin API this plugin uses; oxlint exports no types for it. */
interface OxlintNode {
  readonly type: string;
}

interface OxlintContext {
  /** Absolute path of the linted file. */
  readonly filename: string;
  report(descriptor: { readonly node: OxlintNode; readonly message: string }): void;
}

interface OxlintRule {
  readonly meta: { readonly type: "problem"; readonly schema: readonly [] };
  create(context: OxlintContext): Record<string, (node: OxlintNode) => void>;
}

interface OxlintPlugin {
  readonly meta: { readonly name: string };
  readonly rules: Readonly<Record<SelectorRuleId, OxlintRule>>;
}

/** One visitor per selector text, so two selectors with the same text both report. */
function selectorRule(selectorsFor: (context: OxlintContext) => readonly Selector[]): OxlintRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const messages = new Map<string, string[]>();
      for (const { selector, message } of selectorsFor(context)) {
        messages.set(selector, [...(messages.get(selector) ?? []), message]);
      }
      return Object.fromEntries(
        [...messages].map(([selector, list]) => [
          selector,
          (node: OxlintNode) => {
            for (const message of list) context.report({ node, message });
          },
        ]),
      );
    },
  };
}

const builtIn = (rule: Exclude<SelectorRuleId, "restricted-syntax">) =>
  selectorRule(() => rules[rule].selectors);

/**
 * One oxlint rule per selector rule. `restricted-syntax` reads the consumer's selectors from the
 * nearest svelte-policy.json above the linted file; severities and file globs live in `.oxlintrc`.
 */
const plugin: OxlintPlugin = {
  meta: { name: "svelte-policy" },
  rules: {
    "restricted-syntax": selectorRule(
      (context) => policyFor(dirname(context.filename)).restrictedSyntax,
    ),
    "no-svelte-internal": builtIn("no-svelte-internal"),
    "no-svelte-store": builtIn("no-svelte-store"),
    "runes-only": builtIn("runes-only"),
    "no-inspect": builtIn("no-inspect"),
  },
};

export default plugin;
