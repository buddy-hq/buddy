import path from "node:path"
import { readWorkspaceFileWatcherUpdatePayload } from "@buddy/opencode-adapter/file-watcher"
import { withToolPresentationOnUnknownPart } from "@buddy/opencode-adapter/session-tool-presentation"
import {
  parseTJsonObject,
  parseTJsonValue,
  parseTNumber,
  parseTString,
  type TJsonObject,
  type TJsonValue,
} from "./parse"

const SSE_DATA_PREFIX = "data:"
const SSE_FRAME_DELIMITER = "\n\n"
const MESSAGE_PART_UPDATED = "message.part.updated"
const EMPTY_RELATIVE_PATH = ""
const CURRENT_DIRECTORY_RELATIVE_PATH = "."
const PARENT_DIRECTORY_RELATIVE_PATH = ".."
const WINDOWS_DRIVE_PATH_PREFIX_PATTERN = /^[a-zA-Z]:[\\/]/u

type TBuddyEventStreamMultiplexer<TEvent> = {
  initialEvents?: readonly TEvent[]
  subscribe(listener: (event: TEvent) => void): () => void
}

type TMessagePartUpdatedProperties = TJsonObject & {
  sessionID: string
  time: number
  part: TJsonValue
}

type TMessagePartUpdatedPayload = TJsonObject & {
  type: typeof MESSAGE_PART_UPDATED
  id: string
  properties: TMessagePartUpdatedProperties
}

type TMessagePartUpdatedGlobalEvent = TJsonObject & {
  directory: string
  payload: TMessagePartUpdatedPayload
}

function parseTMessagePartUpdatedProperties<TValue>(
  value: TValue,
): TMessagePartUpdatedProperties | undefined {
  const properties = parseTJsonObject(value)
  if (properties === undefined) return undefined
  const sessionID = parseTString(properties.sessionID)
  const time = parseTNumber(properties.time)
  const part = parseTJsonValue(properties.part)
  if (sessionID === undefined || time === undefined) return undefined
  if (part === undefined || parseTJsonObject(part) === undefined) return undefined
  return Object.assign({}, properties, {
    sessionID,
    time,
    part,
  })
}

function parseTMessagePartUpdatedPayload<TValue>(
  value: TValue,
): TMessagePartUpdatedPayload | undefined {
  const payload = parseTJsonObject(value)
  if (payload === undefined || payload.type !== MESSAGE_PART_UPDATED) return undefined
  const id = parseTString(payload.id)
  const properties = parseTMessagePartUpdatedProperties(payload.properties)
  if (id === undefined || properties === undefined) return undefined
  return Object.assign({}, payload, {
    type: MESSAGE_PART_UPDATED,
    id,
    properties,
  } as const)
}

function parseTMessagePartUpdatedGlobalEvent<TValue>(
  value: TValue,
): TMessagePartUpdatedGlobalEvent | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const directory = parseTString(record.directory)
  const payload = parseTMessagePartUpdatedPayload(record.payload)
  if (directory === undefined || payload === undefined) return undefined
  return Object.assign({}, record, {
    directory,
    payload,
  })
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

function transformWatcherEventPayload(record: TJsonObject, directory: string): TJsonObject | undefined {
  const nestedPayload = parseTJsonObject(record.payload)
  if (nestedPayload === undefined) return undefined
  const watcherUpdate = readWorkspaceFileWatcherUpdatePayload(nestedPayload)
  const nestedProperties = parseTJsonObject(nestedPayload.properties)
  if (!watcherUpdate || nestedProperties === undefined) return undefined

  const relativePath = containedWorkspaceRelativePath({
    directory,
    absolutePath: watcherUpdate.absolutePath,
  })
  if (!relativePath) return undefined

  return Object.assign({}, record, {
    payload: Object.assign({}, nestedPayload, {
      properties: Object.assign({}, nestedProperties, { relativePath }),
    }),
  })
}

function transformMessagePartUpdatedPayload(record: TJsonObject): TJsonObject | undefined {
  const event = parseTMessagePartUpdatedGlobalEvent(record)
  if (event === undefined) return undefined
  const presentedPart = parseTJsonValue(
    withToolPresentationOnUnknownPart(event.payload.properties.part, event.directory),
  )
  if (presentedPart === undefined) return undefined

  return Object.assign({}, event, {
    payload: Object.assign({}, event.payload, {
      properties: Object.assign({}, event.payload.properties, {
        part: presentedPart,
      }),
    }),
  })
}

function transformGlobalEventPayload<TPayload>(payload: TPayload, directory: string): TPayload | TJsonObject {
  const record = parseTJsonObject(payload)
  if (record === undefined) return payload
  return (
    transformWatcherEventPayload(record, directory) ??
    transformMessagePartUpdatedPayload(record) ??
    payload
  )
}

function transformSseFrame(frame: string, directory: string) {
  if (!frame.includes(SSE_DATA_PREFIX)) return frame

  const lines = frame.split("\n")
  const dataLines = lines
    .map((line) => readSseDataValue(line))
    .filter((line): line is string => line !== undefined)
  if (dataLines.length === 0) return frame

  const data = dataLines.join("\n")

  let payload: TJsonValue | undefined
  try {
    payload = parseTJsonValue(JSON.parse(data))
  } catch {
    return frame
  }
  if (payload === undefined) return frame

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

function encodeSseEvent<TEvent>(encoder: TextEncoder, event: TEvent): Uint8Array {
  return encoder.encode(`${SSE_DATA_PREFIX} ${JSON.stringify(event)}${SSE_FRAME_DELIMITER}`)
}

export function buildOpenCodeEventStreamRequestHeaders(inbound: Headers): Headers {
  const headers = new Headers(inbound)
  headers.set("accept", "text/event-stream")
  return headers
}

export function transformOpenCodeEventStreamResponse<TEvent>(input: {
  response: Response
  directory: string
  buddyEvents?: TBuddyEventStreamMultiplexer<TEvent>
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
