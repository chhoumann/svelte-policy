declare module "esquery" {
  export interface Query {
    readonly type: string;
  }

  /** esquery reads any object with a string `type`, Svelte's template nodes included. */
  interface Node {
    readonly type: string;
  }

  const esquery: {
    parse(selector: string): Query;
    matches(node: Node, query: Query, ancestry?: readonly Node[]): boolean;
  };
  export default esquery;
}
