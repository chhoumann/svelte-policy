import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import esquery from "esquery";
import { isRuleId, rules, type RuleId, type Selector, type Severity } from "./rules";

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

/** A validated config with every default filled in. */
export interface Policy {
  readonly severity: (rule: RuleId) => Severity;
  readonly consoleMessage: string;
  readonly restrictedSyntax: readonly Selector[];
}

const configFileName = "svelte-policy.json";

const severities: readonly unknown[] = ["off", "warn", "error"] satisfies Severity[];

function isSeverity(value: unknown): value is Severity {
  return severities.includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMessage(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Validate a parsed config and fill in the defaults. `source` names the config in errors. */
export function resolvePolicy(config: unknown, source: string): Policy {
  const invalid = (problem: string) => new Error(`${source}: ${problem}`);
  if (!isObject(config)) throw invalid("expected a JSON object.");
  for (const key of Object.keys(config)) {
    if (key !== "rules" && key !== "restrictedSyntax") {
      throw invalid(`unknown key "${key}"; expected "rules" or "restrictedSyntax".`);
    }
  }

  const { rules: settings = {}, restrictedSyntax = [] } = config;
  const overrides = new Map<RuleId, Severity>();
  let consoleMessage = "Use console.warn or console.error instead of other console methods.";
  if (!isObject(settings)) throw invalid('"rules" must be an object.');
  for (const [id, setting] of Object.entries(settings)) {
    if (!isRuleId(id)) throw invalid(`unknown rule "${id}".`);
    if (isSeverity(setting)) {
      overrides.set(id, setting);
    } else if (
      id === "no-console" &&
      isObject(setting) &&
      hasExactKeys(setting, ["severity", "message"]) &&
      isSeverity(setting.severity) &&
      isMessage(setting.message)
    ) {
      overrides.set(id, setting.severity);
      consoleMessage = setting.message;
    } else {
      throw invalid(
        id === "no-console"
          ? `rules["no-console"] must be "off", "warn", "error", or { "severity", "message" }.`
          : `rules["${id}"] must be "off", "warn", or "error".`,
      );
    }
  }

  if (!Array.isArray(restrictedSyntax)) throw invalid('"restrictedSyntax" must be an array.');
  const selectors = restrictedSyntax.map((entry: unknown, index): Selector => {
    if (
      !isObject(entry) ||
      !hasExactKeys(entry, ["selector", "message"]) ||
      !isMessage(entry.selector) ||
      !isMessage(entry.message)
    ) {
      throw invalid(
        `restrictedSyntax[${index}] must be { "selector", "message" } with non-empty strings.`,
      );
    }
    try {
      esquery.parse(entry.selector);
    } catch (error) {
      throw invalid(`restrictedSyntax[${index}].selector does not parse: ${messageOf(error)}`);
    }
    return { selector: entry.selector, message: entry.message };
  });

  return {
    severity: (rule) => overrides.get(rule) ?? rules[rule].severity,
    consoleMessage,
    restrictedSyntax: selectors,
  };
}

const defaultPolicy = resolvePolicy({}, "defaults");
const policiesByFile = new Map<string, Policy>();
const policiesByDirectory = new Map<string, Policy>();

/** The policy from the nearest svelte-policy.json at or above `directory`, or the defaults. */
export function policyFor(directory: string): Policy {
  let policy = policiesByDirectory.get(directory);
  if (policy === undefined) {
    const file = nearestConfig(directory);
    policy = file === undefined ? defaultPolicy : policyFromFile(file);
    policiesByDirectory.set(directory, policy);
  }
  return policy;
}

function nearestConfig(directory: string): string | undefined {
  for (let current = directory; ; current = dirname(current)) {
    const file = join(current, configFileName);
    if (existsSync(file)) return file;
    if (dirname(current) === current) return undefined;
  }
}

function policyFromFile(file: string): Policy {
  let policy = policiesByFile.get(file);
  if (policy === undefined) {
    let config: unknown;
    try {
      config = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${messageOf(error)}`);
    }
    policy = resolvePolicy(config, file);
    policiesByFile.set(file, policy);
  }
  return policy;
}
