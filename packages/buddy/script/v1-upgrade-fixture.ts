import { Database } from "bun:sqlite"
import { copyFileSync, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const V1_UPGRADE_FIXTURE_DIRECTORY = path.resolve(
  import.meta.dir,
  "../test/fixtures/v1-upgrade",
)

export const V1_UPGRADE_FIXTURE = {
  parentSessionID: "ses_e9bc348c6ffeVYp3hNj10v5E1K",
  childSessionID: "ses_e9bc3458effeCghW9g8z1MN0VQ",
  separateSessionID: "ses_e9bc34367ffeUhIRiVk04oUEhK",
  parentTitle: "Photosynthesis basics",
  childTitle: "Summarise lesson (@general subagent)",
  separateTitle: "Respiration follow-up",
  mermaidObjectID: "01M5J3SEVYRETT9ZKXYQY7Z39Z",
  mermaidMessageID: "msg_1643cbb48001fDS5bS1RVBAACk",
  citedMessageID: "msg_1643cb7be001VNTXEe9rsxZkGN",
  compactionSummaryMessageID: "msg_1643cbbdb001BHrSSAhdDOPHQk",
  parentFirstMessageID: "msg_1643cb7a2001leIKcrGaUU9mMR",
  childFirstMessageID: "msg_1643cba86001jCnZbRDVfWVlKo",
  messages: 22,
  parts: 52,
  events: 180,
} as const

const ORIGINAL_ROOT = "/private/tmp/buddy-v1-fixture"
const ORIGINAL_HOME = `${ORIGINAL_ROOT}/home/Documents/Buddy`
const ORIGINAL_NOTEBOOK = `${ORIGINAL_HOME}/Fixture Notebook`
const ORIGINAL_EXTERNAL = `${ORIGINAL_ROOT}/outside/reading-list.txt`
const ORIGINAL_EXTERNAL_URL = `file://${ORIGINAL_EXTERNAL}`
const NOTEBOOK_FOLDER = "Fixture Notebook"

export type RestoredV1UpgradeFixture = {
  readonly buddyHome: string
  readonly notebook: string
  readonly external: string
  readonly v1Database: string
  readonly authFile: string | undefined
  readonly notesDirectory: string
  readonly desktopNotebooksFile: string | undefined
  readonly notebookIdentitiesFile: string | undefined
}

function slashed(file: string) {
  return file.replaceAll("\\", "/")
}

function jsonText(value: string) {
  return JSON.stringify(value).slice(1, -1)
}

function relativeToRoot(directory: string) {
  return slashed(path.relative(path.parse(directory).root, directory))
}

export function remapV1UpgradeDatabase(
  database: string,
  locations: {
    readonly buddyHome: string
    readonly notebook: string
    readonly external: string
    readonly root: string
  },
) {
  const db = new Database(database)
  try {
    const replacements: ReadonlyArray<readonly [string, string]> = [
      [ORIGINAL_EXTERNAL_URL, pathToFileURL(locations.external).href],
      [ORIGINAL_NOTEBOOK, jsonText(locations.notebook)],
      [ORIGINAL_EXTERNAL, jsonText(locations.external)],
      [ORIGINAL_HOME, jsonText(locations.buddyHome)],
      [ORIGINAL_ROOT, jsonText(locations.root)],
    ]
    db.transaction(() => {
      for (const table of ["message", "part", "event"]) {
        for (const [from, to] of replacements)
          db.query(`UPDATE ${table} SET data = replace(data, ?, ?)`).run(from, to)
      }
      const notebook = realpathSync.native(locations.notebook)
      db.query("UPDATE session SET directory = ?, path = ? WHERE directory = ?").run(
        slashed(notebook),
        relativeToRoot(notebook),
        ORIGINAL_NOTEBOOK,
      )
      db.query("UPDATE project SET worktree = ? WHERE id = 'global'").run(
        slashed(path.parse(notebook).root),
      )
    })()
  } finally {
    db.close(false)
  }
}

export function restoreV1UpgradeFixture(input: {
  readonly root: string
  readonly openCodeDataDirectory: string
  readonly stateDirectory?: string
  readonly notebookParent?: string
  readonly credentials?: boolean
}): RestoredV1UpgradeFixture {
  const requestedHome = input.notebookParent ?? path.join(input.root, "Buddy home's notebooks é")
  const requestedExternal = path.join(input.root, "outside folder", "reading-list.txt")
  mkdirSync(requestedHome, { recursive: true })
  mkdirSync(path.dirname(requestedExternal), { recursive: true })
  const buddyHome = realpathSync(requestedHome)
  const notebookDestination = path.join(buddyHome, NOTEBOOK_FOLDER)
  const notesDirectory = path.join(buddyHome, "Notes")
  const external = path.join(
    realpathSync(path.dirname(requestedExternal)),
    path.basename(requestedExternal),
  )
  cpSync(
    path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "buddy-home", NOTEBOOK_FOLDER),
    notebookDestination,
    { recursive: true },
  )
  const notebook = realpathSync.native(notebookDestination)
  cpSync(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "buddy-home", "Notes"), notesDirectory, {
    recursive: true,
  })
  copyFileSync(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "external", "reading-list.txt"), external)
  mkdirSync(input.openCodeDataDirectory, { recursive: true })
  const v1Database = path.join(input.openCodeDataDirectory, "opencode.db")
  copyFileSync(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "opencode.db"), v1Database)
  remapV1UpgradeDatabase(v1Database, {
    buddyHome,
    notebook,
    external,
    root: realpathSync(input.root),
  })
  const authFile =
    input.credentials === false ? undefined : path.join(input.openCodeDataDirectory, "auth.json")
  if (authFile) copyFileSync(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "auth.json"), authFile)
  const desktopNotebooksFile = input.stateDirectory
    ? path.join(input.stateDirectory, "desktop-notebooks.json")
    : undefined
  const notebookIdentitiesFile = input.stateDirectory
    ? path.join(input.stateDirectory, "notes-notebook-identities.json")
    : undefined
  if (input.stateDirectory) {
    mkdirSync(input.stateDirectory, { recursive: true })
    for (const file of [desktopNotebooksFile, notebookIdentitiesFile]) {
      if (!file) continue
      const source = readFileSync(
        path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "buddy-state", path.basename(file)),
        "utf8",
      )
      writeFileSync(
        file,
        source
          .replaceAll(ORIGINAL_NOTEBOOK, jsonText(notebook))
          .replaceAll(ORIGINAL_HOME, jsonText(buddyHome)),
      )
    }
  }
  return {
    buddyHome,
    notebook,
    external,
    v1Database,
    authFile,
    notesDirectory,
    desktopNotebooksFile,
    notebookIdentitiesFile,
  }
}
