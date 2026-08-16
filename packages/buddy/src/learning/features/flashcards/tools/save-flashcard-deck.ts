import z from "zod"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  generateObjectID,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import SAVE_FLASHCARD_DECK_DESCRIPTION from "./save-flashcard-deck.md"
import { buildFlashcardNotesAndCards, saveFlashcardDeckObject } from "../storage/save-deck"
import { DECK_CONFIG_DEFAULTS, FLASHCARD_DECK_KIND, FLASHCARD_SUBAGENT_ID } from "../types"

const SaveFlashcardNoteInputSchema = z.object({
  type: z
    .enum(["basic", "cloze"])
    .describe(
      'Card type. "basic" = front/back pair. "cloze" = fill-in-the-blank with {{c1::answer}} syntax.',
    ),
  fields: z
    .union([
      z.object({
        front: nonEmptyString.describe("The question or prompt shown on the front of the card."),
        back: nonEmptyString.describe("The answer shown on the back of the card."),
      }),
      z.object({
        text: nonEmptyString.describe(
          'Text with cloze deletions using {{c1::answer}} syntax. Example: "The {{c1::mitochondria}} is the powerhouse of the {{c2::cell}}."',
        ),
      }),
    ])
    .describe(
      'For type "basic": { "front": "question text", "back": "answer text" }. For type "cloze": { "text": "The {{c1::mitochondria}} is the powerhouse of the cell." }.',
    ),
  tags: z.array(nonEmptyString).default([]).describe("Optional tags for the note."),
  source: nonEmptyString.optional().describe("Optional source reference for this note."),
})

const SaveFlashcardDeckInputSchema = z.object({
  title: nonEmptyString.describe("Human-readable deck title."),
  notes: z
    .array(SaveFlashcardNoteInputSchema)
    .min(1)
    .describe(
      "Array of note objects. Each note is an object with type, fields, and optional tags/source. One note produces one or more review cards.",
    ),
  source: nonEmptyString
    .optional()
    .describe("Optional source reference for the entire deck (e.g. file name or URL)."),
})

type SaveFlashcardNoteInput = z.infer<typeof SaveFlashcardNoteInputSchema>
type SaveFlashcardDeckInput = z.infer<typeof SaveFlashcardDeckInputSchema>

function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function createdByCallID(ctx: BuddyToolContext): string {
  const callID = ctx.callID
  if (callID !== undefined && callID.trim().length > 0) return callID
  return "unknown"
}

function buildSaveFlashcardDeckObjectResult(input: {
  objectID: string
  revisionID: string
  title: string
  noteCount: number
  cardCount: number
}): BuddyObjectResult {
  const ref = {
    kind: BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID: input.objectID,
    revisionID: input.revisionID,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: `Saved flashcard deck ${input.title}.`,
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.flashcardDeck,
        objectID: input.objectID,
        title: input.title,
        status: "ready",
        lifecycle: "revisioned",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: "review",
        surface: "inline",
        data: {
          renderer: "flashcard-deck",
          title: input.title,
          noteCount: input.noteCount,
          cardCount: input.cardCount,
        },
        autoOpen: null,
      },
    ],
  })
}

const saveFlashcardDeckTool = createBuddyTool({
  id: "save_flashcard_deck",
  produces: {
    buddyObjectResult: true,
  },
  description: SAVE_FLASHCARD_DECK_DESCRIPTION,
  parameters: SaveFlashcardDeckInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "book",
    renderer: "flashcard-deck",
    layoutRole: "card-output",
    phases: {
      pending: {
        action: "Saving flashcard deck",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      running: {
        action: "Saving flashcard deck",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      completed: {
        action: "Saved flashcard deck",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      error: {
        action: "Failed to save flashcard deck",
        detail: ({ input }) => parseToolInputString(input.title),
      },
    },
  },
  async execute(params: SaveFlashcardDeckInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "save_flashcard_deck",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: FLASHCARD_DECK_KIND,
      },
    })

    const parsed = SaveFlashcardDeckInputSchema.parse(params)
    const objectID = generateObjectID()
    const createdAt = new Date().toISOString()

    const { notes, cards } = buildFlashcardNotesAndCards(
      objectID,
      parsed.notes,
      DECK_CONFIG_DEFAULTS,
    )

    const saved = await saveFlashcardDeckObject({
      directory: ctx.directory,
      deck: Object.assign(
        {
          objectID,
          kind: FLASHCARD_DECK_KIND,
          title: parsed.title,
          config: {
            ...DECK_CONFIG_DEFAULTS,
            learnSteps: [...DECK_CONFIG_DEFAULTS.learnSteps],
            relearnSteps: [...DECK_CONFIG_DEFAULTS.relearnSteps],
          },
          notes,
          cards,
          createdAt,
          createdBy: {
            kind: "tool" as const,
            sessionID: String(ctx.sessionID),
            messageID: String(ctx.messageID),
            callID: createdByCallID(ctx),
            subagent: FLASHCARD_SUBAGENT_ID,
          },
        },
        parsed.source ? { source: parsed.source } : undefined,
      ),
    })

    const buddyObjectResult = buildSaveFlashcardDeckObjectResult({
      objectID: saved.objectID,
      revisionID: saved.revisionID,
      title: saved.deck.title,
      noteCount: saved.deck.notes.length,
      cardCount: saved.deck.cards.length,
    })

    return {
      title: "Saved flashcard deck",
      output: [
        buddyObjectResult.message,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `revision_id=${saved.revisionID}`,
        `note_count=${saved.deck.notes.length}`,
        `card_count=${saved.deck.cards.length}`,
      ].join("\n"),
      metadata: {
        buddyObjectResult,
      },
    }
  },
})

export { saveFlashcardDeckTool, SaveFlashcardDeckInputSchema, SaveFlashcardNoteInputSchema }
export type { SaveFlashcardDeckInput, SaveFlashcardNoteInput }
