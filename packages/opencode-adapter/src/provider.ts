import * as OpenCodeProvider from "opencode/provider/provider"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodeProvider.Service, OpenCodeProvider.defaultLayer)

export namespace Provider {
  export const Info = OpenCodeProvider.Info
  export type Info = OpenCodeProvider.Info

  export const Model = OpenCodeProvider.Model
  export type Model = OpenCodeProvider.Model

  export const ListResult = OpenCodeProvider.ListResult
  export type ListResult = OpenCodeProvider.ListResult

  export function parseModel(model: string) {
    return OpenCodeProvider.parseModel(model)
  }

  export async function list() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.list()))
  }

  export async function getModel(
    providerID: Parameters<OpenCodeProvider.Interface["getModel"]>[0],
    modelID: Parameters<OpenCodeProvider.Interface["getModel"]>[1],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.getModel(providerID, modelID)))
  }

  export async function getSmallModel(
    providerID: Parameters<OpenCodeProvider.Interface["getSmallModel"]>[0],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.getSmallModel(providerID)))
  }

  export async function defaultModel() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.defaultModel()))
  }
}
