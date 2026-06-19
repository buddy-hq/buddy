import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import { readFlashcardDeckObject } from "../learning/features/flashcards/storage/read-deck"
import {
  FlashcardCardNotFoundError,
  getNextFlashcardObjectForReview,
  submitFlashcardObjectReview,
} from "../learning/features/flashcards/storage/review"
import {
  FlashcardCardSchema,
  FlashcardDeckSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
} from "../learning/features/flashcards/types"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const nextCardResponseSchema = z
  .object({
    card: FlashcardCardSchema.nullable(),
  })
  .strict()

function mapFlashcardObjectRouteError(error: unknown): Response | undefined {
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return mapBuddyObjectRouteError(error)
}

export const ObjectFlashcardDeckRoutes = new Hono()
  .get(
    "/:objectID/deck",
    describeRoute({
      operationId: "objectFlashcardDeck.readDeck",
      summary: "Read a flashcard-deck review payload with all notes and cards",
      responses: {
        200: {
          description: "Full flashcard-deck review payload",
          content: {
            "application/json": {
              schema: resolver(FlashcardDeckSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const deck = await readFlashcardDeckObject(
              context.directory,
              c.req.valid("param").objectID,
            )
            return c.json(deck)
          },
          mapError: mapFlashcardObjectRouteError,
        }),
      ),
  )
  .get(
    "/:objectID/next-card",
    describeRoute({
      operationId: "objectFlashcardDeck.nextCard",
      summary: "Get the next due card for a flashcard-deck object review",
      responses: {
        200: {
          description: "Next card to review, or null if none due",
          content: {
            "application/json": {
              schema: resolver(nextCardResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const card = await getNextFlashcardObjectForReview({
              directory: context.directory,
              objectID: c.req.valid("param").objectID,
            })
            return c.json({ card: card ?? null })
          },
          mapError: mapFlashcardObjectRouteError,
        }),
      ),
  )
  .post(
    "/:objectID/reviews",
    describeRoute({
      operationId: "objectFlashcardDeck.submitReview",
      summary: "Submit a review answer for a flashcard-deck object card",
      responses: {
        200: {
          description: "Review result with updated card state",
          content: {
            "application/json": {
              schema: resolver(SubmitReviewOutputSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", SubmitReviewInputSchema.omit({ objectID: true })),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { objectID } = c.req.valid("param")
            const payload = c.req.valid("json")
            const result = await submitFlashcardObjectReview({
              directory: context.directory,
              objectID,
              cardID: payload.cardID,
              rating: payload.rating,
              timeTakenMs: payload.timeTakenMs,
            })
            return c.json(result)
          },
          mapError: mapFlashcardObjectRouteError,
        }),
      ),
  )
