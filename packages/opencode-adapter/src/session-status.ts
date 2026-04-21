import * as OpenCodeSessionStatus from "opencode/session/status"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeSessionStatus.Service, OpenCodeSessionStatus.defaultLayer)

export namespace SessionStatus {
  export const Info = OpenCodeSessionStatus.Info
  export type Info = OpenCodeSessionStatus.Info

  export async function get(sessionID: Parameters<OpenCodeSessionStatus.Interface["get"]>[0]) {
    return runtime.runPromise((svc) => svc.get(sessionID))
  }

  export async function list() {
    return runtime.runPromise((svc) => svc.list())
  }

  export async function set(
    sessionID: Parameters<OpenCodeSessionStatus.Interface["set"]>[0],
    status: Parameters<OpenCodeSessionStatus.Interface["set"]>[1],
  ) {
    return runtime.runPromise((svc) => svc.set(sessionID, status))
  }
}
