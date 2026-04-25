import { ulid } from "ulid"
import z from "zod"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import SAVE_FLASHCARD_DECK_DESCRIPTION from "./save-flashcard-deck.md"
import { FlashcardPath } from "../path"
import { buildFlashcardNotesAndCards, saveFlashcardDeck } from "../save-deck"
import {
  DECK_CONFIG_DEFAULTS,
  FLASHCARD_DECK_KIND,
  FLASHCARD_SUBAGENT_ID,
  SaveFlashcardDeckOutputSchema,
  type SaveFlashcardDeckOutput,
} from "../types"

const nonEmptyString = z.string().trim().min(1)

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

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const saveFlashcardDeckTool = createBuddyTool("save_flashcard_deck", {
  description: SAVE_FLASHCARD_DECK_DESCRIPTION,
  parameters: SaveFlashcardDeckInputSchema,
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
    const deckID = ulid()
    const createdAt = new Date().toISOString()

    const { notes, cards } = buildFlashcardNotesAndCards(deckID, parsed.notes, DECK_CONFIG_DEFAULTS)

    const saved = await saveFlashcardDeck({
      directory: ctx.directory,
      deck: {
        deckID,
        kind: FLASHCARD_DECK_KIND,
        title: parsed.title,
        config: {
          ...DECK_CONFIG_DEFAULTS,
          learnSteps: [...DECK_CONFIG_DEFAULTS.learnSteps],
          relearnSteps: [...DECK_CONFIG_DEFAULTS.relearnSteps],
        },
        notes,
        cards,
        ...(parsed.source ? { source: parsed.source } : {}),
        createdAt,
        createdBy: {
          sessionID: String(ctx.sessionID),
          messageID: String(ctx.messageID),
          callID: createdByCallID(ctx),
          subagent: FLASHCARD_SUBAGENT_ID,
        },
      },
    })

    const output: SaveFlashcardDeckOutput = SaveFlashcardDeckOutputSchema.parse({
      deckID: saved.deckID,
      kind: saved.kind,
      title: saved.title,
      noteCount: saved.notes.length,
      cardCount: saved.cards.length,
      deckPath: FlashcardPath.deckFile(ctx.directory, saved.deckID),
    })

    return {
      title: "Saved flashcard deck",
      output: JSON.stringify(output, null, 2),
      metadata: {
        artifact: "SaveFlashcardDeckOutput",
        value: output,
      },
    }
  },
})

export { saveFlashcardDeckTool, SaveFlashcardDeckInputSchema, SaveFlashcardNoteInputSchema }
export type { SaveFlashcardDeckInput, SaveFlashcardNoteInput }
