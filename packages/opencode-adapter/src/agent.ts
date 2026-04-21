import * as OpenCodeAgent from "opencode/agent/agent"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeAgent.Service, OpenCodeAgent.defaultLayer)

export namespace Agent {
  export const Info = OpenCodeAgent.Info
  export type Info = OpenCodeAgent.Info

  export async function get(agent: string) {
    return runtime.runPromise((svc) => svc.get(agent))
  }

  export async function list() {
    return runtime.runPromise((svc) => svc.list())
  }

  export async function defaultAgent() {
    return runtime.runPromise((svc) => svc.defaultAgent())
  }

  export async function generate(input: Parameters<OpenCodeAgent.Interface["generate"]>[0]) {
    return runtime.runPromise((svc) => svc.generate(input))
  }
}
