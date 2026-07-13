import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import { createIdempotencyKeyDigest } from "../../src/http/idempotency"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectResultSchema,
  generateObjectID,
  type BuddyObjectRef,
  type BuddyObjectResult,
} from "../../src/objects"
import { readFlashcardDeckObject } from "../../src/learning/features/flashcards/storage/read-deck"
import { writePendingFlashcardObjectReviewTransaction } from "../../src/learning/features/flashcards/storage/review-transaction"
import { Global } from "../../src/storage/global"
import {
  buildFlashcardNotesAndCards,
  flashcardDeckObjectStatePath,
  saveFlashcardDeckObject,
} from "../../src/learning/features/flashcards/storage/save-deck"
import {
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  FlashcardDeckSchema,
  ReviewRecordSchema,
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
const REVIEW_DIRECTORY_NAME = "reviews"
const PENDING_REVIEW_FILE_NAME = "pending-review.json"
const REVIEW_IDEMPOTENCY_DIRECTORY_NAME = "idempotency"

const ObjectListBodySchema = z
  .object({
    objects: z.array(
      z
        .object({
          objectID: z.string(),
          kind: z.literal(BUDDY_OBJECT_KINDS.flashcardDeck),
          title: z.string(),
        })
        .passthrough(),
    ),
    loadErrors: z.array(
      z
        .object({
          objectID: z.string().nullable(),
          kind: z.string().nullable(),
          message: z.string(),
        })
        .passthrough(),
    ),
  })
  .strict()

const ObjectReadBodySchema = z
  .object({
    status: z.literal("ready"),
    manifest: z
      .object({
        objectID: z.string(),
        kind: z.literal(BUDDY_OBJECT_KINDS.flashcardDeck),
        origin: z
          .object({
            kind: z.literal("tool"),
            sessionID: z.string(),
            messageID: z.string(),
            callID: z.string(),
            subagent: z.string().optional(),
          })
          .strict(),
      })
      .passthrough(),
  })
  .strict()

const NextCardBodySchema = z
  .object({
    card: z
      .object({
        cardID: z.string(),
      })
      .passthrough()
      .nullable(),
  })
  .strict()

function flashcardDeckStateFile(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    flashcardDeckObjectStatePath(),
  )
}

function flashcardReviewFile(directory: string, objectID: string, reviewID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    "state",
    REVIEW_DIRECTORY_NAME,
    `${reviewID}.json`,
  )
}

function pendingFlashcardReviewFile(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    "state",
    REVIEW_DIRECTORY_NAME,
    PENDING_REVIEW_FILE_NAME,
  )
}

function flashcardReviewIdempotencyFile(
  directory: string,
  objectID: string,
  submissionID: string,
): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    "state",
    REVIEW_DIRECTORY_NAME,
    REVIEW_IDEMPOTENCY_DIRECTORY_NAME,
    `${createIdempotencyKeyDigest(submissionID)}.json`,
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

function requireFlashcardRef(result: BuddyObjectResult): BuddyObjectRef {
  const ref = result.primaryRef
  expect(ref).not.toBeNull()
  if (!ref) {
    throw new Error("Expected flashcard object ref.")
  }
  expect(ref.kind).toBe(BUDDY_OBJECT_KINDS.flashcardDeck)
  return ref
}

