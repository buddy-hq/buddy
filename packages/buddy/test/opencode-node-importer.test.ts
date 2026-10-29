import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  createNodeV1ImporterPlugin,
  rewriteV1ImporterForNode,
  V1_IMPORTER_SOURCE_PATH,
} from "../script/opencode-node-importer"

const importerSource = readFileSync(V1_IMPORTER_SOURCE_PATH, "utf8")
const vendorEntry = path.resolve(
  import.meta.dir,
  "../../../vendor/opencode/packages/core/src/database/v1-migration.ts",
)

test("rewrites the real importer for Node: node:crypto hashing, no opencode-next.db branch, no Bun API left", () => {
  const rewritten = rewriteV1ImporterForNode(
    V1_IMPORTER_SOURCE_PATH.replaceAll("/", "\\"),
    importerSource,
  )
  expect(rewritten).toContain('import { createHash } from "node:crypto"')
  expect(rewritten).toContain('createHash("sha256")')
  expect(rewritten).toContain(
    "function nextPath(_options: Options, _data: string): string | undefined {\n  return undefined\n}",
  )
  expect(rewritten).toContain("Buddy does not import opencode-next.db")
  expect(rewritten).not.toContain("Bun.")
  expect(rewritten).not.toContain('import("bun:')
  expect(rewritten).toContain("Migrating sessions")
})

test("rewrites a CRLF checkout of the real importer exactly once and emits LF", () => {
  const source = importerSource.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n")
  const rewritten = rewriteV1ImporterForNode(V1_IMPORTER_SOURCE_PATH, source)

  expect(rewritten.split('import { createHash } from "node:crypto"')).toHaveLength(2)
  expect(rewritten.split('createHash("sha256")')).toHaveLength(2)
  expect(rewritten).toContain(
    "function nextPath(_options: Options, _data: string): string | undefined {\n  return undefined\n}",
  )
  expect(rewritten).toContain("Buddy does not import opencode-next.db")
  expect(rewritten).not.toContain("Bun.")
  expect(rewritten).not.toContain('import("bun:')
  expect(rewritten).not.toContain("\r\n")
})

test("refuses an upstream change to any rewritten snippet, a duplicated snippet, or another file", () => {
  expect(() =>
    rewriteV1ImporterForNode(
      V1_IMPORTER_SOURCE_PATH,
      importerSource.replace('new Bun.CryptoHasher("sha256")', 'new Bun.CryptoHasher("sha512")'),
    ),
  ).toThrow(/found 0/)
  expect(() =>
    rewriteV1ImporterForNode(
      V1_IMPORTER_SOURCE_PATH,
      importerSource.replace(
        'return path.join(data, "opencode-next.db")',
        'return path.join(data, "opencode-preview.db")',
      ),
    ),
  ).toThrow(/found 0/)
  expect(() =>
    rewriteV1ImporterForNode(
      V1_IMPORTER_SOURCE_PATH,
      `${importerSource}\nconst again = new Bun.CryptoHasher("sha256")\n`,
    ),
  ).toThrow(/found 2/)
  expect(() =>
    rewriteV1ImporterForNode(
      path.join(path.dirname(V1_IMPORTER_SOURCE_PATH), "v1-migration.noop.ts"),
      importerSource,
    ),
  ).toThrow(/unexpected file/)
  expect(() =>
    rewriteV1ImporterForNode(
      V1_IMPORTER_SOURCE_PATH,
      `${importerSource}\nconst leak = Bun.file("x")\n`,
    ),
  ).toThrow(/Bun runtime API/)
})

test("a Node bundle resolves #v1-migration to the real importer exactly once, and a build without the plugin is caught", async () => {
  const outdir = mkdtempSync(path.join(os.tmpdir(), "buddy-node-importer-"))
  try {
    const entry = path.join(outdir, "entry.ts")
    writeFileSync(entry, `export { V1Migration } from ${JSON.stringify(vendorEntry)}\n`)
    const withPlugin = createNodeV1ImporterPlugin()
    const built = await Bun.build({
      entrypoints: [entry],
      outdir: path.join(outdir, "with"),
      target: "node",
      format: "esm",
      conditions: ["node"],
      packages: "external",
      plugins: [withPlugin.plugin],
    })
    expect(built.success).toBe(true)
    expect(() => withPlugin.assertApplied()).not.toThrow()
    const bundled = await Bun.file(path.join(outdir, "with", "entry.js")).text()
    expect(bundled).toContain("Migrating sessions")
    expect(bundled).toContain("createHash")
    expect(bundled).not.toContain("CryptoHasher")

    const withoutPlugin = createNodeV1ImporterPlugin()
    const plain = await Bun.build({
      entrypoints: [entry],
      outdir: path.join(outdir, "without"),
      target: "node",
      format: "esm",
      conditions: ["node"],
      packages: "external",
    })
    expect(plain.success).toBe(true)
    expect(await Bun.file(path.join(outdir, "without", "entry.js")).text()).not.toContain(
      "Migrating sessions",
    )
    expect(() => withoutPlugin.assertApplied()).toThrow(/resolved 0, loaded 0/)
  } finally {
    rmSync(outdir, { recursive: true, force: true })
  }
})

test("the Bun development preload does not install the Node importer rewrite", () => {
  const preload = readFileSync(
    path.resolve(import.meta.dir, "../src/dev/opencode-branding-preload.ts"),
    "utf8",
  )
  expect(preload).not.toContain("opencode-node-importer")
  expect(preload).not.toContain("NodeV1Importer")
})
