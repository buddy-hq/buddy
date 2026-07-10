import * as OpenCodeSessionStatus from "opencode/session/status"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(
  OpenCodeSessionStatus.Service,
  AppNodeBuilderV1.build(OpenCodeSessionStatus.node),
)

export namespace SessionStatus {
  export const Info = OpenCodeSessionStatus.Info
  export type Info = OpenCodeSessionStatus.Info

  export async function get(sessionID: Parameters<OpenCodeSessionStatus.Interface["get"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.get(sessionID)))
  }

  export async function list() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.list()))
  }

  export async function set(
    sessionID: Parameters<OpenCodeSessionStatus.Interface["set"]>[0],
    status: Parameters<OpenCodeSessionStatus.Interface["set"]>[1],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.set(sessionID, status)))
  }
}
