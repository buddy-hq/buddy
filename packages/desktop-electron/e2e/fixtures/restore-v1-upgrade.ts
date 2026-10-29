import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { restoreV1UpgradeFixture, V1_UPGRADE_FIXTURE_DIRECTORY } from "../../../buddy/script/v1-upgrade-fixture"
import { DEFAULT_NOTEBOOK_HOME_SEGMENTS } from "@buddy/script/storage-env"

const [root, home, dataDirectory, stateDirectory] = z.tuple([z.string(), z.string(), z.string(), z.string()]).parse(process.argv.slice(2))
const openCodeDataDirectory = path.join(dataDirectory, "opencode")
const restored = restoreV1UpgradeFixture({ root, openCodeDataDirectory, notebookParent: path.join(home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS) })
await fs.copyFile(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "mcp-auth.json"), path.join(openCodeDataDirectory, "mcp-auth.json"))
const registry = z.array(z.string()).parse(JSON.parse(await fs.readFile(path.join(V1_UPGRADE_FIXTURE_DIRECTORY, "buddy-state", "desktop-notebooks.json"), "utf8")))
await fs.writeFile(path.join(stateDirectory, "desktop-notebooks.json"), JSON.stringify(registry.map((directory) => directory.replace(
  "/private/tmp/buddy-v1-fixture/home/Documents/Buddy",
  restored.buddyHome,
))))
const sha256 = createHash("sha256").update(await fs.readFile(restored.v1Database)).digest("hex")
await fs.writeFile(path.join(root, "v1-upgrade.json"), JSON.stringify({ notebook: restored.notebook, v1Database: restored.v1Database, sha256 }))
