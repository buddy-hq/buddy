import * as OpenCodeSkill from "opencode/skill/index"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"
import { withConfigOverlay } from "./config"
import { Instance } from "./instance"

const runtime = makeRuntime(OpenCodeSkill.Service, OpenCodeSkill.defaultLayer)

export namespace Skill {
  export const Info = OpenCodeSkill.Info
  export type Info = OpenCodeSkill.Info

  export async function get(name: string) {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.get(name))),
    )
  }

  export async function all() {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.all())),
    )
  }

  export async function available(agent?: Parameters<OpenCodeSkill.Interface["available"]>[0]) {
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.available(agent))),
    )
  }
}
