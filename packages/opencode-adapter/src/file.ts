import * as OpenCodeFile from "opencode/file/index"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(OpenCodeFile.Service, OpenCodeFile.defaultLayer)

export namespace File {
  export const Info = OpenCodeFile.Info
  export type Info = OpenCodeFile.Info

  export const Node = OpenCodeFile.Node
  export type Node = OpenCodeFile.Node

  export const Content = OpenCodeFile.Content
  export type Content = OpenCodeFile.Content

  export async function init() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.init()))
  }

  export async function status() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.status()))
  }

  export async function read(path: Parameters<OpenCodeFile.Interface["read"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.read(path)))
  }

  export async function list(input: Parameters<OpenCodeFile.Interface["list"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.list(input)))
  }
}
