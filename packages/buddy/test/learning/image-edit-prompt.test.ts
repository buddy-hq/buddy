import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

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

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    const reminder = parts.find(
      (part) =>
        part.synthetic === true &&
        typeof part.text === "string" &&
        part.text.includes("Edit the attached image"),
    )

    expect(reminder?.text).toContain("<system-reminder>\nEdit the attached image\n")
    expect(reminder?.text).not.toContain("image_edit_request")
    expect(reminder?.text).not.toContain("referenced_image_paths")
    expect(result.transformed).not.toHaveProperty("imageEdit")
  })
})
