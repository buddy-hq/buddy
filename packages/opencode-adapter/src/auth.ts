import * as OpenCodeAuth from "opencode/auth/index"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodeAuth.Service, AppNodeBuilderV1.build(OpenCodeAuth.node))

export namespace Auth {
  export const OAUTH_DUMMY_KEY = OpenCodeAuth.OAUTH_DUMMY_KEY

  export const Info = OpenCodeAuth.Info
  export type Info = OpenCodeAuth.Info

  export async function get(providerID: string) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.get(providerID)))
  }

  export async function all() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.all()))
  }

  export async function set(providerID: string, info: OpenCodeAuth.Info) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.set(providerID, info)))
  }

  export async function remove(providerID: string) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.remove(providerID)))
  }
}
