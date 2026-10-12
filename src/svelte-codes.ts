// Svelte does not export these lists. tests/svelte-codes.test.ts fails when the installed Svelte's
// copies differ.

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
