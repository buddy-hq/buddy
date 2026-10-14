import path from "node:path"
import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import { updateSession } from "@buddy/opencode-adapter/gateway/session"
import { runLearnerMemoryStartupSweep } from "../../src/learning/features/memory/startup"
import { runWithLearnerMemoryLabContext } from "../../src/learning/features/memory/lab-context"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { BUDDY_ENV } from "../../src/storage/constants"
import { tmpdir } from "../helpers/tmpdir"
import { temporaryEnvironment } from "../helpers/temporary-environment"

afterEach(() => setSystemTime())

describe("learner memory startup", () => {
  test("excludes Buddy-archived chats while extracting an otherwise eligible idle chat", async () => {
    await using root = await tmpdir()
    await using notebook = await tmpdir()
    const environment = temporaryEnvironment({ [BUDDY_ENV.RUNTIME_ROOT]: path.join(root.path, "runtime") })
    try {
      const host = await getOpenCodeClient()
      const archived = await host.sessions.create({ location: { directory: notebook.path }, title: "Archived chat" })
      await updateSession(host, archived.id, { time: { archived: 12345 } })
      const native = await host.sessions.get({ sessionID: archived.id })
      expect(native.time.archived).toBeUndefined()
      expect(native.metadata?.["buddy.archivedAt"]).toBe(12345)
      const active = await host.sessions.create({ location: { directory: notebook.path }, title: "Idle chat" })
      setSystemTime(new Date(Math.max(native.time.updated, active.time.updated) + 60_000))
      const result = await runWithLearnerMemoryLabContext({
        memoryRoot: path.join(root.path, "memory"),
        settingsOverride: { enabled: true, autoExtract: true, minStartupIdleMs: 1, maxStartupSessionAgeMs: 3_600_000 },
      }, () => runLearnerMemoryStartupSweep({ directory: notebook.path }))
      expect(result).toMatchObject({ scanned: 2, eligible: 1, attempted: 1, sessions: [{ sessionID: active.id }] })
      expect(result.sessions[0]?.error).toBeUndefined()
    } finally {
      try {
        await closeOpenCodeHost()
      } finally {
        environment[Symbol.dispose]()
      }
    }
  })
})
