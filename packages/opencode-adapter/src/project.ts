import * as OpenCodeProject from "opencode/project/project"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeProject.Service, OpenCodeProject.defaultLayer)

export namespace Project {
  export const Info = OpenCodeProject.Info
  export type Info = OpenCodeProject.Info

  export const UpdateInput = OpenCodeProject.UpdateInput
  export type UpdateInput = OpenCodeProject.UpdateInput

  export const UpdatePayload = OpenCodeProject.UpdatePayload
  export type UpdatePayload = OpenCodeProject.UpdatePayload

  export function list() {
    return OpenCodeProject.list()
  }

  export function get(id: Parameters<typeof OpenCodeProject.get>[0]) {
    return OpenCodeProject.get(id)
  }

  export async function fromDirectory(directory: string) {
    return runtime.runPromise((svc) => svc.fromDirectory(directory))
  }

  export async function update(input: OpenCodeProject.UpdateInput) {
    return runtime.runPromise((svc) => svc.update(input))
  }
}
