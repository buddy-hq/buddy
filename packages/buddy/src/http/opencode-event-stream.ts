import path from "node:path"
import { readWorkspaceFileWatcherUpdatePayload } from "@buddy/opencode-adapter/file-watcher"
import { withToolUiOnUnknownPart } from "@buddy/opencode-adapter/session-tool-ui"

const SSE_DATA_PREFIX = "data:"
const SSE_FRAME_DELIMITER = "\n\n"
const MESSAGE_PART_UPDATED = "message.part.updated"
const EMPTY_RELATIVE_PATH = ""
const CURRENT_DIRECTORY_RELATIVE_PATH = "."
const PARENT_DIRECTORY_RELATIVE_PATH = ".."
const WINDOWS_DRIVE_PATH_PREFIX_PATTERN = /^[a-zA-Z]:[\\/]/u

type BuddyEventStreamMultiplexer = {
  initialEvents?: readonly unknown[]
  subscribe(listener: (event: unknown) => void): () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readSseDataValue(line: string) {
  if (!line.startsWith(SSE_DATA_PREFIX)) return undefined
  return line.startsWith("data: ") ? line.slice(6) : line.slice(5)
}

function shouldUseWindowsPathTools(input: { directory: string; absolutePath: string }) {
  return (
    WINDOWS_DRIVE_PATH_PREFIX_PATTERN.test(input.directory) ||
    WINDOWS_DRIVE_PATH_PREFIX_PATTERN.test(input.absolutePath)
  )
}

function containedWorkspaceRelativePath(input: {
  directory: string
  absolutePath: string
}): string | undefined {
  const pathTools = shouldUseWindowsPathTools(input) ? path.win32 : path.posix
  const relativePath = pathTools.relative(input.directory, input.absolutePath)
  if (
    relativePath === EMPTY_RELATIVE_PATH ||
    relativePath === CURRENT_DIRECTORY_RELATIVE_PATH ||
    relativePath === PARENT_DIRECTORY_RELATIVE_PATH ||
    relativePath.startsWith(`${PARENT_DIRECTORY_RELATIVE_PATH}${pathTools.sep}`) ||
    pathTools.isAbsolute(relativePath)
  ) {
    return undefined
  }

  return relativePath.replaceAll(pathTools.sep, "/")
}

function transformGlobalEventPayload(payload: unknown, directory: string): unknown {
  if (!isRecord(payload)) return payload
  const watcherUpdate = readWorkspaceFileWatcherUpdatePayload(payload.payload)
  if (watcherUpdate && isRecord(payload.payload) && isRecord(payload.payload.properties)) {
    const relativePath = containedWorkspaceRelativePath({
      directory,
      absolutePath: watcherUpdate.absolutePath,
    })
    if (!relativePath) return payload

    return {
      ...payload,
      payload: {
        ...payload.payload,
        properties: {
          ...payload.payload.properties,
          relativePath,
        },
      },
    }
  }

  if (!isRecord(payload.payload) || payload.payload.type !== MESSAGE_PART_UPDATED) {
    return payload
  }

  return {
    ...payload,
    payload: {
      ...payload.payload,
      part: withToolUiOnUnknownPart(payload.payload.part, directory),
    },
  }
}

function transformSseFrame(frame: string, directory: string) {
  if (!frame.includes(SSE_DATA_PREFIX)) return frame

  const lines = frame.split("\n")
  const dataLines = lines
    .map((line) => readSseDataValue(line))
    .filter((line): line is string => line !== undefined)
  if (dataLines.length === 0) return frame

  const data = dataLines.join("\n")

  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    return frame
  }

  const transformed = transformGlobalEventPayload(payload, directory)
  if (transformed === payload) {
    return frame
  }

  const nextLines: string[] = []
  let insertedData = false

  for (const line of lines) {
    if (!line.startsWith(SSE_DATA_PREFIX)) {
      nextLines.push(line)
      continue
    }

    if (!insertedData) {
      nextLines.push(`data: ${JSON.stringify(transformed)}`)
      insertedData = true
    }
  }

  return nextLines.join("\n")
}

function encodeSseEvent(encoder: TextEncoder, event: unknown): Uint8Array {
  return encoder.encode(`${SSE_DATA_PREFIX} ${JSON.stringify(event)}${SSE_FRAME_DELIMITER}`)
}

export function buildOpenCodeEventStreamRequestHeaders(inbound: Headers): Headers {
  const headers = new Headers(inbound)
  headers.set("accept", "text/event-stream")
  return headers
}

export function transformOpenCodeEventStreamResponse(input: {
  response: Response
  directory: string
  buddyEvents?: BuddyEventStreamMultiplexer
}): Response {
  if (!input.response.body) {
    return input.response
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""

  const stream = input.response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n")

        while (true) {
          const delimiterIndex = buffer.indexOf(SSE_FRAME_DELIMITER)
          if (delimiterIndex < 0) {
            break
          }

          const frame = buffer.slice(0, delimiterIndex)
          buffer = buffer.slice(delimiterIndex + SSE_FRAME_DELIMITER.length)
          controller.enqueue(
            encoder.encode(`${transformSseFrame(frame, input.directory)}${SSE_FRAME_DELIMITER}`),
          )
        }
      },
      flush(controller) {
        buffer += decoder.decode().replaceAll("\r\n", "\n")
        if (!buffer) {
          return
        }

        controller.enqueue(encoder.encode(transformSseFrame(buffer, input.directory)))
      },
    }),
  )

  let streamReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let unsubscribeBuddyEvents: (() => void) | undefined
  const multiplexedStream = input.buddyEvents
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          streamReader = stream.getReader()
          unsubscribeBuddyEvents = input.buddyEvents?.subscribe((event) => {
            controller.enqueue(encodeSseEvent(encoder, event))
          })

          for (const event of input.buddyEvents?.initialEvents ?? []) {
            controller.enqueue(encodeSseEvent(encoder, event))
          }
        },
        async pull(controller) {
          const reader = streamReader
          if (!reader) {
            controller.close()
            return
          }
          try {
            const result = await reader.read()
            if (result.done) {
              unsubscribeBuddyEvents?.()
              controller.close()
              return
            }
            controller.enqueue(result.value)
          } catch (error) {
            unsubscribeBuddyEvents?.()
            controller.error(error)
          }
        },
        cancel() {
          unsubscribeBuddyEvents?.()
          void streamReader?.cancel()
        },
      })
    : stream

  return new Response(multiplexedStream, {
    status: input.response.status,
    statusText: input.response.statusText,
    headers: input.response.headers,
  })
}
