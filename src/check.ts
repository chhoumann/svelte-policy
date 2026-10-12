import esquery, { type Selector as Query } from "esquery";
import type { Expression, MemberExpression, Node, Super } from "estree";
import { compile, parse, type AST, type CompileError } from "svelte/compiler";
import { walk } from "zimmerframe";
import { coveredByEarlierBranch } from "./conditions";
import type { Policy } from "./config";
import { rules, selectorRuleIds, type RuleId, type SelectorRuleId } from "./rules";
import { buildScopes, isReference, isTypeOnly, type Scope, type Scopes } from "./scope";

export interface Diagnostic {
  readonly filename: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  /** The rule id, or the compiler's error code when the component does not parse. */
  readonly rule: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

interface Range {
  readonly start: number;
  readonly end: number;
}

type Reporter = (node: { readonly start: number }, rule: RuleId, message: string) => void;

/** Check one component against a policy. Diagnostics are sorted by source position. */
export function check(source: string, filename: string, policy: Policy): Diagnostic[] {
  const found: { readonly offset: number; readonly diagnostic: Diagnostic }[] = [];
  const add = (offset: number, rule: string, message: string, severity: Diagnostic["severity"]) => {
    const before = source.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - before.lastIndexOf("\n");
    found.push({ offset, diagnostic: { filename, line, column, rule, message, severity } });
  };
  const report: Reporter = (node, rule, message) => {
    const severity = policy.severity(rule);
    if (severity !== "off") {
      add(node.start, rule, message, severity === "warn" ? "warning" : "error");
    }
  };

  let root: AST.Root | undefined;
  try {
    root = parse(source, { modern: true, filename });
  } catch (error) {
    if (!isCompileError(error)) throw error;
    add(error.position?.[0] ?? 0, error.code, error.message, "error");
  }
  if (root) {
    if (policy.severity("no-unused-svelte-ignore") !== "off") {
      checkIgnores(root, source, filename, report);
    }
    checkTree(root, policy, report);
  }
  return found.sort((a, b) => a.offset - b.offset).map(({ diagnostic }) => diagnostic);
}

function isCompileError(error: unknown): error is CompileError {
  return error instanceof Error && error.name === "CompileError";
}

const suppressionPrefix = /^\s*svelte-ignore(?=\s|$)/;

/**
 * The codes a svelte-ignore comment names, read the way Svelte reads them: in runes mode a
 * comma-separated list followed by prose, otherwise every word. Text from `(` on is a reason.
 */
function suppressedCodes(text: string, runes: boolean): string[] {
  const list = text.replace(suppressionPrefix, "").split("(")[0] ?? "";
  if (!runes) return list.match(/[\w$-]+/g) ?? [];
  const codes: string[] = [];
  for (const [, code = "", comma] of list.matchAll(/([\w$-]+)(,)?/g)) {
    codes.push(code);
    if (!comma) break;
  }
  return codes;
}

/** Either mode reads at least one code from a comment with at least one word. */
function namesCode(text: string): boolean {
  return suppressedCodes(text, false).length > 0;
}

interface Suppression {
  readonly comment: Range;
  readonly text: string;
  /** The node the comment applies to; undefined when nothing follows it. */
  readonly target: Range | undefined;
}

/**
 * no-unused-svelte-ignore. Blank every svelte-ignore comment, compile, and report each code with
 * no matching warning inside the comment's target. The compile leaves `runes` unset, so the
 * compiler infers the mode and legacy components are checked too.
 */
function checkIgnores(root: AST.Root, source: string, filename: string, report: Reporter): void {
  const suppressions: Suppression[] = [];
  const commented = new Map<number, Range>();
  walk<AST.SvelteNode, null>(root, null, {
    StyleSheet() {},
    _(node, { path, next }) {
      if ("leadingComments" in node) {
        for (const comment of node.leadingComments ?? []) commented.set(comment.start, node);
      }
      const parent = path.at(-1);
      if (
        node.type === "Comment" &&
        parent?.type === "Fragment" &&
        suppressionPrefix.test(node.data)
      ) {
        const siblings = parent.nodes.slice(parent.nodes.indexOf(node) + 1);
        const target = siblings.find(
          (sibling) =>
            sibling.type !== "Comment" && !(sibling.type === "Text" && !sibling.data.trim()),
        );
        suppressions.push({ comment: node, text: node.data, target });
      }
      next();
    },
  });
  for (const comment of root.comments) {
    if (suppressionPrefix.test(comment.value)) {
      suppressions.push({ comment, text: comment.value, target: commented.get(comment.start) });
    }
  }

  for (const { comment, text } of suppressions) {
    if (!namesCode(text)) {
      report(
        comment,
        "no-unused-svelte-ignore",
        "Name the warning code this svelte-ignore suppresses.",
      );
    }
  }
  if (!suppressions.some(({ text }) => namesCode(text))) return;

  let unsuppressed = source;
  for (const { comment } of suppressions) {
    unsuppressed =
      unsuppressed.slice(0, comment.start) +
      source.slice(comment.start, comment.end).replace(/[^\n]/g, " ") +
      unsuppressed.slice(comment.end);
  }
  let result: ReturnType<typeof compile>;
  try {
    result = compile(unsuppressed, { filename, generate: false });
  } catch (error) {
    // svelte-check reports compiler errors; there is nothing to compare against.
    if (isCompileError(error)) return;
    throw error;
  }
  for (const { comment, text, target } of suppressions) {
    for (const code of suppressedCodes(text, result.metadata.runes)) {
      const warned = result.warnings.some(
        (warning) =>
          warning.code === code.replaceAll("-", "_") &&
          target !== undefined &&
          warning.start !== undefined &&
          warning.start.character >= target.start &&
          warning.start.character < target.end,
      );
      if (!warned) {
        report(comment, "no-unused-svelte-ignore", `Remove the unused svelte-ignore for ${code}.`);
      }
    }
  }
}

interface CompiledSelector {
  readonly rule: SelectorRuleId;
  readonly message: string;
  readonly query: Query;
}

const compiledSelectors = new WeakMap<Policy, readonly CompiledSelector[]>();

/** The selectors of every selector rule the policy turns on, the consumer's first. */
function activeSelectors(policy: Policy): readonly CompiledSelector[] {
  let selectors = compiledSelectors.get(policy);
  if (selectors === undefined) {
    selectors = selectorRuleIds
      .filter((rule) => policy.severity(rule) !== "off")
      .flatMap((rule) =>
        (rule === "restricted-syntax" ? policy.restrictedSyntax : rules[rule].selectors).map(
          ({ selector, message }) => ({ rule, message, query: esquery.parse(selector) }),
        ),
      );
    compiledSelectors.set(policy, selectors);
  }
  return selectors;
}

const domMethods: ReadonlySet<string> = new Set([
  "appendChild",
  "insertBefore",
  "normalize",
  "removeChild",
  "replaceChild",
  "after",
  "append",
  "before",
  "insertAdjacentElement",
  "insertAdjacentHTML",
  "insertAdjacentText",
  "prepend",
  "remove",
  "replaceChildren",
  "replaceWith",
]);
const domProperties: ReadonlySet<string> = new Set([
  "textContent",
  "innerHTML",
  "outerHTML",
  "innerText",
  "outerText",
]);
const timerFunctions: ReadonlySet<string> = new Set(["setTimeout", "setInterval", "execScript"]);
const globalObjects: ReadonlySet<string> = new Set(["window", "globalThis", "self", "global"]);
const specialElements: ReadonlySet<string> = new Set([
  "head",
  "body",
  "window",
  "document",
  "element",
  "options",
]);
const objectLiterals: ReadonlySet<string> = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
  "ClassExpression",
]);

