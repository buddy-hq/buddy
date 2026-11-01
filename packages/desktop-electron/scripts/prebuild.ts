import { $ } from "bun"
import { logDesktopRuntimeResources, syncDesktopRuntimeResources } from "./utils"

await $`bun run --cwd ../web prepare:web:typecheck`
await $`bun run --cwd ../buddy build:backend`
logDesktopRuntimeResources(syncDesktopRuntimeResources())
await $`bun ./scripts/copy-icons.ts`
