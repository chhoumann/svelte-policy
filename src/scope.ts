import type {
  ArrowFunctionExpression,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  Node,
  VariableDeclaration,
} from "estree";
import type { AST } from "svelte/compiler";
import { walk } from "zimmerframe";

/** How a name was declared. A `const` keeps its initializer when it binds the name directly. */
export type Binding =
  | { readonly kind: "const"; readonly init: Expression | null }
  | {
      readonly kind:
        | Exclude<VariableDeclaration["kind"], "const">
        | "function"
        | "class"
        | "import"
        | "parameter"
        | "template";
    };

export class Scope {
  readonly #bindings = new Map<string, Binding>();

  constructor(
    readonly parent: Scope | undefined,
    /** Where `var` lands: a function body, a static block, or a script. */
    readonly isVarTarget: boolean,
  ) {}

  child(isVarTarget = false): Scope {
    return new Scope(this, isVarTarget);
  }

  declare(name: string, binding: Binding): void {
    this.#bindings.set(name, binding);
  }

  declareVar(name: string): void {
    if (this.isVarTarget || !this.parent) this.declare(name, { kind: "var" });
    else this.parent.declareVar(name);
  }

  /** The scope that declares `name`, or undefined when `name` is a global. */
  owner(name: string): Scope | undefined {
    return this.#bindings.has(name) ? this : this.parent?.owner(name);
  }

  /** The binding `name` resolves to, or undefined when `name` is a global. */
  lookup(name: string): Binding | undefined {
    const owner = this.owner(name);
    return owner && owner.#bindings.get(name);
  }
}

export interface Scopes {
  /** The scope `node` is resolved in. */
  of(node: AST.SvelteNode): Scope;
}

interface State {
  readonly scope: Scope;
}

type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

function isFunction(node: AST.SvelteNode | undefined): node is FunctionNode {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  );
}

/**
 * Records the scope every node of the component is resolved in. Every declaration is made in
 * this pass, so a later lookup sees hoisted names. The module script's scope is the parent of
 * the instance script's, which is the parent of the template's.
 */
