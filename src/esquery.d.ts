declare module "esquery" {
  export interface Selector {
    readonly type: string;
  }

  /** esquery reads any object with a string `type`, Svelte's template nodes included. */
  interface Node {
    readonly type: string;
  }

  const esquery: {
    parse(selector: string): Selector;
    matches(node: Node, selector: Selector, ancestry?: readonly Node[]): boolean;
  };
  export default esquery;
}
