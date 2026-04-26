import * as OpenCodeAgent from "opencode/agent/agent"
import { makeRuntime } from "opencode/effect/run-service"
import { Instance } from "opencode/project/instance"
import { withConfigOverlay } from "./config"

const runtime = makeRuntime(OpenCodeAgent.Service, OpenCodeAgent.defaultLayer)

export namespace Agent {
  export const Info = OpenCodeAgent.Info
  export type Info = OpenCodeAgent.Info

  export async function get(agent: string) {
    return withConfigOverlay(Instance.directory, () => runtime.runPromise((svc) => svc.get(agent)))
  }

  export async function list() {
    return withConfigOverlay(Instance.directory, () => runtime.runPromise((svc) => svc.list()))
  }

  export async function defaultAgent() {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => svc.defaultAgent()),
    )
  }

  export async function generate(input: Parameters<OpenCodeAgent.Interface["generate"]>[0]) {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => svc.generate(input)),
    )
  }
}
