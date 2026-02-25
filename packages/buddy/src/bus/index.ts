import z from "zod"
import { GlobalBus } from "./global.js"
import { BusEvent } from "./bus-event.js"
import { Instance } from "../project/instance.js"

export namespace Bus {
  type Subscription = (event: unknown) => void | Promise<void>
  const subscriptions = Instance.state("bus.subscriptions", () => new Map<string, Subscription[]>())

  export async function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.output<Definition["properties"]>,
  ) {
    const payload = {
      type: def.type,
      properties,
    }
    if (
      payload.type === "session.status" ||
      payload.type === "message.updated" ||
      payload.type === "message.part.updated" ||
      payload.type === "message.part.delta"
    ) {
      console.log("bus.publish", {
        directory: Instance.directory,
        type: payload.type,
        sessionID: String((payload.properties as Record<string, unknown>)?.sessionID ?? ""),
      })
    }

    const pending: Array<void | Promise<void>> = []
    for (const key of [def.type, "*"]) {
      const entries = subscriptions().get(key)
      if (!entries) continue
      for (const callback of entries) {
        pending.push(callback(payload))
      }
    }

    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload,
    })

    await Promise.all(pending)
  }

  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
  ) {
    return raw(def.type, callback as Subscription)
  }

  export function subscribeAll(callback: (event: unknown) => void) {
    return raw("*", callback)
  }

  function raw(type: string, callback: Subscription) {
    const entries = subscriptions().get(type) ?? []
    entries.push(callback)
    subscriptions().set(type, entries)

    return () => {
      const match = subscriptions().get(type)
      if (!match) return
      const index = match.indexOf(callback)
      if (index === -1) return
      match.splice(index, 1)
    }
  }
}
