import fs from "node:fs/promises"
import path from "node:path"

export function scriptedConfig(baseURL: string) {
  return {
    model: "scripted/chat",
    small_model: "scripted/chat",
    enabled_providers: ["scripted"],
    compaction: { auto: false },
    learner_memory: { enabled: false },
    provider: {
      scripted: {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL, apiKey: "fixture" },
        models: { chat: { name: "Scripted Chat", tool_call: true, limit: { context: 100000, output: 1000 } } },
      },
    },
  }
}

export async function createNotebook(notebooksRoot: string, baseURL: string, name = "UI E2E notebook") {
  const directory = path.join(notebooksRoot, name)
  const readPath = path.join(directory, "fixture.txt")
  const contents = "UI E2E notebook file contents."
  await fs.mkdir(path.join(directory, ".buddy"), { recursive: true })
  await fs.writeFile(path.join(directory, ".buddy", "buddy.jsonc"), JSON.stringify(scriptedConfig(baseURL), null, 2))
  await fs.writeFile(readPath, contents)
  return { directory, readPath, contents }
}

export async function addReferenceFixture(directory: string) {
  const name = "u45docs"
  const referencePath = path.join(directory, "shared-docs")
  const filename = "u45-reference-guide.md"
  const description = "U45 local reference documentation"
  await fs.mkdir(referencePath)
  await fs.writeFile(path.join(referencePath, filename), "Local reference fixture for the U5 draft.\n")
  await fs.writeFile(path.join(directory, "opencode.json"), JSON.stringify({ references: { [name]: { path: referencePath, description } } }))
  return { name, path: referencePath, filename }
}
