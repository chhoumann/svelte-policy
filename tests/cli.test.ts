import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

const cli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "svelte-policy-cli-")));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(cwd: string, ...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status, stdout, stderr };
}

it("prints each diagnostic and a summary for src, and exits 1 on an error", () => {
  const root = project({
    "src/b/Debug.svelte": "{@debug value}",
    "src/a/Html.svelte": "<p>X</p>\n{@html html}",
    "src/node_modules/dep/Html.svelte": "{@html html}",
    "src/notes.md": "{@html html}",
  });
  expect(run(root)).toEqual({
    status: 1,
    stdout: [
      `${root}/src/a/Html.svelte:2:1 error no-at-html-tags: Render text or a Svelte component instead of raw HTML.`,
      `${root}/src/b/Debug.svelte:1:1 warning no-at-debug-tags: Remove debugging tags before shipping.`,
      "Svelte policies: 1 errors, 1 warnings.",
      "",
    ].join("\n"),
    stderr: "",
  });
});

it("exits 0 when there are only warnings", () => {
  const root = project({ "src/Debug.svelte": "{@debug value}" });
  expect(run(root).status).toBe(0);
});

it("checks the files and directories it is given, each with its nearest config", () => {
  const root = project({
    "app/Html.svelte": "{@html html}",
    "legacy/svelte-policy.json": JSON.stringify({ rules: { "no-at-html-tags": "off" } }),
    "legacy/Html.svelte": "{@html html}",
    "other/Html.svelte": "{@html html}",
  });
  expect(run(root, "legacy", "app/Html.svelte")).toEqual({
    status: 1,
    stdout: [
      `${root}/app/Html.svelte:1:1 error no-at-html-tags: Render text or a Svelte component instead of raw HTML.`,
      "Svelte policies: 1 errors, 0 warnings.",
      "",
    ].join("\n"),
    stderr: "",
  });
});

it("exits 2 without a summary on a config error", () => {
  const root = project({
    "svelte-policy.json": JSON.stringify({ rules: { "no-foo": "error" } }),
    "src/Clean.svelte": "<p>X</p>",
  });
  expect(run(root)).toEqual({
    status: 2,
    stdout: "",
    stderr: `svelte-policy: ${root}/svelte-policy.json: unknown rule "no-foo".\n`,
  });
});

it("exits 2 on a missing path or an option", () => {
  const root = project({ "src/Clean.svelte": "<p>X</p>" });
  expect(run(root, "missing")).toMatchObject({ status: 2, stdout: "" });
  expect(run(root, "missing").stderr).toMatch(/^svelte-policy: ENOENT: no such file or directory/);
  expect(run(root, "--fix")).toMatchObject({ status: 2, stdout: "" });
  expect(run(root, "--fix").stderr).toMatch(/^svelte-policy: Unknown option '--fix'/);
});
