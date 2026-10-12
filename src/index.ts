import { dirname, resolve } from "node:path";
import { check } from "./check";
import { policyFor, resolvePolicy } from "./config";
import type { Config, Diagnostic } from "./types";

export type { Config, Diagnostic };

/**
 * Check one Svelte component. Without `config`, the nearest svelte-policy.json at or above the
 * component's directory applies, or the defaults when there is none. An explicit `config` is
 * validated the same way and skips the file system.
 */
export function checkSvelte(
  source: string,
  filename = "Component.svelte",
  config?: Config,
): Diagnostic[] {
  const policy =
    config === undefined
      ? policyFor(dirname(resolve(filename)))
      : resolvePolicy(config, "svelte-policy config");
  return check(source, filename, policy);
}
