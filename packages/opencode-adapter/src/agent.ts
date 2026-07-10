import * as OpenCodeAgent from "opencode/agent/agent"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"
import { withConfigOverlay } from "./config"
import { Instance } from "./instance"

const runtime = makeRuntime(OpenCodeAgent.Service, AppNodeBuilderV1.build(OpenCodeAgent.node))

export namespace Agent {
  export const Info = OpenCodeAgent.Info
  export type Info = OpenCodeAgent.Info

  export async function get(agent: string) {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.get(agent))),
    )
  }

  export async function list() {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.list())),
    )
  }

  export async function defaultAgent() {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.defaultAgent())),
    )
  }

  export async function generate(input: Parameters<OpenCodeAgent.Interface["generate"]>[0]) {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.generate(input))),
    )
  }
}
