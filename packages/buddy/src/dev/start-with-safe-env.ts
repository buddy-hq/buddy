import path from "node:path"
import { spawn } from "node:child_process"
import { mergeSafeRepoEnv } from "./safe-env"
import { parseTString } from "../http/parse"
import { OPENCODE_ENV } from "../storage"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const runtimeArgs = process.argv.slice(2)
const watch = runtimeArgs.includes("--watch")
const passthroughArgs = runtimeArgs.filter((arg) => arg !== "--watch")
const OPENCODE_EXPERIMENTAL_FILEWATCHER_ENABLED = "true"
const args = [
  "run",
  ...(watch ? ["--watch"] : []),
  path.join(import.meta.dir, "..", "index.ts"),
  ...passthroughArgs,
]
const baseChildEnv = mergeSafeRepoEnv(
  Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => {
      const parsed = parseTString(value)
      return parsed === undefined ? [] : [[key, parsed]]
    }),
  ),
  repoRoot,
)

const child = spawn("bun", args, {
  stdio: "inherit",
  env: {
    ...baseChildEnv,
    [OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER]:
      baseChildEnv[OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER] ??
      OPENCODE_EXPERIMENTAL_FILEWATCHER_ENABLED,
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
