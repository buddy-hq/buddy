import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createV2TestHost } from "../helpers/v2-host"
import { readSessionInDirectory, readSessionMessages } from "../../src/project/session-history"

async function git(directory: string, args: string[]) {
  const process = Bun.spawn(["git", ...args], { cwd: directory, stdout: "ignore", stderr: "pipe" })
  if (await process.exited !== 0) throw new Error(await new Response(process.stderr).text())
}

describe("v2 project and session boundaries", () => {
  test("reads a legacy local identity without creating Buddy's git cache", async () => {
    await using runtime = await createV2TestHost()
    const legacy = path.join(runtime.path, "legacy")
    const fresh = path.join(runtime.path, "fresh")
    await Promise.all([fs.mkdir(legacy), fs.mkdir(fresh)])
    await git(legacy, ["init", "-q"])
    await git(fresh, ["init", "-q"])
    await fs.writeFile(path.join(legacy, ".git", "opencode"), "buddy-local-existing\n")
    const project = await runtime.host.location.get({ location: { directory: legacy } })
    expect(project.project.id).toBe("buddy-local-existing")
    await runtime.host.location.get({ location: { directory: fresh } })
    expect(await fs.exists(path.join(fresh, ".git", "opencode"))).toBe(false)
  })

  test("reads every page in order and refuses sessions from another notebook", async () => {
    await using runtime = await createV2TestHost()
    const directory = path.join(runtime.path, "workspace")
    const otherDirectory = path.join(runtime.path, "other")
    await Promise.all([fs.mkdir(directory), fs.mkdir(otherDirectory)])
    const session = await runtime.host.session.create({ location: { directory }, title: "History" })
    const messages = Array.from({ length: 205 }, (_, index) => ({
      id: `msg_history_${index.toString().padStart(4, "0")}`,
      type: "user" as const,
      text: `Message ${index}`,
      time: { created: 1_777_777_777_000 + index },
    }))
    await runtime.host.session.remove({ sessionID: session.id })
    await runtime.host.session.import({ info: session, messages, location: { directory } })
    const history = await readSessionMessages(runtime.host, directory, session.id)
    expect(history).toHaveLength(205)
    expect(history[0]).toMatchObject({ text: "Message 0" })
    expect(history.at(-1)).toMatchObject({ text: "Message 204" })
    expect(await readSessionInDirectory(runtime.host, otherDirectory, session.id)).toBeUndefined()
    await expect(readSessionMessages(runtime.host, otherDirectory, session.id)).rejects.toThrow("does not belong")
  })
})
