import { createHash } from "node:crypto"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import type { BunPlugin } from "bun"
import {
  OPENCODE_CHANNEL_DEFINE,
  readBuddyReleaseChannel,
  resolveOpenCodeChannelForBuddyChannel,
} from "@buddy/script/channel"
import { OPENCODE_VERSION } from "@buddy/opencode-adapter/host"
import {
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
  CHEMFIG_TEX_ASSET_FILENAMES,
  CHEMFIG_TEX_DIRECTORY_NAME,
} from "@buddy/script/chemfig-runtime"
import {
  BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE,
  computeAdvancedMathRuntimeVersion,
} from "../src/local-runtimes/advanced-math/version"
import { baselineRuntimeArchive, resolveCompiledBackendTarget } from "./compiled-backend-target"
import { opencodeBrandingPlugin } from "./opencode-branding"

const backendDirectory = path.resolve(import.meta.dir, "..")
const outputDirectory = path.join(backendDirectory, "dist/backend")
const executable = path.join(
  outputDirectory,
  process.platform === "win32" ? "buddy-backend.exe" : "buddy-backend",
)
const require = createRequire(import.meta.url)
const coreRequire = createRequire(
  path.resolve(backendDirectory, "../../vendor/opencode/packages/core/package.json"),
)
const channel = resolveOpenCodeChannelForBuddyChannel(readBuddyReleaseChannel())
const advancedMathVersion = computeAdvancedMathRuntimeVersion()
const inputs = new Set<string>()

const target = resolveCompiledBackendTarget({
  host: { platform: process.platform, arch: process.arch },
  requested: {
    platform: process.env.BUDDY_BACKEND_TARGET_PLATFORM,
    arch: process.env.BUDDY_BACKEND_TARGET_ARCH,
  },
})
const watcherPackage = `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? "-glibc" : ""}`
const ptyRequire = createRequire(coreRequire.resolve("@opencode-ai/pty/package.json"))
const ptySource =
  process.platform === "darwin" || process.platform === "linux"
    ? ptyRequire.resolve(
        `@opencode-ai/pty-${process.platform}-${process.arch}${process.platform === "linux" ? "-gnu" : ""}/bin/opencode-pty`,
      )
    : undefined
const ptyVersion = JSON.parse(
  readFileSync(coreRequire.resolve("@opencode-ai/pty/package.json"), "utf8"),
).version

