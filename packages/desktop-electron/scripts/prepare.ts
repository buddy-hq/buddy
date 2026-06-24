import { $ } from "bun"
import {
  logDesktopRuntimeResources,
  syncDesktopRuntimeResources,
  updateDesktopPackageVersion,
} from "./utils"

const version = process.env.BUDDY_VERSION?.trim()
if (!version) {
  throw new Error("BUDDY_VERSION is required for release preparation")
}

await $`bun run --cwd ../buddy build:node`

updateDesktopPackageVersion(version)

console.log("Prepared electron desktop release assets")
logDesktopRuntimeResources(syncDesktopRuntimeResources())
