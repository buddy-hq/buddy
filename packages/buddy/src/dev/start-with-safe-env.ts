import path from "node:path"
import { spawn } from "node:child_process"
import { mergeSafeRepoEnv } from "./safe-env"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const runtimeArgs = process.argv.slice(2)
const watch = runtimeArgs.includes("--watch")
const passthroughArgs = runtimeArgs.filter((arg) => arg !== "--watch")
const OPENCODE_EXPERIMENTAL_FILEWATCHER = "OPENCODE_EXPERIMENTAL_FILEWATCHER"
const OPENCODE_EXPERIMENTAL_FILEWATCHER_ENABLED = "true"
const args = [
  "run",
  ...(watch ? ["--watch"] : []),
  path.join(import.meta.dir, "..", "index.ts"),
  ...passthroughArgs,
]
const baseChildEnv = mergeSafeRepoEnv(
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ),
  repoRoot,
)

const child = spawn("bun", args, {
  stdio: "inherit",
  env: {
    ...baseChildEnv,
    [OPENCODE_EXPERIMENTAL_FILEWATCHER]:
      baseChildEnv[OPENCODE_EXPERIMENTAL_FILEWATCHER] ?? OPENCODE_EXPERIMENTAL_FILEWATCHER_ENABLED,
  },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on("error", () => {
  process.exit(1)
})