interface DomUse {
  readonly node: MemberExpression;
  readonly name: string;
  readonly owner: Scope | undefined;
}

/** One walk over scripts and template; every rule except no-unused-svelte-ignore reports from here. */
function checkTree(root: AST.Root, policy: Policy, report: Reporter): void {
  const scopes = buildScopes(root);
  const selectors = activeSelectors(policy);
  const bound = new Map<string, Set<Scope | undefined>>();
  const domUses: DomUse[] = [];

  walk<AST.SvelteNode, null>(root, null, {
    StyleSheet() {},
    _(node, { path, next }) {
      // A fragment has no position to report at.
      if (selectors.length > 0 && "start" in node) {
        const ancestry = path.toReversed();
        for (const { rule, message, query } of selectors) {
          if (esquery.matches(node, query, ancestry)) report(node, rule, message);
        }
      }

      switch (node.type) {
        case "HtmlTag":
          report(node, "no-at-html-tags", "Render text or a Svelte component instead of raw HTML.");
          break;
        case "DebugTag":
          report(node, "no-at-debug-tags", "Remove debugging tags before shipping.");
          break;
        case "EachBlock":
          if (!node.key) {
            if (node.context) report(node, "require-each-key", "Give each block a stable key.");
          } else if (!keyReferencesItem(node.key, scopes)) {
            report(
              node.key,
              "valid-each-key",
              "The key must reference this block's item or index.",
            );
          }
          break;
        case "IfBlock":
          if (node.elseif && coveredByEarlierBranch(node, path)) {
            report(
              node.test,
              "no-dupe-else-if-blocks",
              "This condition is already covered by an earlier branch.",
            );
          }
          break;
        case "ExpressionTag":
          if (isInterpolated(path.at(-1)) && objectLiterals.has(node.expression.type)) {
            report(
              node,
              "no-object-in-text-mustaches",
              "Interpolate a display value instead of an object or function.",
            );
          }
          break;
        case "RegularElement":
          if (specialElements.has(node.name)) {
            report(
              node,
              "no-raw-special-elements",
              `Use <svelte:${node.name}> for this special element.`,
            );
          }
          break;
        case "MemberExpression": {
          if (node.object.type !== "Identifier") break;
          const name = propertyName(node);
          const owner = scopes.of(node).owner(node.object.name);
          if (
            node.object.name === "console" &&
            owner === undefined &&
            name !== "warn" &&
            name !== "error"
          ) {
            report(node, "no-console", policy.consoleMessage);
          }
          const parent = path.at(-1);
          const [use, callee] =
            parent?.type === "ChainExpression" ? [path.at(-2), parent] : [parent, node];
          if (
            name !== undefined &&
            ((use?.type === "CallExpression" && use.callee === callee && domMethods.has(name)) ||
              (use?.type === "AssignmentExpression" &&
                use.left === node &&
                domProperties.has(name)))
          ) {
            domUses.push({ node, name: node.object.name, owner });
          }
          break;
        }
        case "CallExpression":
        case "NewExpression": {
          const scope = scopes.of(node);
          if (
            node.callee.type === "Identifier" &&
            node.callee.name === "Function" &&
            !scope.owner("Function")
          ) {
            report(node, "no-new-func", "Do not construct code from strings.");
          }
          if (
            node.type === "CallExpression" &&
            isGlobalTimer(node.callee, scope) &&
            isCodeString(node.arguments[0])
          ) {
            report(node, "no-implied-eval", "Pass a callback instead of a code string.");
          }
          break;
        }
      }

      // Element-like nodes are the ones with both attributes and children.
      if ("attributes" in node && "fragment" in node) checkElement(node, scopes, bound, report);
      next();
    },
  });

  for (const use of domUses) {
    if (bound.get(use.name)?.has(use.owner)) {
      report(
        use.node,
        "no-dom-manipulating",
        "Let Svelte update bound elements instead of changing their DOM structure or text directly.",
      );
    }
  }
}