const runtimeAssetsPlugin: BunPlugin = {
  name: "buddy:compiled-runtime-assets",
  setup(build) {
    build.onLoad({ filter: /@parcel[/\\]watcher[/\\]index\.js$/u }, () => ({
      contents: `const { createWrapper } = require("./wrapper"); module.exports = createWrapper(require(${JSON.stringify(watcherPackage)}));`,
      loader: "js",
    }))
    build.onLoad({ filter: /filesystem[/\\]watcher-binding\.ts$/u }, () => ({
      contents: `export default () => require(${JSON.stringify(watcherPackage)})`,
      loader: "js",
    }))
    build.onLoad({ filter: /persistent-pty[/\\]pty-binding\.ts$/u }, () => ({
      contents: ptySource
        ? `import file from ${JSON.stringify(ptySource)} with { type: "file" }; export default { path: file, version: ${JSON.stringify(ptyVersion)}, sha256: ${JSON.stringify(createHash("sha256").update(readFileSync(ptySource)).digest("hex"))} }`
        : "export default undefined",
      loader: "js",
    }))
    build.onLoad({ filter: /@chonkiejs[/\\]chunk[/\\]index\.js$/u }, async (args) => {
      const source = await Bun.file(args.path).text()
      const original = "join(__dirname, 'pkg', 'chonkiejs_chunk_bg.wasm')"
      if (!source.includes(original)) throw new Error("Chonkie WASM asset location changed")
      return {
        loader: "js",
        contents: `import embeddedWasm from "./pkg/chonkiejs_chunk_bg.wasm" with { type: "file" };\n${source.replace(original, "embeddedWasm")}`,
      }
    })
    build.onLoad(
      { filter: /jsdom[/\\]living[/\\]xhr[/\\]XMLHttpRequest-impl\.js$/u },
      async (args) => {
        const source = await Bun.file(args.path).text()
        const original =
          'const syncWorkerFile = require.resolve ? require.resolve("./xhr-sync-worker.js") : null;'
        if (!source.includes(original)) throw new Error("jsdom synchronous worker location changed")
        return { contents: source.replace(original, "const syncWorkerFile = null;"), loader: "js" }
      },
    )
    build.onLoad({ filter: /@llamaindex[/\\]liteparse[/\\]dist[/\\]native\.js$/u }, (args) => {
      const liteparseRequire = createRequire(args.path)
      const suffix =
        process.platform === "win32" ? "-msvc" : process.platform === "linux" ? "-gnu" : ""
      const binding = liteparseRequire.resolve(
        `@llamaindex/liteparse-${process.platform}-${process.arch}${suffix}`,
      )
      const libraryName =
        process.platform === "darwin"
          ? "libpdfium.dylib"
          : process.platform === "win32"
            ? "pdfium.dll"
            : "libpdfium.so"
      const library = path.join(path.dirname(binding), libraryName)
      if (!existsSync(library)) throw new Error(`LiteParse PDFium library missing: ${library}`)
      return {
        loader: "js",
        contents: `import binding from ${JSON.stringify(binding)} with { type: "file" };
import pdfium from ${JSON.stringify(library)} with { type: "file" };
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { cacheLiteparseNativeFiles } from ${JSON.stringify(path.join(backendDirectory, "src/resources/liteparse-native-cache.ts"))};
const bindingPath = cacheLiteparseNativeFiles({
  binding: readFileSync(binding),
  pdfium: readFileSync(pdfium),
  libraryName: ${JSON.stringify(libraryName)},
});
export const native = createRequire(import.meta.url)(bindingPath);`,
      }
    })
    build.onLoad({ filter: /[/\\]core[/\\]src[/\\].*\.(?:bun|node|noop)\.ts$/u }, (args) => {
      inputs.add(args.path.replaceAll("\\", "/"))
    })
  },
}

async function downloadBaselineRuntime(directory: string): Promise<string | undefined> {
  const archive = baselineRuntimeArchive(target, Bun.version)
  if (!archive) return undefined
  const [download, checksums] = await Promise.all([
    fetch(archive.archiveURL),
    fetch(archive.checksumsURL),
  ])
  if (!download.ok) throw new Error(`Could not download ${archive.name}: ${download.status}`)
  if (!checksums.ok) throw new Error(`Could not download Bun checksums: ${checksums.status}`)
  const expected = (await checksums.text())
    .split("\n")
    .find((line) => line.trimEnd().endsWith(`  ${archive.name}.zip`))
    ?.split(/\s+/u)[0]
  if (!expected) throw new Error(`Bun checksums do not list ${archive.name}.zip`)
  const bytes = new Uint8Array(await download.arrayBuffer())
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error(`Checksum mismatch for ${archive.name}.zip`)
  const zip = path.join(directory, `${archive.name}.zip`)
  await Bun.write(zip, bytes)
  const extract =
    process.platform === "win32"
      ? [
          "powershell.exe",
          "-NoProfile",
          "-Command",
          `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${directory}'`,
        ]
      : ["unzip", "-oq", zip, "-d", directory]
  const extraction = Bun.spawnSync(extract, { stdout: "inherit", stderr: "inherit" })
  if (!extraction.success) throw new Error(`Could not extract ${archive.name}.zip`)
  return path.join(directory, archive.executable)
}

