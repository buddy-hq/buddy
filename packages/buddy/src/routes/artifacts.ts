import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { ArtifactKindSchema, mapArtifactRouteError } from "../artifacts"
import {
  artifactIndexResponseSchema,
  listArtifactIndex,
} from "../learning/artifact-index"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { MermaidRoutes } from "./mermaid"
import { QuestionSetRoutes } from "./question-set"
import { FlashcardDeckRoutes } from "./flashcard-deck"
import { HtmlWidgetRoutes } from "./html-widget"
import { MediaPresentationRoutes } from "./media-presentation"
import { FigureRoutes } from "./figure"
import { FreeformFigureRoutes } from "./freeform-figure"

const artifactIndexQuerySchema = directoryQuerySchema.extend({
  kind: ArtifactKindSchema.optional(),
})

export const ArtifactsRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "artifacts.list",
      summary: "List workspace artifacts across normalized kinds",
      responses: {
        200: {
          description: "Workspace artifact index",
          content: {
            "application/json": {
              schema: resolver(artifactIndexResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 500),
      },
    }),
    validator("query", artifactIndexQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { kind } = c.req.valid("query")
            return Response.json(await listArtifactIndex({ directory: context.directory, kind }))
          },
          mapError: mapArtifactRouteError,
        }),
      ),
  )
  .route("/mermaid", MermaidRoutes)
  .route("/question-set", QuestionSetRoutes)
  .route("/flashcard-deck", FlashcardDeckRoutes)
  .route("/html-widget", HtmlWidgetRoutes)
  .route("/media-presentation", MediaPresentationRoutes)
  .route("/figure", FigureRoutes)
  .route("/freeform-figure", FreeformFigureRoutes)
