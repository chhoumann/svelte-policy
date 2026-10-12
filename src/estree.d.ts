export {};

// Svelte parses scripts and template expressions with acorn, which sets start and end on every
// node and comment, and the modern AST keeps them.
declare module "estree" {
  interface BaseNode {
    start: number;
    end: number;
  }
  interface Comment {
    start: number;
    end: number;
  }

  // In `lang="ts"` components, acorn-typescript keeps these around values. Svelte strips them, so
  // each evaluates to its `expression`.
  interface TypeScriptValue<Type extends string> extends BaseExpression {
    type: Type;
    expression: Expression;
  }
  interface ExpressionMap {
    TSAsExpression: TypeScriptValue<"TSAsExpression">;
    TSSatisfiesExpression: TypeScriptValue<"TSSatisfiesExpression">;
    TSNonNullExpression: TypeScriptValue<"TSNonNullExpression">;
    TSTypeAssertion: TypeScriptValue<"TSTypeAssertion">;
  }

  // acorn-typescript marks the imports and declarations that exist only for the type checker.
  interface ImportDeclaration {
    importKind?: "type" | "value";
  }
  interface ImportSpecifier {
    importKind?: "type" | "value";
  }
  interface VariableDeclaration {
    declare?: boolean;
  }
  interface ClassDeclaration {
    declare?: boolean;
  }
}
