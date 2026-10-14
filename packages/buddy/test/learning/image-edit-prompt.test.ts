import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"
import { parseJsonObject, parsePromptString, requireJsonArray } from "../helpers/parse"

describe("image edit prompt", () => {
  test("adds Codex's minimal hidden image edit instruction", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_image_edit_prompt",
      },
      body: {
        content: "shorten this answer",
        persona: "buddy",
        imageEdit: {
          targetPaths: [`${project.path}/selected image.png`],
        },
      },
      projectConfig: config,
    })

    const parts = requireJsonArray(result.transformed.parts)
    const reminder = parts.find((part) => parseJsonObject(part)?.synthetic === true)
    const reminderText = parsePromptString(parseJsonObject(reminder)?.text)

    expect(reminderText?.startsWith("<system-reminder>")).toBe(true)
    expect(reminderText?.endsWith("</system-reminder>")).toBe(true)
    expect(reminderText).not.toContain("image_edit_request")
    expect(reminderText).not.toContain("referenced_image_paths")
    expect(result.transformed).not.toHaveProperty("imageEdit")
  })
})