process.chdir(backendDirectory)
rmSync(outputDirectory, { recursive: true, force: true })
mkdirSync(outputDirectory, { recursive: true })
const runtimeDirectory = mkdtempSync(path.join(os.tmpdir(), "buddy-bun-runtime-"))
const executablePath = await downloadBaselineRuntime(runtimeDirectory)

const compile: Bun.CompileBuildOptions = {
  target,
  outfile: executable,
  autoloadBunfig: false,
  autoloadDotenv: false,
  autoloadTsconfig: true,
  autoloadPackageJson: true,
  execArgv: ["--smol", "--use-system-ca", "--no-warnings", "--"],
  windows: {},
}
if (executablePath) compile.executablePath = executablePath

const result = await Bun.build({
  entrypoints: [
    "./src/index.ts",
    "./src/resources/pdf-validation-worker.ts",
    "./src/resource-packs/spreadsheet-parser-worker.ts",
  ],
  tsconfig: "./tsconfig.json",
  plugins: [opencodeBrandingPlugin, runtimeAssetsPlugin],
  external: ["node-gyp"],
  format: "esm",
  minify: true,
  bytecode: true,
  sourcemap: "none",
  splitting: true,
  loader: { ".md": "text", ".wasm": "file" },
  compile,
  define: {
    BUDDY_COMPILED_BACKEND: "true",
    [BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE]: JSON.stringify(advancedMathVersion),
    OPENCODE_VERSION: JSON.stringify(OPENCODE_VERSION),
    [OPENCODE_CHANNEL_DEFINE]: JSON.stringify(channel),
    OPENCODE_LIBC: process.platform === "linux" ? '"glibc"' : "undefined",
    FFF_LIBC: process.platform === "linux" ? '"gnu"' : "undefined",
  },
})
rmSync(runtimeDirectory, { recursive: true, force: true })
if (!result.success)
  throw new Error(
    result.logs.map((entry) => entry.message).join("\n") || "Backend compilation failed",
  )

for (const suffix of [
  "database/sqlite.bun.ts",
  "pty/pty.bun.ts",
  "filesystem/fff.bun.ts",
  "database/v1-migration.bun.ts",
]) {
  if (!Array.from(inputs).some((input) => input.endsWith(suffix)))
    throw new Error(`Compiled graph is missing ${suffix}`)
}
for (const input of inputs) {
  if (/\.(?:node|noop)\.ts$/u.test(input))
    throw new Error(`Compiled graph contains a Node runtime variant: ${input}`)
}
if (!statSync(executable).isFile() || statSync(executable).size === 0)
  throw new Error("Compiled backend is empty")
const signature = Buffer.from(await Bun.file(executable).slice(0, 4).arrayBuffer()).toString("hex")
if (
  !(process.platform === "darwin"
    ? ["cffaedfe", "cafebabe"].includes(signature)
    : process.platform === "win32"
      ? signature.startsWith("4d5a")
      : signature === "7f454c46")
) {
  throw new Error(`Compiled backend has an unexpected executable signature: ${signature}`)
}

const texDirectory = path.join(
  outputDirectory,
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
  CHEMFIG_TEX_DIRECTORY_NAME,
)
mkdirSync(texDirectory, { recursive: true })
const tikzDirectory = path.dirname(require.resolve("node-tikzjax/package.json"))
for (const filename of CHEMFIG_TEX_ASSET_FILENAMES) {
  copyFileSync(
    path.join(tikzDirectory, CHEMFIG_TEX_DIRECTORY_NAME, filename),
    path.join(texDirectory, filename),
  )
}
cpSync(
  path.join(backendDirectory, "resources/tessdata"),
  path.join(outputDirectory, "resources/tessdata"),
  { recursive: true, dereference: true },
)
console.log(`Built Buddy Bun backend at ${executable} (${statSync(executable).size} bytes)`)
console.log(
  `Verified Bun runtime variants: ${inputs.size}; bundled advanced math runtime ${advancedMathVersion}`,
)
