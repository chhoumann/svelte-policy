import type { Expression, Literal, PrivateIdentifier } from "estree";
import type { AST } from "svelte/compiler";

/** Flatten a chain of one logical operator into its operands. */
function operands(node: Expression, operator: "&&" | "||"): Expression[] {
  return node.type === "LogicalExpression" && node.operator === operator
    ? [...operands(node.left, operator), ...operands(node.right, operator)]
    : [node];
}

/** Literals compare by type and value: `'a'` equals `"a"`, `0x1n` equals `1n`, `1n` differs from `1`. */
function literalKey(node: Literal): string {
  if ("regex" in node) return `/${node.regex.pattern}/${node.regex.flags}`;
  if ("bigint" in node) return `${node.bigint}n`;
  return typeof node.value === "string" ? JSON.stringify(node.value) : String(node.value);
}

/**
 * A key for a condition built from identifiers, literals, `!`, `&&`, `||`, `===`, and `!==`, with
 * logical operands sorted. Null when a part could change between branch evaluations: calls,
 * property reads, assignments, and coercing operators.
 */
function canonical(node: Expression | PrivateIdentifier): string | null {
  switch (node.type) {
    case "Identifier":
      return node.name;
    case "Literal":
      return literalKey(node);
    case "UnaryExpression": {
      const argument = node.operator === "!" ? canonical(node.argument) : null;
      return argument === null ? null : `!${argument}`;
    }
    case "BinaryExpression": {
      if (node.operator !== "===" && node.operator !== "!==") return null;
      const left = canonical(node.left);
      const right = canonical(node.right);
      return left === null || right === null ? null : `(${left} ${node.operator} ${right})`;
    }
    case "LogicalExpression": {
      const parts = node.operator === "??" ? null : keys(operands(node, node.operator));
      return parts && `(${parts.toSorted(byCodeUnit).join(` ${node.operator} `)})`;
    }
    default:
      return null;
  }
}

/** The keys of every node, or null when one is unstable. */
function keys(nodes: Expression[]): string[] | null {
  const result: string[] = [];
  for (const node of nodes) {
    const key = canonical(node);
    if (key === null) return null;
    result.push(key);
  }
  return result;
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The `||` alternatives of a test, each as the keys of its `&&` operands; null when the test is unstable. */
function alternatives(test: Expression): string[][] | null {
  const terms: string[][] = [];
  for (const term of operands(test, "||")) {
    const parts = keys(operands(term, "&&"));
    if (parts === null) return null;
    terms.push(parts);
  }
  return terms;
}

/** Tests of the earlier branches in this else-if chain. An else-if is the sole child of the parent's `alternate`. */
function earlierTests(block: AST.IfBlock, path: readonly AST.SvelteNode[]): Expression[] {
  const tests: Expression[] = [];
  let current = block;
  for (let index = path.length - 1; current.elseif && index >= 1; index -= 2) {
    const fragment = path[index];
    const parent = path[index - 1];
    if (parent?.type !== "IfBlock" || parent.alternate !== fragment) break;
    tests.push(parent.test);
    current = parent;
  }
  return tests;
}

/**
 * ESLint's no-dupe-else-if over canonical keys: the test, or one of its `&&` operands, is covered
 * when each of its alternatives contains every part of some earlier alternative. A chain with any
 * unstable test is skipped as a whole.
 */
export function coveredByEarlierBranch(
  block: AST.IfBlock,
  path: readonly AST.SvelteNode[],
): boolean {
  if (alternatives(block.test) === null) return false;
  const priors: string[][] = [];
  for (const test of earlierTests(block, path)) {
    const terms = alternatives(test);
    if (terms === null) return false;
    priors.push(...terms);
  }
  const implied = (term: string[]) =>
    priors.some((prior) => prior.every((part) => term.includes(part)));
  const { test } = block;
  const candidates =
    test.type === "LogicalExpression" && test.operator === "&&"
      ? [test, ...operands(test, "&&")]
      : [test];
  return candidates.some((candidate) => alternatives(candidate)?.every(implied) === true);
}
