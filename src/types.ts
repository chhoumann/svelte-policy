import type { RuleId, Selector, Severity } from "./rules";

// The public types live apart from the modules that import esquery, because the bundled
// declarations keep every package import of each module they include.

/** The shape of svelte-policy.json. */
export interface Config {
  readonly rules?: {
    readonly [Id in RuleId]?: Id extends "no-console"
      ? Severity | { readonly severity: Severity; readonly message: string }
      : Severity;
  };
  /** Selectors reported under `restricted-syntax`, in components and by the oxlint plugin. */
  readonly restrictedSyntax?: readonly Selector[];
}

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
