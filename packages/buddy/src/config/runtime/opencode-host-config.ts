import fsp from "node:fs/promises"
import path from "node:path"
import { openCodeRuntimePaths } from "../../opencode-runtime/env"
import { writeTextFileAtomic } from "../../storage/atomic-file"
import { Config } from "../config"
import { parseNodeErrorCode } from "../parse-values"

const OPENCODE_HOST_CONFIG_FILENAME = "buddy-host-config.json"

let syncQueue: Promise<string | void> = Promise.resolve()

export function openCodeHostConfigFile(): string {
  return path.join(openCodeRuntimePaths().state, OPENCODE_HOST_CONFIG_FILENAME)
}

export function renderOpenCodeHostConfig(config: Pick<Config.Info, "compaction">): string {
  const { compaction } = config
  return `${JSON.stringify({ compaction: compaction && { auto: compaction.auto,
    keep: compaction.preserve_recent_tokens === undefined ? undefined : { tokens: compaction.preserve_recent_tokens },
    buffer: compaction.reserved,
  } }, null, 2)}\n`
}

async function readCurrentHostConfig(filepath: string): Promise<string | undefined> {
  return fsp.readFile(filepath, "utf8").catch((error) => {
    if (parseNodeErrorCode(error) === "ENOENT") return undefined
    throw error
  })
}

async function writeOpenCodeHostConfig(): Promise<string> {
  const filepath = openCodeHostConfigFile()
  const next = renderOpenCodeHostConfig(await Config.getGlobal())
  if (await readCurrentHostConfig(filepath) !== next) await writeTextFileAtomic(filepath, next)
  return filepath
}

export function syncOpenCodeHostConfig(): Promise<string> {
  const run = syncQueue.catch(() => undefined).then(writeOpenCodeHostConfig)
  syncQueue = run
  return run
}
