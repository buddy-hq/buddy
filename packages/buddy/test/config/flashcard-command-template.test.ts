import { describe, expect, test } from "bun:test"
import { Config } from "@buddy/backend/config"
import { buildOpenCodeConfigOverlay } from "../../src/config/opencode/overlay-builder"
import { createGitRepo } from "../helpers/repo"

describe("flashcard command template", () => {
  test("tells Buddy to delegate the resource identity and instruct ingest instead of substituting a summary", async () => {
    const repo = createGitRepo("buddy-flashcard-command-template-test")

    const config = await Config.getProject(repo)
    const overlay = await buildOpenCodeConfigOverlay({
      config,
      directory: repo,
    })

    const template = overlay.command?.flashcard?.template ?? ""

    expect(template).toContain("do not replace those resources with your own summary")
    expect(template).toContain("enumerate each relevant resource")
    expect(template).toContain("pedagogy_resource_ingest_full_text")
    expect(template).not.toContain("The subagent cannot read resources directly")
    expect(template).not.toContain("render_flashcard_deck")
  })
})
