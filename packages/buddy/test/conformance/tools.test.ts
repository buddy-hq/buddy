import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import type { ToolPart } from "@buddy/transcript-contract/message"
import { createRuntimeHarness, patchModel, scenario, transcript } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness({ permission: { bash: "allow" } })
  await fs.writeFile(path.join(api.directory, "notes.md"), "Rain falls.\nClouds form.\n")
  await fs.writeFile(path.join(api.directory, "old.md"), "Moving file.\n")
})
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

async function runTool(name: string, args: Record<string, string>, options: { model?: typeof patchModel } = {}) {
  const session = await api.create()
  expect((await api.prompt(session.id, scenario({ kind: "tool", name, arguments: args }), options)).status).toBe(200)
  const tools = (await api.messages(session.id)).flatMap((message) => message.parts).flatMap((part) => part.type === "tool" ? [part] : [])
  expect(tools.map((part) => [part.tool, part.state.status])).toEqual([[name, "completed"]])
  const [part] = tools
  if (!part) throw new Error(`Missing ${name} tool part`)
  return part
}

const presented = z.object({ metadata: z.object({ buddy: z.object({ presentation: z.object({ detail: z.string().optional() }) }) }) })

function presentationDetail(part: ToolPart) {
  return presented.parse(part).metadata.buddy.presentation.detail
}

async function sameFile(left: string | undefined, right: string) {
  if (left === undefined) return false
  return await fs.realpath(left) === await fs.realpath(right)
}

