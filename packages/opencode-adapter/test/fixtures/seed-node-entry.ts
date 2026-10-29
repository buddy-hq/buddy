import { setTimeout as delay } from "node:timers/promises"
import { Flock } from "@opencode/util/flock"
import { seedV2Database } from "../../src/seed-v2-database"

const SAMPLE_INTERVAL_MS = 5

const [state, v1Database, v2Database, pause] = process.argv.slice(2)
if (!state || !v1Database || !v2Database) throw new Error("usage: seed-node-entry <state> <v1> <v2> [pauseMs]")
Flock.setGlobal({ state })
let longestPauseMs = 0
let last = performance.now()
const monitor = setInterval(() => {
  const now = performance.now()
  longestPauseMs = Math.max(longestPauseMs, now - last - SAMPLE_INTERVAL_MS)
  last = now
}, SAMPLE_INTERVAL_MS)
const started = performance.now()
try {
  const pauseMs = Number(pause)
  const result = await seedV2Database({ v1Database, v2Database }, { beforePrepare: pauseMs > 0 ? () => delay(pauseMs) : undefined })
  console.log(JSON.stringify({ result, longestPauseMs, elapsedMs: performance.now() - started, node: process.versions.node }))
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error), node: process.versions.node }))
} finally {
  clearInterval(monitor)
}
