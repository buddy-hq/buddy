import { expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../../src/config/config"
import { createNotebookTestHost } from "../helpers/opencode"
import { canonicalizeRuntimeConfigDirectory } from "../../src/config/store/directories"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { writeProjectConfig } from "../helpers/project-config"
import { createGitRepo } from "../helpers/repo"
import { scriptedModelPlugin } from "../opencode-runtime/scripted-model"

test("preserves config bytes and mtime through sync/catalog/prompt and writes only Buddy config explicitly", async () => {
  await using repo = await createGitRepo("notebook-no-config-pollution")
  const directory = canonicalizeRuntimeConfigDirectory(repo.path)
  const buddyPath = path.join(repo.path, ".buddy", "buddy.jsonc")
  const buddy = '{\n  // Keep this document byte for byte\n  "model": "scripted/chat",\n  "provider": { "scripted": { "npm": "@ai-sdk/perplexity", "options": { "apiKey": "test-key" }, "models": { "chat": {} } } }\n}\n'
  writeProjectConfig(repo.path, buddy)
  const before = await fsp.stat(buddyPath)
  await using runtime = await createNotebookTestHost({ plugins: [scriptedModelPlugin([])] })
  await Config.getProject(repo.path)
  await syncNotebookRuntimeConfig(directory, { runtime: runtime.agentRuntime })
  await runtime.host.skill.list({ location: { directory } })
  const session = await runtime.host.session.create({ location: { directory }, agent: "buddy", model: { providerID: "scripted", id: "chat" } })
  await runtime.host.session.prompt({ sessionID: session.id, text: "Say hello" })
  await runtime.host.session.wait({ sessionID: session.id })
  const history = await runtime.host.message.list({ sessionID: session.id })
  expect(history.data.some((message) => message.type === "assistant" && message.content.some((part) => part.type === "text" && part.text === "Scripted title."))).toBe(true)
  expect(await fsp.readFile(buddyPath, "utf8")).toBe(buddy)
  expect((await fsp.stat(buddyPath)).mtimeMs).toBe(before.mtimeMs)
  await Config.updateProject(repo.path, Config.ProjectInfo.parse({ default_persona: "teaching-buddy" }))
  await syncNotebookRuntimeConfig(directory, { runtime: runtime.agentRuntime })
  expect((await Config.getProject(repo.path)).default_persona).toBe("teaching-buddy")
  for (const filename of ["config.json", "opencode.json", "opencode.jsonc", ".opencode"]) expect(await fsp.stat(path.join(repo.path, filename)).catch(() => undefined)).toBeUndefined()
})
