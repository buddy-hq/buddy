import { $ } from "bun"

await $`bun run --cwd ../web prepare:web:typecheck`
await $`bun ./scripts/copy-icons.ts`
