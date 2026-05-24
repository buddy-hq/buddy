import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import { FlashcardPath } from "../../src/learning/features/flashcards/storage/path"
import { SaveFlashcardDeckOutputSchema } from "../../src/learning/features/flashcards/types"
import type { SaveFlashcardDeckInput } from "../../src/learning/features/flashcards/tools/save-flashcard-deck"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, ensureBuddyPluginTools, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

function sampleFlashcardDeckInput(): SaveFlashcardDeckInput {
  return {
    title: "Cell Biology Basics",
    notes: [
      {
        type: "basic",
        fields: {
          front: "What organelle produces ATP in eukaryotic cells?",
          back: "The mitochondrion.",
        },
        tags: [],
      },
      {
        type: "cloze",
        fields: {
          text: "The {{c1::nucleus}} stores the cell's {{c2::genetic material}}.",
        },
        tags: [],
      },
    ],
    source: "Biology lecture notes",
  }
}

describe("flashcard tools and routes", () => {
  test("lists deck provenance for decks created by the flashcard author session", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

        const result = await saveFlashcardDeck.execute(
          sampleFlashcardDeckInput(),
          createToolContext({
            sessionID: "ses_flashcard_author",
            messageID: "msg_flashcard_author",
            agent: "flashcard-author",
          }),
        )

        return SaveFlashcardDeckOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const response = await app.request(
      `/api/flashcard-decks?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      decks: Array<{
        deckID: string
        createdBy: {
          sessionID: string
          messageID: string
          callID: string
          subagent: string
        }
      }>
    }

    expect(body.decks).toHaveLength(1)
    expect(body.decks[0]?.deckID).toBe(saveOutput.deckID)
    expect(body.decks[0]?.createdBy.sessionID).toBe("ses_flashcard_author")
    expect(body.decks[0]?.createdBy.messageID).toBe("msg_flashcard_author")
    expect(body.decks[0]?.createdBy.callID).toBeDefined()
    expect(body.decks[0]?.createdBy.subagent).toBe("flashcard-author")
  })

  test("reports review availability instead of assuming due counts are immediately reviewable", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

        const result = await saveFlashcardDeck.execute(
          sampleFlashcardDeckInput(),
          createToolContext({
            sessionID: "ses_flashcard_author",
            messageID: "msg_flashcard_author",
            agent: "flashcard-author",
          }),
        )

        return SaveFlashcardDeckOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const deckPath = FlashcardPath.deckFile(project.path, saveOutput.deckID)
    const deck = JSON.parse(await fs.readFile(deckPath, "utf8")) as {
      config: Record<string, unknown>
    }
    await fs.writeFile(
      deckPath,
      JSON.stringify({
        ...deck,
        config: {
          ...deck.config,
          newPerDay: 0,
        },
      }),
      "utf8",
    )

    const response = await app.request(
      `/api/flashcard-decks?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      decks: Array<{
        deckID: string
        dueCounts: {
          new: number
          learning: number
          review: number
        }
        reviewAvailable: boolean
      }>
    }

    expect(body.decks[0]?.deckID).toBe(saveOutput.deckID)
    expect(body.decks[0]?.dueCounts.new).toBeGreaterThan(0)
    expect(body.decks[0]?.reviewAvailable).toBe(false)
  })

  test("rejects malformed cloze notes that contain no cloze markers", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
          const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

          await saveFlashcardDeck.execute(
            {
              title: "Broken deck",
              notes: [
                {
                  type: "cloze",
                  fields: {
                    text: "This note has no deletions.",
                  },
                  tags: [],
                },
              ],
            },
            createToolContext({
              sessionID: "ses_flashcard_author",
              messageID: "msg_flashcard_author",
              agent: "flashcard-author",
            }),
          )
        },
      }),
    ).rejects.toThrow("must contain at least one")
  })

  test("preserves non-contiguous cloze ordinals in generated cards", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const saveOutput = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

        const result = await saveFlashcardDeck.execute(
          {
            title: "Non-contiguous cloze deck",
            notes: [
              {
                type: "cloze",
                fields: {
                  text: "The {{c2::nucleus}} stores the {{c4::genetic material}}.",
                },
                tags: [],
              },
            ],
          },
          createToolContext({
            sessionID: "ses_flashcard_author",
            messageID: "msg_flashcard_author",
            agent: "flashcard-author",
          }),
        )

        return SaveFlashcardDeckOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const response = await app.request(
      `/api/flashcard-decks/${saveOutput.deckID}?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      cards: Array<{
        templateIdx: number
      }>
    }

    expect(body.cards.map((card) => card.templateIdx)).toEqual([1, 3])
  })
})