describe("Native tool results", () => {
  test("write reports the new file with its content and changes it on disk", async () => {
    const part = await runTool("write", { path: "rain.md", content: "One\nTwo\nThree\n" })
    const target = path.join(api.directory, "rain.md")
    expect(await fs.readFile(target, "utf8")).toBe("One\nTwo\nThree\n")
    expect(part.state.fileChanges).toMatchObject([{ relativePath: "rain.md", content: "One\nTwo\nThree\n" }])
    expect(await sameFile(part.state.fileChanges?.[0]?.path, target)).toBe(true)
    expect(part.state.filesChanged).toBe(true)
    expect(presentationDetail(part)).toBe("rain.md")
  })

  test("edit reports an update with its diff and line counts", async () => {
    const part = await runTool("edit", { path: "notes.md", oldString: "Rain falls.", newString: "Rain falls softly." })
    const target = path.join(api.directory, "notes.md")
    expect(await fs.readFile(target, "utf8")).toBe("Rain falls softly.\nClouds form.\n")
    expect(part.state.fileChanges).toMatchObject([{ relativePath: "notes.md", kind: "update", additions: 1, deletions: 1 }])
    expect(part.state.fileChanges?.[0]?.patch).toContain("-Rain falls.")
    expect(part.state.fileChanges?.[0]?.patch).toContain("+Rain falls softly.")
    expect(await sameFile(part.state.fileChanges?.[0]?.path, target)).toBe(true)
    expect(part.state.filesChanged).toBe(true)
    expect(presentationDetail(part)).toBe("notes.md")
  })

  test("a patch reports added and moved files by kind and applies them on disk", async () => {
    const part = await runTool("patch", { patchText: [
      "*** Begin Patch", "*** Add File: added.md", "+Added line", "*** Update File: old.md", "*** Move to: moved.md", "@@", "-Moving file.", "+Moved file.", "*** End Patch",
    ].join("\n") }, { model: patchModel })
    expect(await fs.readFile(path.join(api.directory, "added.md"), "utf8")).toBe("Added line\n")
    expect(await fs.readFile(path.join(api.directory, "moved.md"), "utf8")).toBe("Moved file.\n")
    expect(await Bun.file(path.join(api.directory, "old.md")).exists()).toBe(false)
    expect(part.state.fileChanges?.map((change) => [change.relativePath, change.kind, change.additions, change.deletions])).toEqual([
      ["added.md", "add", 1, 0], ["moved.md", "move", 1, 1],
    ])
    expect(part.state.filesChanged).toBe(true)
  })

  test("a single-file patch names its file", async () => {
    await fs.writeFile(path.join(api.directory, "added.md"), "Added line\n")
    const part = await runTool("patch", { patchText: [
      "*** Begin Patch", "*** Update File: added.md", "@@", "-Added line", "+Patched line", "*** End Patch",
    ].join("\n") }, { model: patchModel })
    expect(await fs.readFile(path.join(api.directory, "added.md"), "utf8")).toBe("Patched line\n")
    expect(part.state.fileChanges).toMatchObject([{ relativePath: "added.md", kind: "update", additions: 1, deletions: 1 }])
    expect(presentationDetail(part)).toBe("added.md")
  })

  test("a shell command reports its command and output", async () => {
    const part = await runTool("shell", { command: "echo probe" })
    expect(part.state.shell?.command).toBe("echo probe")
    expect(part.state.shell?.output?.trim()).toBe("probe")
  })

  test("a running shell command streams its output before it finishes and after reconnect", async () => {
    await fs.writeFile(path.join(api.directory, "wait.ts"), [
      `import { existsSync, watch } from "node:fs"`,
      `const released = new Promise<void>((resolve) => {`,
      `  const watcher = watch(".", () => check())`,
      `  function check() { if (existsSync("release")) { watcher.close(); resolve() } }`,
      `  check()`,
      `})`,
      `process.stdout.write("ready\\n")`,
      `await released`,
      `process.stdout.write("finished\\n")`,
    ].join("\n"))
    const session = await api.create()
    await using events = await api.events()
    const hasLiveOutput = (event: Parameters<typeof transcript>[0]) => {
      if (event.payload.type !== "message.part.updated") return false
      const change = transcript(event)
      return change.type === "message.part.updated" && change.properties.part.sessionID === session.id && change.properties.part.type === "tool"
        && change.properties.part.state.status === "running" && (change.properties.part.state.shell?.output ?? "").includes("ready")
    }
    try {
      await api.promptAsync(session.id, scenario({ kind: "tool", name: "shell", arguments: { command: "bun wait.ts" } }))
      const running = transcript(await events.until(hasLiveOutput))
      expect(running).toMatchObject({ properties: { part: { tool: "shell", state: { status: "running", shell: { command: "bun wait.ts", output: "ready\n" } } } } })
      await events[Symbol.asyncDispose]()
      await using reconnected = await api.events()
      expect(transcript(await reconnected.until(hasLiveOutput))).toMatchObject({ properties: { part: { state: { status: "running", shell: { output: "ready\n" } } } } })
      await fs.writeFile(path.join(api.directory, "release"), "")
      await reconnected.idle(session.id)
      const shell = (await api.messages(session.id)).flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "shell")
      expect(shell).toMatchObject({ state: { status: "completed" } })
      expect(shell?.type === "tool" ? shell.state.shell?.output?.split(/\r?\n/u).filter(Boolean) : undefined).toEqual(["ready", "finished"])
    } finally {
      await fs.writeFile(path.join(api.directory, "release"), "")
    }
  })

  test("file searches report their subject and match count", async () => {
    const markdown = (await fs.readdir(api.directory)).filter((file) => file.endsWith(".md"))
    const glob = await runTool("glob", { pattern: "*.md" })
    expect(glob.state.summary).toMatchObject({ kind: "find-files", subject: "*.md", result: { unit: "matches", count: markdown.length } })
    expect(glob.state.filesChanged).toBe(false)
    const grep = await runTool("grep", { pattern: "Clouds" })
    expect(grep.state.summary).toMatchObject({ kind: "search-files", subject: "Clouds" })
    expect(grep.state.status === "completed" ? grep.state.output : "").toContain("notes.md")
    expect(grep.state.filesChanged).toBe(false)
  })
})