function checkElement(
  element: AST.ElementLike,
  scopes: Scopes,
  bound: Map<string, Set<Scope | undefined>>,
  report: Reporter,
): void {
  const directives = new Set<string>();
  for (const attribute of element.attributes) {
    if (
      attribute.type === "BindDirective" &&
      attribute.name === "this" &&
      attribute.expression.type === "Identifier" &&
      (element.type === "RegularElement" || element.type === "SvelteElement")
    ) {
      const { name } = attribute.expression;
      const owners = bound.get(name) ?? new Set();
      owners.add(scopes.of(attribute.expression).owner(name));
      bound.set(name, owners);
    }

    if (attribute.type === "OnDirective" || attribute.type === "UseDirective") {
      const modifiers =
        attribute.type === "OnDirective" ? attribute.modifiers.toSorted().join(",") : "";
      const key = `${attribute.type}:${attribute.name}:${modifiers}:${fingerprint(attribute.expression)}`;
      if (directives.has(key)) {
        report(attribute, "no-dupe-directives", "Remove the duplicate event or action directive.");
      }
      directives.add(key);
    }
  }
}

/** Structural identity of an expression: positions and raw spellings ignored, BigInts by value. */
function fingerprint(node: Expression | null): string {
  return JSON.stringify(node, (key, value: unknown) => {
    if (key === "start" || key === "end" || key === "loc" || key === "raw") return undefined;
    return typeof value === "bigint" ? { bigint: value.toString() } : value;
  });
}

/** Whether some reference in the key resolves to the each block's own item or index. */
function keyReferencesItem(key: Expression, scopes: Scopes): boolean {
  const each = scopes.of(key);
  let found = false;
  walk<AST.SvelteNode, null>(key, null, {
    _(node, { next }) {
      if (!isTypeOnly(node)) next();
    },
    Identifier(node, { path, stop }) {
      if (isReference(node, path.at(-1)) && scopes.of(node).owner(node.name) === each) {
        found = true;
        stop();
      }
    },
  });
  return found;
}

/** Text mustaches, and mustaches in an attribute value with more than one part. */
function isInterpolated(parent: AST.SvelteNode | undefined): boolean {
  if (parent?.type === "Fragment") return true;
  return (
    (parent?.type === "Attribute" || parent?.type === "StyleDirective") &&
    Array.isArray(parent.value) &&
    parent.value.length > 1
  );
}

/** The static name of `a.b` or `a["b"]`; undefined for anything computed. */
function propertyName(node: MemberExpression): string | undefined {
  const { property } = node;
  if (!node.computed) return property.type === "Identifier" ? property.name : undefined;
  if (property.type === "Literal" && typeof property.value === "string") return property.value;
  return undefined;
}

/** `setTimeout(...)` or `window.setTimeout(...)` on the global, not a shadowing binding. */
function isGlobalTimer(callee: Expression | Super, scope: Scope): boolean {
  if (callee.type === "Identifier") {
    return timerFunctions.has(callee.name) && !scope.owner(callee.name);
  }
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return false;
  const name = propertyName(callee);
  return (
    globalObjects.has(callee.object.name) &&
    !scope.owner(callee.object.name) &&
    name !== undefined &&
    timerFunctions.has(name)
  );
}

function isCodeString(node: Node | undefined): boolean {
  return (
    node?.type === "TemplateLiteral" || (node?.type === "Literal" && typeof node.value === "string")
  );
}
