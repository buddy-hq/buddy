import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { READER_ANCHOR_KIND_PDF_POSITION } from "@buddy/reader-contract"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

function readSystemReminder(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const parts: unknown[] = value
  for (const part of parts) {
    if (typeof part !== "object" || part === null || !("text" in part)) continue
    if (typeof part.text === "string" && part.text.includes("<system-reminder>")) {
      return part.text
    }
  }
  return undefined
}

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
        persona: "buddy",
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

    const reminderText = readSystemReminder(result.transformed.parts)
    const systemText = result.transformed.system

    expect(typeof reminderText).toBe("string")
    expect(reminderText).toContain("current_passage:")
    expect(reminderText).toContain(
      "This is the visible excerpt the learner is currently looking at in the reader.",
    )
    expect(reminderText).toContain("position=CFI epubcfi(/6/2)")
    expect(typeof systemText).toBe("string")
    expect(systemText).toContain("title=Example Book")
    expect(systemText).toContain("path=books/example.epub")
    expect(systemText).not.toContain("current_passage:")
    expect(systemText).not.toContain(
      "This is the visible excerpt the learner is currently looking at in the reader.",
    )
  })

  test("describes PDF positions and reading trail without fabricating CFIs", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const anchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 2,
      xRatio: 0.25,
      yRatio: 0.4,
    }

    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_active_pdf_context",
      },
      body: {
        content: "Explain this PDF page",
        persona: "buddy",
        reading: {
          title: "Example PDF",
          path: "books/example.pdf",
          location: {
            anchor,
            fraction: 0.2,
            pageLabel: "iii",
            locationLabel: "Page iii of 12",
          },
          readingTrail: [
            {
              label: "Page iii",
              anchor,
              fraction: 0.2,
            },
          ],
        },
      },
      projectConfig: config,
    })

    const reminderText = readSystemReminder(result.transformed.parts)
    expect(reminderText).toContain("position=Page iii, 25% across, 40% down")
    expect(reminderText).toContain(
      "Page iii (position=Page 3, 25% across, 40% down) (fraction=0.2)",
    )
    expect(reminderText).not.toContain("cfi=")
  })
})
