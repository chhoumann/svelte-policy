import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";

it("emits type declarations that reference no other package", () => {
  const dist = new URL("../dist/", import.meta.url);
  const specifiers = readdirSync(dist)
    .filter((file) => file.endsWith(".d.mts"))
    .flatMap((file) =>
      [
        ...readFileSync(new URL(file, dist), "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g),
      ].map(([, specifier]) => `${file}: ${specifier}`),
    );
  expect(specifiers.length).toBeGreaterThan(0);
  expect(specifiers.filter((specifier) => !specifier.includes(": ./"))).toEqual([]);
});
