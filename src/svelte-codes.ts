// Svelte's public entry points export neither list. tests/svelte-codes.test.ts fails when the
// installed Svelte's copies differ.

/**
 * Svelte 4 warning codes and the Svelte 5 codes a svelte-ignore in a legacy component also
 * suppresses for them, from src/compiler/utils/extract_svelte_ignore.js.
 */
export const replacements: ReadonlyMap<string, string> = new Map([
  ["non-top-level-reactive-declaration", "reactive_declaration_invalid_placement"],
  ["module-script-reactive-declaration", "reactive_declaration_module_script"],
  ["empty-block", "block_empty"],
  ["avoid-is", "attribute_avoid_is"],
  ["invalid-html-attribute", "attribute_invalid_property_name"],
  ["a11y-structure", "a11y_figcaption_parent"],
  ["illegal-attribute-character", "attribute_illegal_colon"],
  ["invalid-rest-eachblock-binding", "bind_invalid_each_rest"],
  ["unused-export-let", "export_let_unused"],
]);

/**
 * Warnings that Svelte emits at runtime, so a compile cannot show whether a svelte-ignore for one
 * is used. From src/constants.js.
 */
export const runtimeWarnings: ReadonlySet<string> = new Set([
  "await_waterfall",
  "await_reactivity_loss",
  "state_snapshot_uncloneable",
  "binding_property_non_reactive",
  "hydration_attribute_changed",
  "hydration_html_changed",
  "ownership_invalid_binding",
  "ownership_invalid_mutation",
]);
