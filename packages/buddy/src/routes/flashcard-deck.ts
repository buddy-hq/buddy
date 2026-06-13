import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { mapArtifactRouteError } from "../artifacts"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readFlashcardDeck } from "../learning/features/flashcards/storage/read-deck"
import {
  FlashcardCardNotFoundError,
  getNextFlashcardForReview,
  submitFlashcardReview,
} from "../learning/features/flashcards/storage/review"
import {
  FlashcardCardSchema,
  FlashcardDeckSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
} from "../learning/features/flashcards/types"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const nextCardResponseSchema = z.object({
  card: FlashcardCardSchema.nullable(),
})

function mapFlashcardRouteError(error: unknown): Response | undefined {
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return mapArtifactRouteError(error)
}

export const FlashcardDeckRoutes = new Hono()
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "flashcardDeck.read",
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
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const deck = await readFlashcardDeck(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return Response.json(deck)
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/next-card",
    describeRoute({
      operationId: "flashcardDeck.nextCard",
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
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const card = await getNextFlashcardForReview({
              directory: context.directory,
              artifactID: c.req.valid("param").artifactID,
            })
            return Response.json({ card: card ?? null })
          },
          mapError: mapFlashcardRouteError,
        }),
      ),
  )
  .post(
    "/:artifactID/reviews",
    describeRoute({
      operationId: "flashcardDeck.submitReview",
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
    validator("param", artifactIDParamSchema),
    validator("json", SubmitReviewInputSchema.omit({ artifactID: true })),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { artifactID } = c.req.valid("param")
            const payload = c.req.valid("json")
            const result = await submitFlashcardReview({
              directory: context.directory,
              artifactID,
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