export function buildScopes(root: AST.Root): Scopes {
  const scopes = new Map<AST.SvelteNode, Scope>();
  const letScopes = new Map<AST.Fragment, Scope>();
  const module = new Scope(undefined, true);
  const instance = module.child(true);

  const declare = (scope: Scope, pattern: Node | null, binding: Binding) => {
    for (const name of patternNames(pattern)) scope.declare(name, binding);
  };

  function enterFunction(node: FunctionNode, scope: Scope, next: (state: State) => void): void {
    const params = scope.child();
    if (node.type === "FunctionExpression" && node.id) {
      params.declare(node.id.name, { kind: "function" });
    }
    for (const param of node.params) declare(params, param, { kind: "parameter" });
    next({ scope: params });
  }

  walk<AST.SvelteNode, State>(
    root,
    { scope: instance },
    {
      _(node, { state, next }) {
        scopes.set(node, state.scope);
        // `let:` directives bind names in the element's children only.
        if ("attributes" in node && "fragment" in node) {
          for (const attribute of node.attributes) {
            if (attribute.type !== "LetDirective") continue;
            const scope = letScopes.get(node.fragment) ?? state.scope.child();
            if (attribute.expression) declare(scope, attribute.expression, { kind: "template" });
            else scope.declare(attribute.name, { kind: "template" });
            letScopes.set(node.fragment, scope);
          }
        }
        next();
      },
      Root(node, { visit }) {
        if (node.module) visit(node.module, { scope: module });
        if (node.instance) visit(node.instance, { scope: instance });
        visit(node.fragment, { scope: instance });
      },
      Fragment(node, { state, next }) {
        next({ scope: letScopes.get(node) ?? state.scope.child() });
      },
      ImportDeclaration(node, { state, next }) {
        for (const specifier of node.specifiers) {
          state.scope.declare(specifier.local.name, { kind: "import" });
        }
        next();
      },
      VariableDeclaration(node, { state, next }) {
        for (const declarator of node.declarations) {
          if (node.kind === "var") {
            for (const name of patternNames(declarator.id)) state.scope.declareVar(name);
          } else if (node.kind === "const") {
            const init = declarator.id.type === "Identifier" ? (declarator.init ?? null) : null;
            declare(state.scope, declarator.id, { kind: "const", init });
          } else {
            declare(state.scope, declarator.id, { kind: node.kind });
          }
        }
        next();
      },
      FunctionDeclaration(node, { state, next }) {
        if (node.id) state.scope.declare(node.id.name, { kind: "function" });
        enterFunction(node, state.scope, next);
      },
      FunctionExpression(node, { state, next }) {
        enterFunction(node, state.scope, next);
      },
      ArrowFunctionExpression(node, { state, next }) {
        enterFunction(node, state.scope, next);
      },
      // Parameters and the body are separate scopes, so a parameter default cannot see a body `var`.
      BlockStatement(node, { state, path, next }) {
        const parent = path.at(-1);
        next({ scope: state.scope.child(isFunction(parent) && parent.body === node) });
      },
      ClassDeclaration(node, { state, next }) {
        if (node.id) state.scope.declare(node.id.name, { kind: "class" });
        next();
      },
      ClassExpression(node, { state, next }) {
        if (!node.id) {
          next();
          return;
        }
        const scope = state.scope.child();
        scope.declare(node.id.name, { kind: "class" });
        next({ scope });
      },
      StaticBlock(_node, { state, next }) {
        next({ scope: state.scope.child(true) });
      },
      SwitchStatement(node, { state, visit }) {
        visit(node.discriminant, state);
        const scope = state.scope.child();
        for (const branch of node.cases) visit(branch, { scope });
      },
      ForStatement(_node, { state, next }) {
        next({ scope: state.scope.child() });
      },
      ForInStatement(_node, { state, next }) {
        next({ scope: state.scope.child() });
      },
      ForOfStatement(_node, { state, next }) {
        next({ scope: state.scope.child() });
      },
      CatchClause(node, { state, next }) {
        const scope = state.scope.child();
        declare(scope, node.param, { kind: "parameter" });
        next({ scope });
      },
      EachBlock(node, { state, visit }) {
        visit(node.expression, state);
        const scope = state.scope.child();
        declare(scope, node.context, { kind: "template" });
        if (node.index) scope.declare(node.index, { kind: "template" });
        if (node.context) visit(node.context, { scope });
        if (node.key) visit(node.key, { scope });
        visit(node.body, { scope });
        if (node.fallback) visit(node.fallback, state);
      },
      AwaitBlock(node, { state, visit }) {
        visit(node.expression, state);
        if (node.pending) visit(node.pending, state);
        for (const [pattern, branch] of [
          [node.value, node.then],
          [node.error, node.catch],
        ] as const) {
          const scope = state.scope.child();
          declare(scope, pattern, { kind: "template" });
          if (pattern) visit(pattern, { scope });
          if (branch) visit(branch, { scope });
        }
      },
      SnippetBlock(node, { state, visit }) {
        state.scope.declare(node.expression.name, { kind: "template" });
        visit(node.expression, state);
        const scope = state.scope.child();
        for (const parameter of node.parameters) {
          declare(scope, parameter, { kind: "template" });
          visit(parameter, { scope });
        }
        visit(node.body, { scope });
      },
    },
  );

  return {
    of(node) {
      const scope = scopes.get(node);
      if (!scope) throw new Error(`svelte-policy: no scope recorded for a ${node.type} node.`);
      return scope;
    },
  };
}

/** Names bound by a pattern. `let:` directive values parse as expressions, hence the expression cases. */
export function patternNames(node: Node | null): string[] {
  switch (node?.type) {
    case "Identifier":
      return [node.name];
    case "RestElement":
    case "SpreadElement":
      return patternNames(node.argument);
    case "AssignmentPattern":
      return patternNames(node.left);
    case "ArrayPattern":
    case "ArrayExpression":
      return node.elements.flatMap((element) => patternNames(element));
    case "ObjectPattern":
    case "ObjectExpression":
      return node.properties.flatMap((property) =>
        patternNames(property.type === "Property" ? property.value : property),
      );
    default:
      return [];
  }
}

const runtimeTypeScript: ReadonlySet<string> = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSInstantiationExpression",
  "TSTypeAssertion",
]);

/** TypeScript syntax that only names types. Svelte's parser keeps it in the AST. */
export function isTypeOnly(node: { readonly type: string }): boolean {
  return node.type.startsWith("TS") && !runtimeTypeScript.has(node.type);
}

/** Whether an identifier reads a binding, as opposed to naming a property, label, or export. */
export function isReference(node: Identifier, parent: AST.SvelteNode | undefined): boolean {
  switch (parent?.type) {
    case "MemberExpression":
      return parent.computed || parent.object === node;
    case "Property":
    case "PropertyDefinition":
      return parent.computed || parent.value === node;
    case "MethodDefinition":
      return parent.computed;
    case "ImportSpecifier":
    case "ExportSpecifier":
      return parent.local === node;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "MetaProperty":
      return false;
    default:
      return true;
  }
}
