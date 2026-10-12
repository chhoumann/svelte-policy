export {};

// Svelte parses scripts and template expressions with acorn, which sets start and end on every
// node, and the modern AST keeps them.
declare module "estree" {
  interface BaseNode {
    start: number;
    end: number;
  }
}
