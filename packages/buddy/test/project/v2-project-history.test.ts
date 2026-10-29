import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { readSessionInDirectory, readSessionMessages } from "../../src/project/session-history"
import { createConfigConformanceHarness } from "../conformance/harness-config"
import { tmpdir } from "../helpers/tmpdir"

afterEach(closeAgentRuntime)

async function git(directory: string, args: string[]) {
  const process = Bun.spawn(["git", ...args], { cwd: directory, stdout: "ignore", stderr: "pipe" })
  if (await process.exited !== 0) throw new Error(await new Response(process.stderr).text())
}

describe("project and session boundaries", () => {
  test("reads a legacy local identity without creating Buddy's git cache", async () => {
    await using root = await tmpdir()
    const legacy = path.join(root.path, "legacy")
    const fresh = path.join(root.path, "fresh")
    await Promise.all([fs.mkdir(legacy), fs.mkdir(fresh)])
    await git(legacy, ["init", "-q"])
    await git(fresh, ["init", "-q"])
    await fs.writeFile(path.join(legacy, ".git", "opencode"), "buddy-local-existing\n")
    const runtime = await getAgentRuntime()
    expect((await runtime.workspace.location(legacy)).project.id).toBe("buddy-local-existing")
    await runtime.workspace.location(fresh)
    expect(await fs.exists(path.join(fresh, ".git", "opencode"))).toBe(false)
  })

  test("reads history across the default page boundary and refuses another notebook", async () => {
    await using harness = await createConfigConformanceHarness()
    const notebook = await harness.notebook("history")
    const other = await harness.notebook("other")
    const session = await notebook.json("/session", z.object({ id: z.string() }), { body: {} })
    const runtime = await getAgentRuntime()
    for (let index = 0; index < 101; index += 1) {
      const result = await runtime.execution.prompt({ sessionID: session.id, text: `History ${index}` }, { directory: notebook.directory })
      if (!result.ok) throw result.error
    }
    const history = await readSessionMessages(notebook.directory, session.id)
    expect(history).toHaveLength(202)
    const users = history.filter((message) => message.info.role === "user")
    expect(users.flatMap((message) => message.parts).filter((part) => part.type === "text").map((part) => part.text)).toEqual(Array.from({ length: 101 }, (_, index) => `History ${index}`))
    expect(await readSessionInDirectory(other.directory, session.id)).toBeUndefined()
    await expect(readSessionMessages(other.directory, session.id)).rejects.toThrow("does not belong")
  }, 15_000)
})
