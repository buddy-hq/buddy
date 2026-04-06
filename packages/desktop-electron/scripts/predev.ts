import { $ } from "bun"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  copyBinaryToResources,
  getCurrentSidecar,
  syncBackendRuntimeResources,
  syncKnowledgeGraphAssets,
  syncMigrations,
  windowsify,
} from "./utils"

function verifyKnowledgeGraphArtifact(backendDir: string) {
  const sourcePath = process.env.BUDDY_KNOWLEDGE_GRAPH_DB_SOURCE?.trim()
  if (sourcePath) {
    return
  }

  const verify = spawnSync("bun", ["run", "--cwd", backendDir, "verify:knowledge-graph"], {
    encoding: "utf8",
    env: process.env,
  })

  if (verify.status === 0) {
    return
  }

  const output = [verify.stdout, verify.stderr]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
  throw new Error(
    output || "Failed to verify the committed Knowledge Graph artifact for desktop development.",
  )
}

await $`bun ./scripts/copy-icons.ts ${process.env.BUDDY_CHANNEL ?? "dev"}`

const packageDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(packageDir, "../buddy")
const config = getCurrentSidecar()
const source = path.resolve(
  backendDir,
  "dist/desktop-sidecar/bin",
  windowsify("buddy-backend", config.rustTarget),
)
const runtimeSourceDir = path.resolve(backendDir, "dist/desktop-sidecar/app")

await $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`
await $`bun run --cwd ${backendDir} build:desktop-sidecar`
verifyKnowledgeGraphArtifact(backendDir)
const destination = copyBinaryToResources(source, config.rustTarget)
const entrypoint = syncBackendRuntimeResources(runtimeSourceDir, config.rustTarget)
syncMigrations()
const knowledgeGraphPath = syncKnowledgeGraphAssets()

console.log(`Copied Buddy sidecar to ${destination}`)
console.log(`Copied Buddy backend entrypoint to ${entrypoint}`)
console.log(`Copied Knowledge Graph asset bundle to ${knowledgeGraphPath}`)
