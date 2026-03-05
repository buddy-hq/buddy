import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

type MigrationEntry = {
  sql: string
  timestamp: number
}

type BuildCompiledBuddyBinaryInput = {
  outputFile: string
  target?: string
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
        sql: readFileSync(file, "utf8"),
        timestamp: parseMigrationTimestamp(name),
      } satisfies MigrationEntry
    })
    .filter((entry): entry is MigrationEntry => !!entry)
    .sort((left, right) => left.timestamp - right.timestamp)

  return entries
}

export async function buildCompiledBuddyBinary(input: BuildCompiledBuddyBinaryInput) {
  const backendDir = path.resolve(import.meta.dir, "..")
  const outputFile = path.resolve(input.outputFile)
  const buddyMigrationDir = path.resolve(backendDir, "migration")
  const opencodeMigrationDir = path.resolve(backendDir, "../../vendor/opencode/packages/opencode/migration")

  const buddyMigrations = loadMigrations(buddyMigrationDir, "Buddy")
  const opencodeMigrations = loadMigrations(opencodeMigrationDir, "OpenCode")

  mkdirSync(path.dirname(outputFile), { recursive: true })

  const result = await Bun.build({
    entrypoints: [path.resolve(backendDir, "src/index.ts")],
    compile: {
      outfile: outputFile,
      ...(input.target ? { target: input.target } : {}),
    },
    define: {
      BUDDY_MIGRATIONS: JSON.stringify(buddyMigrations),
      OPENCODE_MIGRATIONS: JSON.stringify(opencodeMigrations),
    },
  })

  if (!result.success) {
    throw new Error(`Failed to compile sidecar binary: ${outputFile}`)
  }

  return {
    outputFile,
    buddyMigrationCount: buddyMigrations.length,
    opencodeMigrationCount: opencodeMigrations.length,
  }
}
