import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readBoundedRequestBody, replayRequestBody } from "../http/bounded-request-body"
import { annotateChatMessage, captureComposerNote } from "../notes/chat-capture"
import { mapNotesError } from "../notes/errors"
import { createStandaloneNote, listNotes, readNote, renameNote, updateNote } from "../notes/library"
import {
  BUDDY_NOTE_TYPES,
  NOTE_CAPTURE_IMAGE_MIME_TYPES,
  NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS,
  NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS,
  NOTE_CAPTURE_MAX_IMAGES,
} from "../notes/types"

const MAX_NOTE_CONTENT_CHARACTERS = 5_000_000
const MAX_CAPTURE_CHARACTERS = 100_000
const JSON_STRING_MAX_BYTES_PER_CHARACTER = 6
const CAPTURE_REQUEST_FIXED_BYTES = 4 * 1024
const MAX_CAPTURE_REQUEST_BODY_BYTES =
  NOTE_CAPTURE_MAX_IMAGES *
    (NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS +
      NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS * JSON_STRING_MAX_BYTES_PER_CHARACTER) +
  MAX_CAPTURE_CHARACTERS * JSON_STRING_MAX_BYTES_PER_CHARACTER +
  CAPTURE_REQUEST_FIXED_BYTES
const CAPTURE_REQUEST_TOO_LARGE_ERROR = "Note capture exceeds the request size limit."

const NoteDocumentQuerySchema = z.object({
  path: z.string().trim().min(1),
})
const NoteSessionIDParamSchema = z.object({ sessionID: z.string().trim().min(1) })
const NoteMessageParamSchema = NoteSessionIDParamSchema.extend({
  messageID: z.string().trim().min(1),
})
const CreateNoteBodySchema = z.object({ title: z.string().optional() }).strict()
const UpdateNoteBodySchema = z
  .object({
    content: z.string().max(MAX_NOTE_CONTENT_CHARACTERS),
    expectedVersion: z.string().nullable().optional(),
  })
  .strict()
const RenameNoteBodySchema = z
  .object({
    title: z.string().trim().min(1),
    expectedVersion: z.string().nullable().optional(),
  })
  .strict()
const CaptureNoteImageSchema = z
  .object({
    filename: z.string().max(NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS),
    mime: z.enum(NOTE_CAPTURE_IMAGE_MIME_TYPES),
    data: z.string().min(1).max(NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS),
  })
  .strict()
const CaptureNoteBodySchema = z
  .object({
    text: z.string().trim().max(MAX_CAPTURE_CHARACTERS),
    images: z.array(CaptureNoteImageSchema).max(NOTE_CAPTURE_MAX_IMAGES).optional(),
  })
  .strict()

const BuddyNoteSummarySchema = z
  .object({
    kind: z.enum(["plain", "buddy"]),
    title: z.string(),
    relativePath: z.string(),
    id: z.string().optional(),
    type: z.enum(BUDDY_NOTE_TYPES).optional(),
    notebookID: z.string().optional(),
    notebook: z.string().optional(),
    notebookAvailable: z.boolean().optional(),
    sessionID: z.string().optional(),
    updatedAt: z.number(),
  })
  .strict()
