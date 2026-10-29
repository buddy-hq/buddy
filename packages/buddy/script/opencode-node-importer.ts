import path from "node:path"
import type { BunPlugin } from "bun"

type Rewrite = {
  readonly original: string
  readonly replacement: string
}

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
export const V1_IMPORTER_SOURCE_PATH = path
  .join(repositoryRoot, "vendor/opencode/packages/core/src/database/v1-migration.bun.ts")
  .replaceAll("\\", "/")

const importerRewrites: readonly Rewrite[] = [
  {
    original: 'import { existsSync } from "node:fs"\n',
    replacement: 'import { existsSync } from "node:fs"\nimport { createHash } from "node:crypto"\n',
  },
  {
    original: 'new Bun.CryptoHasher("sha256")',
    replacement: 'createHash("sha256")',
  },
  {
    original: [
      "function nextPath(options: Options, data: string) {",
      "  if (options.nextDatabasePath) return options.nextDatabasePath",
      '  if (process.env.OPENCODE_DB === ":memory:") return undefined',
      '  return path.join(data, "opencode-next.db")',
      "}",
    ].join("\n"),
    replacement:
      "function nextPath(_options: Options, _data: string): string | undefined {\n  return undefined\n}",
  },
  {
    original: [
      '      const sqlite = yield* Effect.promise(() => import("bun:sqlite"))',
      "      return new sqlite.Database(sourcePath, { readonly: true, strict: true })",
    ].join("\n"),
    replacement:
      "      return yield* Effect.die(new Error(`Buddy does not import opencode-next.db: ${sourcePath}`))",
  },
]

export function rewriteV1ImporterForNode(file: string, source: string): string {
  source = source.replaceAll("\r\n", "\n")
  const resolved = path.resolve(file.replaceAll("\\", "/")).replaceAll("\\", "/")
  if (resolved !== V1_IMPORTER_SOURCE_PATH)
    throw new Error(`OpenCode v1 importer: unexpected file ${resolved}`)
  let contents = source
  for (const { original, replacement } of importerRewrites) {
    const matches = source.split(original).length - 1
    if (matches !== 1) {
      throw new Error(
        `OpenCode v1 importer: ${resolved} expected exactly one occurrence of ${JSON.stringify(original)}; found ${matches}`,
      )
    }
    contents = contents.replace(original, () => replacement)
  }
  if (contents.includes("Bun.") || contents.includes('import("bun:')) {
    throw new Error(
      `OpenCode v1 importer: ${resolved} still uses a Bun runtime API after rewriting`,
    )
  }
  return contents
}

export function createNodeV1ImporterPlugin() {
  let resolved = 0
  let loaded = 0
  const plugin: BunPlugin = {
    name: "buddy:opencode-node-v1-importer",
    setup(build) {
      build.onResolve({ filter: /^#v1-migration$/u }, () => {
        resolved += 1
        return { path: V1_IMPORTER_SOURCE_PATH }
      })
      build.onLoad(
        { filter: /[\\/]core[\\/]src[\\/]database[\\/]v1-migration\.bun\.ts$/u },
        async (args) => {
          loaded += 1
          return {
            contents: rewriteV1ImporterForNode(args.path, await Bun.file(args.path).text()),
            loader: "ts",
          }
        },
      )
    },
  }
  return {
    plugin,
    assertApplied() {
      if (resolved === 0 || loaded !== 1) {
        throw new Error(
          `OpenCode v1 importer was not bundled for Node exactly once (resolved ${resolved}, loaded ${loaded})`,
        )
      }
    },
  }
}
