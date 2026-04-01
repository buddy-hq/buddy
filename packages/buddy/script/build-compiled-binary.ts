import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

const loader = {
  ".md": "text",
} as const

type MigrationEntry = {
  sql: string
  timestamp: number
  name: string
}

type BuildCompiledBuddyBinaryInput = {
  outputFile: string
  bundleOutputFile?: string
  target?: Bun.Build.CompileTarget
}

function removeBunCompileArtifacts(directory: string) {
  const entries = readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/^\..+\.bun-build$/.test(entry.name)) continue
    rmSync(path.join(directory, entry.name), { force: true })
  }
}

function parseMigrationTimestamp(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function loadMigrations(dir: string, label: string): MigrationEntry[] {
  if (!existsSync(dir)) {
    throw new Error(`Missing ${label} migration directory at ${dir}`)
  }

  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((name) => {
      const file = path.join(dir, name, "migration.sql")
      if (!existsSync(file)) {
        return undefined
      }

      return {
        name,
        sql: readFileSync(file, "utf8"),
        timestamp: parseMigrationTimestamp(name),
      } satisfies MigrationEntry
    })
    .filter((entry): entry is MigrationEntry => !!entry)
    .toSorted((left, right) => left.timestamp - right.timestamp)

  return entries
}

function patchBundledUndiciNamespace(bundleOutputFile: string) {
  const source = readFileSync(bundleOutputFile, "utf8")
  const broken = 'import Undici from "undici";\nimport"undici";'
  if (!source.includes(broken)) return

  const fixed = 'import Undici from "undici";\nimport * as undici from "undici";'
  writeFileSync(bundleOutputFile, source.replace(broken, fixed))
}

export async function buildCompiledBuddyBinary(input: BuildCompiledBuddyBinaryInput) {
  const backendDir = path.resolve(import.meta.dir, "..")
  const sourceEntrypoint = path.resolve(backendDir, "src/index.ts")
  const cleanupDirs = [...new Set([backendDir, path.resolve(process.cwd())])]
  for (const directory of cleanupDirs) {
    removeBunCompileArtifacts(directory)
  }
  const outputFile = path.resolve(input.outputFile)
  const bundleOutputFile = input.bundleOutputFile ? path.resolve(input.bundleOutputFile) : undefined
  const buddyMigrationDir = path.resolve(backendDir, "migration")
  const opencodeMigrationDir = path.resolve(
    backendDir,
    "../../vendor/opencode/packages/opencode/migration",
  )
  const buddySkillsDir = path.resolve(backendDir, "src/learning/capabilities/pedagogy/skills")
  const opencodeRuntimePluginsDir = path.resolve(backendDir, "src/opencode-runtime/plugins")
  const systemPromptCaptureModule = path.resolve(
    backendDir,
    "src/opencode-runtime/system-prompt-capture.ts",
  )

  const buddyMigrations = loadMigrations(buddyMigrationDir, "Buddy")
  const opencodeMigrations = loadMigrations(opencodeMigrationDir, "OpenCode")

  mkdirSync(path.dirname(outputFile), { recursive: true })
  if (bundleOutputFile) {
    mkdirSync(path.dirname(bundleOutputFile), { recursive: true })
  }

  const define = {
    BUDDY_MIGRATIONS: JSON.stringify(buddyMigrations),
    OPENCODE_MIGRATIONS: JSON.stringify(opencodeMigrations),
  }

  try {
    let compileEntrypoint = sourceEntrypoint

    if (bundleOutputFile) {
      const bundleOutdir = path.dirname(bundleOutputFile)
      const bundleResult = await Bun.build({
        entrypoints: [sourceEntrypoint],
        outdir: bundleOutdir,
        target: "bun",
        format: "esm",
        define,
        loader,
      })

      if (!bundleResult.success) {
        throw new Error(`Failed to build sidecar entry bundle: ${bundleOutputFile}`)
      }

      if (!existsSync(bundleOutputFile)) {
        throw new Error(`Sidecar entry bundle missing after build: ${bundleOutputFile}`)
      }

      patchBundledUndiciNamespace(bundleOutputFile)
      compileEntrypoint = bundleOutputFile

      if (existsSync(buddySkillsDir)) {
        const bundledSkillsTarget = path.resolve(
          bundleOutdir,
          "learning/capabilities/pedagogy/skills",
        )
        rmSync(bundledSkillsTarget, { recursive: true, force: true })
        mkdirSync(path.dirname(bundledSkillsTarget), { recursive: true })
        cpSync(buddySkillsDir, bundledSkillsTarget, { recursive: true, dereference: true })
      }

      if (existsSync(opencodeRuntimePluginsDir)) {
        const bundledPluginsTarget = path.resolve(bundleOutdir, "plugins")
        rmSync(bundledPluginsTarget, { recursive: true, force: true })
        mkdirSync(path.dirname(bundledPluginsTarget), { recursive: true })
        cpSync(opencodeRuntimePluginsDir, bundledPluginsTarget, {
          recursive: true,
          dereference: true,
        })
      }

      if (existsSync(systemPromptCaptureModule)) {
        const bundledCaptureTarget = path.resolve(bundleOutdir, "system-prompt-capture.ts")
        copyFileSync(systemPromptCaptureModule, bundledCaptureTarget)
      }
    }

    const compileBuildInput: Bun.BuildConfig = {
      entrypoints: [compileEntrypoint],
      compile: {
        outfile: outputFile,
        ...(input.target ? { target: input.target } : {}),
      },
    }

    if (compileEntrypoint === sourceEntrypoint) {
      compileBuildInput.define = define
      compileBuildInput.loader = loader
    }

    const result = await Bun.build(compileBuildInput)

    if (!result.success) {
      throw new Error(`Failed to compile sidecar binary: ${outputFile}`)
    }

    return {
      bundleOutputFile,
      outputFile,
      buddyMigrationCount: buddyMigrations.length,
      opencodeMigrationCount: opencodeMigrations.length,
    }
  } finally {
    for (const directory of cleanupDirs) {
      removeBunCompileArtifacts(directory)
    }
  }
}
