import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import { FlashcardPath } from "../../src/learning/features/flashcards/storage/path"
import { todayISO } from "../../src/learning/features/flashcards/storage/read-deck"
import { Global } from "../../src/storage/global"
import {
  buildFlashcardNotesAndCards,
  saveFlashcardDeck,
} from "../../src/learning/features/flashcards/storage/save-deck"
import {
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  SaveFlashcardDeckOutputSchema,
} from "../../src/learning/features/flashcards/types"
import type { FlashcardDeck } from "../../src/learning/features/flashcards/types"
import type { SaveFlashcardDeckInput } from "../../src/learning/features/flashcards/tools/save-flashcard-deck"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

const OPEN_PROJECT_REGISTRY_FILE = path.join(Global.Path.state, "desktop-notebooks.json")
const OPEN_PROJECT_REGISTRY_BACKUP_FILE = `${OPEN_PROJECT_REGISTRY_FILE}.bak`
const OPEN_PROJECT_REGISTRY_LOCK_FILE = `${OPEN_PROJECT_REGISTRY_FILE}.lock`
const OPEN_PROJECT_REGISTRY_CLEANUP_LOCK_FILE = `${OPEN_PROJECT_REGISTRY_LOCK_FILE}.cleanup`
const OPEN_PROJECT_REGISTRY_CORRUPT_PREFIX = "desktop-notebooks.corrupt."
const OPEN_PROJECT_REGISTRY_CORRUPT_SUFFIX = ".json"

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

async function createStoredFlashcardDeck(directory: string): Promise<FlashcardDeck> {
  const deckID = ulid()
  const config = DeckConfigSchema.parse({
    ...DECK_CONFIG_DEFAULTS,
    learnSteps: [...DECK_CONFIG_DEFAULTS.learnSteps],
    relearnSteps: [...DECK_CONFIG_DEFAULTS.relearnSteps],
  })
  const { notes, cards } = buildFlashcardNotesAndCards(
    deckID,
    sampleFlashcardDeckInput().notes,
    DECK_CONFIG_DEFAULTS,
  )

  return saveFlashcardDeck({
    directory,
    deck: {
      deckID,
      kind: FLASHCARD_DECK_KIND,
      title: "Cell Biology Basics",
      config,
      notes,
      cards,
      source: "Biology lecture notes",
      createdAt: new Date().toISOString(),
      createdBy: {
        sessionID: "ses_storage_fixture",
        messageID: "msg_storage_fixture",
        callID: "call_storage_fixture",
        subagent: "flashcard-author",
      },
    },
  })
}

async function removeOpenProjectRegistryFiles(): Promise<void> {
  await Promise.all([
    fs.rm(OPEN_PROJECT_REGISTRY_FILE, { force: true }),
    fs.rm(OPEN_PROJECT_REGISTRY_BACKUP_FILE, { force: true }),
    fs.rm(OPEN_PROJECT_REGISTRY_LOCK_FILE, { force: true }),
    fs.rm(OPEN_PROJECT_REGISTRY_CLEANUP_LOCK_FILE, { force: true }),
  ])

  const entries = await fs
    .readdir(path.dirname(OPEN_PROJECT_REGISTRY_FILE), { withFileTypes: true })
    .catch(() => [])
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(OPEN_PROJECT_REGISTRY_CORRUPT_PREFIX) &&
          entry.name.endsWith(OPEN_PROJECT_REGISTRY_CORRUPT_SUFFIX),
      )
      .map((entry) => fs.rm(path.join(path.dirname(OPEN_PROJECT_REGISTRY_FILE), entry.name))),
  )
}

describe("flashcard tools and routes", () => {
  test("continues to serve allowed directory routes when the open-project registry is corrupt", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.dirname(OPEN_PROJECT_REGISTRY_FILE), { recursive: true })
    await fs.writeFile(OPEN_PROJECT_REGISTRY_FILE, "{", "utf8")

    try {
      const response = await app.request(
        `/api/flashcard-decks?directory=${encodeURIComponent(project.path)}`,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        decks: [],
      })
    } finally {
      await removeOpenProjectRegistryFiles()
    }
  })

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

  test("keeps valid decks visible while surfacing corrupt deck load errors", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const corruptDeckID = ulid()

    await fs.mkdir(FlashcardPath.deckDirectory(project.path, corruptDeckID), {
      recursive: true,
    })
    await fs.writeFile(FlashcardPath.deckFile(project.path, corruptDeckID), "{", "utf8")

    const response = await app.request(
      `/api/flashcard-decks?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      decks: Array<{ deckID: string }>
      loadErrors: Array<{ deckID: string; message: string }>
    }
    expect(body.decks.map((item) => item.deckID)).toEqual([deck.deckID])
    expect(body.loadErrors).toHaveLength(1)
    expect(body.loadErrors[0]?.deckID).toBe(corruptDeckID)
    expect(body.loadErrors[0]?.message).toContain("could not be loaded")
  })

  test("ignores corrupt review log lines when selecting the next due card", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)

    await fs.mkdir(FlashcardPath.reviewsDirectory(project.path, deck.deckID), {
      recursive: true,
    })
    await fs.writeFile(
      FlashcardPath.reviewFile(project.path, deck.deckID, todayISO()),
      "{not-json}\n",
      "utf8",
    )

    const response = await app.request(
      `/api/flashcard-decks/${deck.deckID}/next-card?directory=${encodeURIComponent(project.path)}`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { card: { cardID: string } | null }
    expect(body.card?.cardID).toBeString()
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