const BuddyNoteDocumentSchema = z
  .object({
    note: BuddyNoteSummarySchema,
    content: z.string(),
    version: z.string(),
    properties: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
const BuddyNotesLibrarySchema = z
  .object({
    directory: z.string(),
    activeNotebookID: z.string().optional(),
    notes: z.array(BuddyNoteSummarySchema),
  })
  .strict()
const BuddySessionCaptureResultSchema = z
  .object({ note: BuddyNoteSummarySchema, created: z.boolean() })
  .strict()

function notesTask(task: () => Promise<Response>) {
  return runRouteTask({ task, mapError: mapNotesError })
}

export const NotesRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "notes.list",
      summary: "List Markdown notes from the central Notes library",
      responses: {
        200: {
          description: "Central notes library",
          content: { "application/json": { schema: resolver(BuddyNotesLibrarySchema) } },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        notesTask(async () => c.json(await listNotes(context.directory))),
      ),
  )
  .post(
    "/",
    describeRoute({
      operationId: "notes.create",
      summary: "Create a standalone Buddy note",
      responses: {
        200: {
          description: "Created note",
          content: { "application/json": { schema: resolver(BuddyNoteSummarySchema) } },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", CreateNoteBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        notesTask(async () =>
          c.json(
            await createStandaloneNote({
              directory: context.directory,
              title: c.req.valid("json").title,
            }),
          ),
        ),
      ),
  )
  .get(
    "/document",
    describeRoute({
      operationId: "notes.read",
      summary: "Read a Markdown note by its Notes-library path",
      responses: {
        200: {
          description: "Editable note body",
          content: { "application/json": { schema: resolver(BuddyNoteDocumentSchema) } },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", NoteDocumentQuerySchema),
    async (c) => notesTask(async () => c.json(await readNote(c.req.valid("query").path))),
  )
  .put(
    "/document",
    describeRoute({
      operationId: "notes.update",
      summary: "Update a Markdown note by its Notes-library path",
      responses: {
        200: {
          description: "Updated note body",
          content: { "application/json": { schema: resolver(BuddyNoteDocumentSchema) } },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", NoteDocumentQuerySchema),
    validator("json", UpdateNoteBodySchema),
    async (c) =>
      notesTask(async () => {
        const body = c.req.valid("json")
        return c.json(
          await updateNote({
            path: c.req.valid("query").path,
            content: body.content,
            expectedVersion: body.expectedVersion,
          }),
        )
      }),
  )
  .post(
    "/document/rename",
    describeRoute({
      operationId: "notes.rename",
      summary: "Rename a Markdown note by its Notes-library path",
      responses: {
        200: {
          description: "Renamed note",
          content: { "application/json": { schema: resolver(BuddyNoteSummarySchema) } },
        },
        ...routeErrors(400, 403, 404, 409),
      },
    }),
    validator("query", NoteDocumentQuerySchema),
    validator("json", RenameNoteBodySchema),
    async (c) =>
      notesTask(async () => {
        const body = c.req.valid("json")
        return c.json(
          await renameNote({
            path: c.req.valid("query").path,
            title: body.title,
            expectedVersion: body.expectedVersion,
          }),
        )
      }),
  )
  .post(
    "/session/:sessionID/capture",
    describeRoute({
      operationId: "notes.capture",
      summary: "Save prompt composer text into the chat session note",
      responses: {
        200: {
          description: "Saved session capture",
          content: { "application/json": { schema: resolver(BuddySessionCaptureResultSchema) } },
        },
        ...routeErrors(400, 403, 404, 409, 413),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", NoteSessionIDParamSchema),
    async (c, next) => {
      const result = await readBoundedRequestBody(c.req.raw, MAX_CAPTURE_REQUEST_BODY_BYTES)
      if (result.status === "too_large") {
        return c.json({ error: CAPTURE_REQUEST_TOO_LARGE_ERROR }, 413)
      }
      c.req.raw = replayRequestBody(c.req.raw, result.body)
      await next()
    },
    validator("json", CaptureNoteBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        notesTask(async () =>
          c.json(
            await captureComposerNote({
              directory: context.directory,
              sessionID: c.req.valid("param").sessionID,
              text: c.req.valid("json").text,
              images: c.req.valid("json").images,
            }),
          ),
        ),
      ),
  )
  .post(
    "/session/:sessionID/message/:messageID/annotation",
    describeRoute({
      operationId: "notes.annotateMessage",
      summary: "Annotate a readable chat message in the session note",
      responses: {
        200: {
          description: "Saved message annotation",
          content: { "application/json": { schema: resolver(BuddySessionCaptureResultSchema) } },
        },
        ...routeErrors(400, 403, 404, 409, 413),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", NoteMessageParamSchema),
    async (c, next) => {
      const result = await readBoundedRequestBody(c.req.raw, MAX_CAPTURE_REQUEST_BODY_BYTES)
      if (result.status === "too_large") {
        return c.json({ error: CAPTURE_REQUEST_TOO_LARGE_ERROR }, 413)
      }
      c.req.raw = replayRequestBody(c.req.raw, result.body)
      await next()
    },
    validator("json", CaptureNoteBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        notesTask(async () => {
          const params = c.req.valid("param")
          return c.json(
            await annotateChatMessage({
              directory: context.directory,
              sessionID: params.sessionID,
              messageID: params.messageID,
              text: c.req.valid("json").text,
              images: c.req.valid("json").images,
            }),
          )
        }),
      ),
  )
