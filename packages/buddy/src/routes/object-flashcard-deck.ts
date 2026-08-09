import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  directoryQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyHeaderSchema,
  mapIdempotencyRouteError,
  routeErrors,
  runRouteTask,
  withDirectoryRoute,
} from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import { readFlashcardDeckObject } from "../learning/features/flashcards/storage/read-deck"
import {
  FlashcardCardNotFoundError,
  FlashcardCardNotQueuedError,
  getQueuedFlashcardObjectsForReview,
  submitFlashcardObjectReview,
} from "../learning/features/flashcards/storage/review"
import {
  DEFAULT_FLASHCARD_QUEUE_FETCH_LIMIT,
  MAX_FLASHCARD_QUEUE_FETCH_LIMIT,
} from "../learning/features/flashcards/storage/queue"
import {
  FlashcardDeckSchema,
  FlashcardQueuedCardsSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
} from "../learning/features/flashcards/types"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const queuedCardsQuerySchema = directoryQuerySchema.extend({
  fetchLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FLASHCARD_QUEUE_FETCH_LIMIT)
    .default(DEFAULT_FLASHCARD_QUEUE_FETCH_LIMIT),
})

function mapFlashcardObjectRouteError(error: unknown): Response | undefined {
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof FlashcardCardNotQueuedError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return mapIdempotencyRouteError(error) ?? mapBuddyObjectRouteError(error)
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
    "/:objectID/queued-cards",
    describeRoute({
      operationId: "objectFlashcardDeck.queuedCards",
      summary: "Get authoritative queued cards and remaining counts for a flashcard deck",
      responses: {
        200: {
          description: "Queued cards and counts produced by the same scheduler queue",
          content: {
            "application/json": {
              schema: resolver(FlashcardQueuedCardsSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", queuedCardsQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const query = c.req.valid("query")
            const queue = await getQueuedFlashcardObjectsForReview({
              directory: context.directory,
              objectID: c.req.valid("param").objectID,
              fetchLimit: query.fetchLimit,
            })
            return c.json(queue)
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
        ...routeErrors(400, 403, 404, 409, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("header", idempotencyHeaderSchema),
    validator("json", SubmitReviewInputSchema.omit({ objectID: true })),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { objectID } = c.req.valid("param")
            const submissionID = c.req.valid("header")[IDEMPOTENCY_KEY_HEADER]
            const payload = c.req.valid("json")
            const result = await submitFlashcardObjectReview({
              directory: context.directory,
              objectID,
              cardID: payload.cardID,
              queueLease: payload.queueLease,
              rating: payload.rating,
              timeTakenMs: payload.timeTakenMs,
              submissionID,
            })
            return c.json(result)
          },
          mapError: mapFlashcardObjectRouteError,
        }),
      ),
  )
