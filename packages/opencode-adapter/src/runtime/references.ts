import { RuntimeError } from "@buddy/agent-runtime/errors"
import type { References } from "@buddy/agent-runtime/references"
import type { OpenCodeHost } from "../host"
import { toRuntimeError } from "./errors"
import type { OpenCodeRuntimeOptions } from "./options"

export function createReferences(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): References {
  return {
    async list(directory) {
      try {
        return (await host.reference.list({ location: { directory } })).data
      } catch (cause) {
        const error = toRuntimeError(cause, String(cause))
        throw error.kind === "internal"
          ? error
          : new RuntimeError("internal", error.message, { subject: error.subject, cause })
      }
    },
  }
}
