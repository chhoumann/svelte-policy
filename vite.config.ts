import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    clean: true,
    dts: {
      resolver: "tsc",
    },
    entry: ["src/index.ts", "src/oxlint.ts"],
    exports: false,
    fixedExtension: true,
    format: ["esm"],
    platform: "node",
    sourcemap: true,
    target: ["node20.19"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    globalSetup: ["tests/pack.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
