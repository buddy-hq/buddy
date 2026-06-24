import { $ } from "bun"
import { logDesktopRuntimeResources, syncDesktopRuntimeResources } from "./utils"

await $`bun run --cwd ../web prepare:web:typecheck`
await $`bun run --cwd ../buddy build:node`
await $`bun run --cwd ../buddy smoke:node`
logDesktopRuntimeResources(syncDesktopRuntimeResources())
await $`bun ./scripts/copy-icons.ts`
