import { withToolUiOnUnknownPart } from "@buddy/opencode-adapter/session-tool-ui"

const SSE_DATA_PREFIX = "data:"
const SSE_FRAME_DELIMITER = "\n\n"
const MESSAGE_PART_UPDATED = "message.part.updated"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readSseDataValue(line: string) {
  if (!line.startsWith(SSE_DATA_PREFIX)) return undefined
  return line.startsWith("data: ") ? line.slice(6) : line.slice(5)
}

function transformGlobalEventPayload(payload: unknown, directory: string): unknown {
  if (!isRecord(payload)) return payload
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

export function buildOpenCodeEventStreamRequestHeaders(inbound: Headers): Headers {
  const headers = new Headers(inbound)
  headers.set("accept", "text/event-stream")
  return headers
}

export function transformOpenCodeEventStreamResponse(input: {
  response: Response
  directory: string
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

  return new Response(stream, {
    status: input.response.status,
    statusText: input.response.statusText,
    headers: input.response.headers,
  })
}
