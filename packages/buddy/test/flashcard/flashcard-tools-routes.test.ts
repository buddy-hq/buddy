import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import {
  ARTIFACT_CONTENT_DIRECTORIES,
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
} from "../../src/artifacts"
import { readFlashcardDeck } from "../../src/learning/features/flashcards/storage/read-deck"
import { writePendingFlashcardReviewTransaction } from "../../src/learning/features/flashcards/storage/review-transaction"
import { Global } from "../../src/storage/global"
import {
  buildFlashcardNotesAndCards,
  saveFlashcardDeck,
} from "../../src/learning/features/flashcards/storage/save-deck"
import {
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  ReviewRecordSchema,
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

function flashcardDeckFile(directory: string, artifactID: string): string {
  return ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.flashcardDeck,
    artifactID,
    ARTIFACT_CONTENT_FILES.flashcardDeck,
  )
}

function flashcardDeckDirectory(directory: string, artifactID: string): string {
  return ArtifactPath.artifactDirectory(directory, ARTIFACT_KINDS.flashcardDeck, artifactID)
}

function flashcardReviewFile(directory: string, artifactID: string, reviewID: string): string {
  return ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.flashcardDeck,
    artifactID,
    ARTIFACT_CONTENT_DIRECTORIES.flashcardReviews,
    `${reviewID}.json`,
  )
}

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
  const artifactID = ulid()
  const config = DeckConfigSchema.parse({
    ...DECK_CONFIG_DEFAULTS,
    learnSteps: [...DECK_CONFIG_DEFAULTS.learnSteps],
    relearnSteps: [...DECK_CONFIG_DEFAULTS.relearnSteps],
  })
  const { notes, cards } = buildFlashcardNotesAndCards(
    artifactID,
    sampleFlashcardDeckInput().notes,
    DECK_CONFIG_DEFAULTS,
  )

  return saveFlashcardDeck({
    directory,
    deck: {
      artifactID,
      kind: FLASHCARD_DECK_KIND,
      title: "Cell Biology Basics",
      config,
      notes,
      cards,
      source: "Biology lecture notes",
      createdAt: new Date().toISOString(),
      createdBy: {
        kind: "tool",
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
        `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        artifacts: [],
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
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      artifacts: Array<{
        artifactID: string
        origin: {
          sessionID: string
          messageID: string
          callID: string
          subagent: string
        }
      }>
    }

    expect(body.artifacts).toHaveLength(1)
    expect(body.artifacts[0]?.artifactID).toBe(saveOutput.artifactID)
    expect(body.artifacts[0]?.origin.sessionID).toBe("ses_flashcard_author")
    expect(body.artifacts[0]?.origin.messageID).toBe("msg_flashcard_author")
    expect(body.artifacts[0]?.origin.callID).toBeDefined()
    expect(body.artifacts[0]?.origin.subagent).toBe("flashcard-author")
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

    const artifactPath = flashcardDeckFile(project.path, saveOutput.artifactID)
    const deck = JSON.parse(await fs.readFile(artifactPath, "utf8")) as {
      config: Record<string, unknown>
    }
    await fs.writeFile(
      artifactPath,
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
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      artifacts: Array<{
        artifactID: string
        summary: {
          dueCounts: {
            new: number
            learning: number
            review: number
          }
          reviewAvailable: boolean
        }
      }>
    }

    expect(body.artifacts[0]?.artifactID).toBe(saveOutput.artifactID)
    expect(body.artifacts[0]?.summary.dueCounts.new).toBeGreaterThan(0)
    expect(body.artifacts[0]?.summary.reviewAvailable).toBe(false)
  })

  test("keeps valid decks visible while surfacing corrupt deck load errors", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const corruptDeck = await createStoredFlashcardDeck(project.path)

    await fs.writeFile(flashcardDeckFile(project.path, corruptDeck.artifactID), "{", "utf8")

    const response = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      artifacts: Array<{ artifactID: string }>
      loadErrors: Array<{ artifactID: string; message: string }>
    }
    expect(body.artifacts.map((item) => item.artifactID)).toEqual([deck.artifactID])
    expect(body.loadErrors).toHaveLength(1)
    expect(body.loadErrors[0]?.artifactID).toBe(corruptDeck.artifactID)
    expect(body.loadErrors[0]?.message).toContain("could not be loaded")
  })

  test("surfaces corrupt review records as artifact load errors", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const corruptReviewID = ulid()

    await fs.mkdir(
      path.join(
        flashcardDeckDirectory(project.path, deck.artifactID),
        ARTIFACT_CONTENT_DIRECTORIES.flashcardReviews,
      ),
      {
        recursive: true,
      },
    )
    await fs.writeFile(
      flashcardReviewFile(project.path, deck.artifactID, corruptReviewID),
      "{not-json}",
      "utf8",
    )

    const response = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      artifacts: Array<{ artifactID: string }>
      loadErrors: Array<{ artifactID: string; message: string }>
    }
    expect(body.artifacts).toEqual([])
    expect(body.loadErrors).toHaveLength(1)
    expect(body.loadErrors[0]?.artifactID).toBe(deck.artifactID)
  })

  test("recovers a pending review before serving the next card", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const card = deck.cards[0]
    expect(card).toBeDefined()
    if (!card) return

    const answeredAt = Date.now()
    const reviewID = ulid()
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: deck.cards.map((candidate) =>
        candidate.cardID === card.cardID
          ? {
              ...candidate,
              state: "review",
              due: answeredAt + 86_400_000,
              interval: 1,
              reps: 1,
            }
          : candidate,
      ),
    }
    const record = ReviewRecordSchema.parse({
      reviewID,
      cardID: card.cardID,
      rating: "good",
      answeredAt,
      timeTakenMs: 500,
      previousState: card.state,
      newState: "review",
      previousInterval: card.interval,
      newInterval: 1,
      previousEaseFactor: card.easeFactor,
      newEaseFactor: card.easeFactor,
    })

    await writePendingFlashcardReviewTransaction({
      directory: project.path,
      deck: updatedDeck,
      record,
    })

    const nextCardResponse = await app.request(
      `/api/artifacts/flashcard-deck/${deck.artifactID}/next-card?directory=${encodeURIComponent(project.path)}`,
    )
    expect(nextCardResponse.status).toBe(200)

    const recovered = await readFlashcardDeck(project.path, deck.artifactID)
    expect(recovered.cards[0]?.state).toBe("review")
    await expect(
      fs.readFile(flashcardReviewFile(project.path, deck.artifactID, reviewID), "utf8"),
    ).resolves.toContain(reviewID)
    await expect(
      fs.access(
        ArtifactPath.artifactFile(
          project.path,
          ARTIFACT_KINDS.flashcardDeck,
          deck.artifactID,
          ARTIFACT_CONTENT_DIRECTORIES.flashcardReviews,
          ARTIFACT_CONTENT_FILES.flashcardPendingReview,
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" })
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
      `/api/artifacts/flashcard-deck/${saveOutput.artifactID}?directory=${encodeURIComponent(project.path)}`,
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
