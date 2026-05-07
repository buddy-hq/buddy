import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

describe("active reading context", () => {
  test("includes a bounded current passage in active reading prompt context", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_active_reading_context",
      },
      body: {
        content: "Help me understand what I am reading",
        persona: "reading-buddy",
        reading: {
          resourceKey: "missing-resource-key",
          title: "Example Book",
          path: "books/example.epub",
          cfi: "epubcfi(/6/2)",
          index: 4,
          fraction: 0.42,
          tocLabel: "Chapter 3",
          pageLabel: "Page 18",
          locationLabel: "Location 120 / 400",
          currentPassageText:
            "This is the visible excerpt the learner is currently looking at in the reader.",
        },
      },
      projectConfig: config,
    })

    const parts = result.transformed.parts as Array<Record<string, unknown>>
    const reminderText = parts.find(
      (part) => typeof part.text === "string" && part.text.includes("<system-reminder>"),
    )?.text
    const systemText = result.transformed.system

    expect(typeof reminderText).toBe("string")
    expect(reminderText).toContain("current_passage:")
    expect(reminderText).toContain(
      "This is the visible excerpt the learner is currently looking at in the reader.",
    )
    expect(typeof systemText).toBe("string")
    expect(systemText).toContain("title=Example Book")
    expect(systemText).toContain("path=books/example.epub")
    expect(systemText).not.toContain("current_passage:")
    expect(systemText).not.toContain(
      "This is the visible excerpt the learner is currently looking at in the reader.",
    )
  })
})