function requireRevisionID(ref: BuddyObjectRef): string {
  expect(ref.revisionID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  if (!ref.revisionID) {
    throw new Error("Expected flashcard revision id.")
  }
  return ref.revisionID
}

async function createStoredFlashcardDeck(directory: string): Promise<FlashcardDeck> {
  const objectID = generateObjectID()
  const config = DeckConfigSchema.parse({
    ...DECK_CONFIG_DEFAULTS,
    learnSteps: [...DECK_CONFIG_DEFAULTS.learnSteps],
    relearnSteps: [...DECK_CONFIG_DEFAULTS.relearnSteps],
  })
  const { notes, cards } = buildFlashcardNotesAndCards(
    objectID,
    sampleFlashcardDeckInput().notes,
    DECK_CONFIG_DEFAULTS,
  )

  const saved = await saveFlashcardDeckObject({
    directory,
    deck: {
      objectID,
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
  return saved.deck
}

async function saveFlashcardDeckWithTool(
  directory: string,
  sessionID: string,
): Promise<{
  result: BuddyObjectResult
  ref: BuddyObjectRef
  revisionID: string
}> {
  await ensureBuddyPluginTools(directory)
  const result = await OpenCodeInstance.provide({
    directory,
    async fn() {
      const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
      const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

      return saveFlashcardDeck.execute(
        sampleFlashcardDeckInput(),
        createToolContext({
          sessionID,
          messageID: `msg_${sessionID}`,
          agent: "flashcard-author",
        }),
      )
    },
  })
  const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
  const ref = requireFlashcardRef(objectResult)
  const revisionID = requireRevisionID(ref)
  return { result: objectResult, ref, revisionID }
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
        `/api/objects?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
      )

      expect(response.status).toBe(200)
      expect(ObjectListBodySchema.parse(await response.json()).objects).toEqual([])
    } finally {
      await removeOpenProjectRegistryFiles()
    }
  })

  test("lists deck provenance for decks created by the flashcard author session", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveFlashcardDeckWithTool(project.path, "ses_flashcard_author")

    const response = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = ObjectListBodySchema.parse(await response.json())
    expect(body.objects).toHaveLength(1)
    expect(body.objects[0]?.objectID).toBe(saved.ref.objectID)

    const readResponse = await app.request(
      `/api/objects/${saved.ref.kind}/${saved.ref.objectID}?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    expect(readResponse.status).toBe(200)
    const readBody = ObjectReadBodySchema.parse(await readResponse.json())
    expect(readBody.manifest.origin.sessionID).toBe("ses_flashcard_author")
    expect(readBody.manifest.origin.messageID).toBe("msg_ses_flashcard_author")
    expect(readBody.manifest.origin.callID).toBeDefined()
    expect(readBody.manifest.origin.subagent).toBe("flashcard-author")
  })

  test("returns no next card when the configured new-card quota is zero", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveFlashcardDeckWithTool(project.path, "ses_flashcard_quota")

    const statePath = flashcardDeckStateFile(project.path, saved.ref.objectID)
    const deck = FlashcardDeckSchema.parse(JSON.parse(await fs.readFile(statePath, "utf8")))
    const updatedDeck = FlashcardDeckSchema.parse({
      ...deck,
      config: {
        ...deck.config,
        newPerDay: 0,
      },
    })
    await fs.writeFile(statePath, JSON.stringify(updatedDeck), "utf8")

    const response = await app.request(
      `/api/objects/flashcard-deck/${saved.ref.objectID}/next-card?directory=${encodeURIComponent(
        project.path,
      )}`,
    )

    expect(response.status).toBe(200)
    expect(NextCardBodySchema.parse(await response.json()).card).toBeNull()
  })

  test("returns the committed flashcard review for an idempotent retry", async () => {
    await using project = await tmpdir({ git: true })
    const saved = await saveFlashcardDeckWithTool(project.path, "ses_flashcard_idempotency")
    const nextCardResponse = await app.request(
      `/api/objects/flashcard-deck/${saved.ref.objectID}/next-card?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    const card = NextCardBodySchema.parse(await nextCardResponse.json()).card
    expect(card).not.toBeNull()
    if (!card) return

    const submissionID = crypto.randomUUID()
    const submit = () =>
      app.request(
        `/api/objects/flashcard-deck/${saved.ref.objectID}/reviews?directory=${encodeURIComponent(
          project.path,
        )}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": submissionID,
          },
          body: JSON.stringify({
            cardID: card.cardID,
            rating: "good",
            timeTakenMs: 500,
          }),
        },
      )

    const first = await submit()
    const retry = await submit()
    const conflictingRetry = await app.request(
      `/api/objects/flashcard-deck/${saved.ref.objectID}/reviews?directory=${encodeURIComponent(
        project.path,
      )}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": submissionID,
        },
        body: JSON.stringify({
          cardID: card.cardID,
          rating: "hard",
          timeTakenMs: 500,
        }),
      },
    )
    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect(conflictingRetry.status).toBe(409)
    expect(await retry.json()).toEqual(await first.json())

    const deck = await readFlashcardDeckObject(project.path, saved.ref.objectID)
    expect(deck.cards.find((candidate) => candidate.cardID === card.cardID)?.reps).toBe(1)

    await fs.writeFile(
      flashcardReviewIdempotencyFile(project.path, saved.ref.objectID, submissionID),
      "{",
      "utf8",
    )
    const nextCardAfterCompletedHistory = await app.request(
      `/api/objects/flashcard-deck/${saved.ref.objectID}/next-card?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    expect(nextCardAfterCompletedHistory.status).toBe(200)
  })

  test("keeps valid decks visible while surfacing corrupt manifest load errors", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const corruptDeck = await createStoredFlashcardDeck(project.path)

    await fs.writeFile(
      BuddyObjectPath.manifestFile(
        project.path,
        BUDDY_OBJECT_KINDS.flashcardDeck,
        corruptDeck.objectID,
      ),
      "{",
      "utf8",
    )

    const response = await app.request(
      `/api/objects?directory=${encodeURIComponent(project.path)}&kind=flashcard-deck`,
    )

    expect(response.status).toBe(200)
    const body = ObjectListBodySchema.parse(await response.json())
    expect(body.objects.map((item) => item.objectID)).toEqual([deck.objectID])
    expect(body.loadErrors).toHaveLength(1)
    expect(body.loadErrors[0]?.objectID).toBe(corruptDeck.objectID)
    expect(body.loadErrors[0]?.message).toContain("could not be loaded")
  })

  test("recovers a pending review before serving the next card", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await createStoredFlashcardDeck(project.path)
    const card = deck.cards[0]
    expect(card).toBeDefined()
    if (!card) return

    const answeredAt = Date.now()
    const reviewID = generateObjectID()
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
    const submissionID = crypto.randomUUID()
    const output = {
      cardID: card.cardID,
      newState: "review" as const,
      newInterval: 1,
      newEaseFactor: card.easeFactor,
      nextDue: answeredAt + 86_400_000,
      isLeech: false,
    }

    await writePendingFlashcardObjectReviewTransaction({
      directory: project.path,
      deck: updatedDeck,
      record,
      submissionID,
      output,
    })

    const nextCardResponse = await app.request(
      `/api/objects/flashcard-deck/${deck.objectID}/next-card?directory=${encodeURIComponent(
        project.path,
      )}`,
    )
    expect(nextCardResponse.status).toBe(200)

    const recovered = await readFlashcardDeckObject(project.path, deck.objectID)
    expect(recovered.cards[0]?.state).toBe("review")
    await expect(
      fs.readFile(flashcardReviewFile(project.path, deck.objectID, reviewID), "utf8"),
    ).resolves.toContain(reviewID)
    await expect(
      fs.access(pendingFlashcardReviewFile(project.path, deck.objectID)),
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

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const saveFlashcardDeck = requireTool(tools, "save_flashcard_deck")

        return saveFlashcardDeck.execute(
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
      },
    })
    const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
    const ref = requireFlashcardRef(objectResult)

    const response = await app.request(
      `/api/objects/flashcard-deck/${ref.objectID}/deck?directory=${encodeURIComponent(
        project.path,
      )}`,
    )

    expect(response.status).toBe(200)
    const body = FlashcardDeckSchema.parse(await response.json())
    expect(body.cards.map((card) => card.templateIdx)).toEqual([1, 3])
  })
})
