import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { mapFlashcardRouteError } from "../learning/features/flashcards/errors"
import {
  listFlashcardDecks,
  readFlashcardDeck,
} from "../learning/features/flashcards/storage/read-deck"
import {
  getNextFlashcardForReview,
  submitFlashcardReview,
} from "../learning/features/flashcards/storage/review"
import {
  FLASHCARD_SUBAGENT_ID,
  FlashcardCardSchema,
  FlashcardDeckSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
} from "../learning/features/flashcards/types"

const deckIDParamSchema = z.object({
  deckID: z.string(),
})

const flashcardDeckListItemSchema = z.object({
  deckID: z.string(),
  kind: z.string(),
  title: z.string(),
  noteCount: z.number(),
  cardCount: z.number(),
  dueCounts: z.object({
    new: z.number(),
    learning: z.number(),
    review: z.number(),
  }),
  reviewAvailable: z.boolean(),
  createdAt: z.string(),
  createdBy: z.object({
    sessionID: z.string(),
    messageID: z.string(),
    callID: z.string(),
    subagent: z.literal(FLASHCARD_SUBAGENT_ID),
  }),
})

const flashcardDeckListResponseSchema = z.object({
  decks: z.array(flashcardDeckListItemSchema),
})

const nextCardResponseSchema = z.object({
  card: FlashcardCardSchema.nullable(),
})

export const FlashcardDeckRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "flashcardDecks.list",
      summary: "List persisted flashcard decks",
      responses: {
        200: {
          description: "Workspace flashcard decks",
          content: {
            "application/json": {
              schema: resolver(flashcardDeckListResponseSchema),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const decks = await listFlashcardDecks(context.directory)
            return Response.json({ decks })
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
  .get(
    "/:deckID",
    describeRoute({
      operationId: "flashcardDecks.read",
      summary: "Read a single flashcard deck with all notes and cards",
      responses: {
        200: {
          description: "Full flashcard deck",
          content: {
            "application/json": {
              schema: resolver(FlashcardDeckSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", deckIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const deck = await readFlashcardDeck(context.directory, c.req.valid("param").deckID)
            return Response.json(deck)
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
  .get(
    "/:deckID/next-card",
    describeRoute({
      operationId: "flashcardDecks.nextCard",
      summary: "Get the next due card for review",
      responses: {
        200: {
          description: "Next card to review, or null if none due",
          content: {
            "application/json": {
              schema: resolver(nextCardResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", deckIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const card = await getNextFlashcardForReview({
              directory: context.directory,
              deckID: c.req.valid("param").deckID,
            })
            return Response.json({ card: card ?? null })
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
  .post(
    "/:deckID/reviews",
    describeRoute({
      operationId: "flashcardDecks.submitReview",
      summary: "Submit a review answer for a card",
      responses: {
        200: {
          description: "Review result with updated card state",
          content: {
            "application/json": {
              schema: resolver(SubmitReviewOutputSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", deckIDParamSchema),
    validator("json", SubmitReviewInputSchema.omit({ deckID: true })),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { deckID } = c.req.valid("param")
            const payload = c.req.valid("json")
            const result = await submitFlashcardReview({
              directory: context.directory,
              deckID,
              cardID: payload.cardID,
              rating: payload.rating,
              timeTakenMs: payload.timeTakenMs,
            })
            return Response.json(result)
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
