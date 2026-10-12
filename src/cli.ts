#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkSvelte } from "./index";

function componentFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : componentFiles(child);
    return entry.name.endsWith(".svelte") ? [child] : [];
  });
}

function main(args: string[]): number {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  const paths = positionals.length > 0 ? positionals : ["src"];
  const files = [...new Set(paths.flatMap((path) => componentFiles(resolve(path))))].sort();
  const diagnostics = files.flatMap((file) => checkSvelte(readFileSync(file, "utf8"), file));
  for (const { filename, line, column, severity, rule, message } of diagnostics) {
    console.log(`${filename}:${line}:${column} ${severity} ${rule}: ${message}`);
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  console.log(`Svelte policies: ${errors} errors, ${diagnostics.length - errors} warnings.`);
  return errors > 0 ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`svelte-policy: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
