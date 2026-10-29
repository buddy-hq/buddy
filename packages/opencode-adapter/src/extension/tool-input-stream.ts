import type { Context } from "@opencode/plugin/promise/plugin"
import type { RuntimeTool } from "@buddy/agent-runtime/extension"
import z from "zod"
import { createToolInputObserver } from "./tool-input-wire"

const MaxObservedSockets = 128
const MaxObservedBytes = 1024 * 1024
const ResponseCreated = /"type"\s*:\s*"response\.created"/u

type Emit = (fragment: { callID: string; delta: string }) => Promise<void>

function observation(tools: ReadonlySet<string>, emit: Emit) {
  let observe = createToolInputObserver(tools)
  let stopped = false
  function fail(name: string) {
    if (stopped) return
    stopped = true
    console.error(name)
  }
  return {
    fail,
    async observe(json: string) {
      if (ResponseCreated.test(json)) {
        observe = createToolInputObserver(tools)
        stopped = false
      }
      if (stopped) return false
      try {
        for (const fragment of observe(json)) await emit(fragment)
        return true
      } catch (error) {
        fail(error instanceof Error ? error.name : "UnknownError")
        return false
      }
    },
  }
}

export function createToolInputTap(tools: ReadonlySet<string>, emit: Emit) {
  const observer = observation(tools, emit)
  const decoder = new TextDecoder()
  let line = ""
  let lineBytes = 0
  let eventBytes = 0
  let data: string[] = []
  let discardLF = false
  let stopped = false
  function stop() {
    stopped = true
    line = ""
    lineBytes = 0
    eventBytes = 0
    data = []
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      if (!stopped) {
        try {
          for (let offset = 0; offset < chunk.length;) {
            if (discardLF) {
              discardLF = false
              if (chunk[offset] === 10) {
                offset += 1
                if (eventBytes > 0) eventBytes += 1
                if (eventBytes > MaxObservedBytes) {
                  stop()
                  break
                }
                continue
              }
            }
            let newline = offset
            while (newline < chunk.length && chunk[newline] !== 10 && chunk[newline] !== 13) newline += 1
            const end = newline < chunk.length ? newline + 1 : newline
            lineBytes += newline - offset
            eventBytes += end - offset
            if (lineBytes > MaxObservedBytes || eventBytes > MaxObservedBytes) {
              stop()
              break
            }
            line += decoder.decode(chunk.subarray(offset, end), { stream: true })
            offset = end
            if (newline === chunk.length) break
            discardLF = chunk[newline] === 13
            const value = line.slice(0, -1)
            line = ""
            lineBytes = 0
            if (value === "") {
              const json = data.join("\n")
              data = []
              eventBytes = 0
              if (json && json !== "[DONE]" && !await observer.observe(json)) {
                stop()
                break
              }
            } else if (value === "data") data.push("")
            else if (value.startsWith("data:")) data.push(value.slice(value[5] === " " ? 6 : 5))
          }
        } catch (error) {
          stop()
          observer.fail(error instanceof Error ? error.name : "UnknownError")
        }
      }
      controller.enqueue(chunk)
    },
  })
}

export async function registerToolInputStream(ctx: {
  readonly rpc: Pick<Context["rpc"], "register">
  readonly session: Pick<Context["session"], "hook">
}, tools: readonly RuntimeTool[]) {
  const streamingTools = new Set(tools.filter((tool) => tool.streamInput).map((tool) => tool.id))
  if (streamingTools.size === 0) return
  const carrier = await ctx.rpc.register({
    id: "buddy.runtime",
    methods: {},
    events: { toolInputDelta: { schema: z.object({ sessionID: z.string(), callID: z.string(), delta: z.string() }) } },
  }, {})
  const sockets = new Map<string, ReturnType<typeof observation> | null>()
  await ctx.session.hook("http.response", (event) => {
    try {
      const response = event.response
      const body = response.body
      if (event.kind !== "primary" || !response.headers.get("content-type")?.includes("text/event-stream") || !body) return
      const tap = createToolInputTap(streamingTools, async (fragment) => {
        await carrier.events.emit("toolInputDelta", { sessionID: event.sessionID, ...fragment })
      })
      event.response = new Response(body.pipeThrough(tap), { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) { console.error(error instanceof Error ? error.name : "UnknownError") }
  })
  await ctx.session.hook("experimental.ws.receive", async (event) => {
    try {
      if (event.kind !== "primary" || sockets.get(event.sessionID) === null) return
      let socket = sockets.get(event.sessionID)
      if (socket) {
        sockets.delete(event.sessionID)
        sockets.set(event.sessionID, socket)
      } else {
        socket = observation(streamingTools, async (fragment) => {
          await carrier.events.emit("toolInputDelta", { sessionID: event.sessionID, ...fragment })
        })
        sockets.set(event.sessionID, socket)
        while (sockets.size > MaxObservedSockets) {
          const first = sockets.keys().next().value
          if (first === undefined) break
          sockets.delete(first)
        }
      }
      await socket.observe(event.frame)
    } catch (error) {
      const socket = sockets.get(event.sessionID)
      if (socket) socket.fail(error instanceof Error ? error.name : "UnknownError")
      else if (socket !== null) {
        sockets.set(event.sessionID, null)
        console.error(error instanceof Error ? error.name : "UnknownError")
      }
    }
  })
}
