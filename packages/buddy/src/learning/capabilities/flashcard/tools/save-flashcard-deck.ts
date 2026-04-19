import { ulid } from "ulid"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import { FlashcardService } from "../service"
import {
  DECK_CONFIG_DEFAULTS,
  FLASHCARD_DECK_KIND,
  FLASHCARD_SUBAGENT_ID,
  SaveFlashcardDeckInputSchema,
  SaveFlashcardDeckOutputSchema,
  type SaveFlashcardDeckInput,
  type SaveFlashcardDeckOutput,
} from "../types"

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const saveFlashcardDeckTool = createBuddyTool("save_flashcard_deck", {
  description:
    "Persist a fully-authored flashcard deck. Accepts a title and an array of note objects (each with type, fields, and optional tags). Returns a deck id for later rendering and review. Notes must be an array of objects, NOT a string.",
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

    const { notes, cards } = FlashcardService.buildNotesAndCards(
      deckID,
      parsed.notes,
      DECK_CONFIG_DEFAULTS,
    )

    const saved = await FlashcardService.save({
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
      deckUrl: FlashcardService.buildDeckUrl(ctx.directory, saved.deckID),
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

export { saveFlashcardDeckTool }
