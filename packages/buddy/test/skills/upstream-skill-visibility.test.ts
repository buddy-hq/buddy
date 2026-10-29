import { expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { createNotebookTestHost } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { skillDocument } from "../../src/learning/skill-management/service/documents"

test("hides v2 built-in skills and retains a project skill with the same ID", async () => {
  await using empty = await createGitRepo("skills-builtins")
  await using custom = await createGitRepo("skills-user-opencode")
  const skillPath = path.join(custom.path, ".opencode", "skills", "opencode", "SKILL.md")
  await fsp.mkdir(path.dirname(skillPath), { recursive: true })
  await fsp.writeFile(skillPath, skillDocument({ name: "opencode", description: "User instructions", content: "Use this project's conventions." }))
  await using runtime = await createNotebookTestHost()
  await syncNotebookRuntimeConfig(empty.path, { runtime: runtime.agentRuntime })
  await syncNotebookRuntimeConfig(custom.path, { runtime: runtime.agentRuntime })
  const emptySkills = (await runtime.host.skill.list({ location: { directory: empty.path } })).data
  const userSkills = (await runtime.host.skill.list({ location: { directory: custom.path } })).data
  expect(emptySkills.some((skill) => skill.path === "/builtin/opencode.md" || skill.path === "/builtin/report.md")).toBe(false)
  expect(userSkills.find((skill) => skill.id === "opencode")?.path).toBe(skillPath)
  expect(userSkills.find((skill) => skill.id === "opencode")?.content.trim()).toBe("Use this project's conventions.")
})
