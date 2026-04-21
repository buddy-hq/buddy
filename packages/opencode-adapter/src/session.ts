import * as OpenCodeSession from "opencode/session/session"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)

export namespace Session {
  export const Info = OpenCodeSession.Info
  export type Info = OpenCodeSession.Info

  export const CreateInput = OpenCodeSession.CreateInput
  export type CreateInput = OpenCodeSession.CreateInput

  export const GetInput = OpenCodeSession.GetInput
  export const ChildrenInput = OpenCodeSession.ChildrenInput
  export const MessagesInput = OpenCodeSession.MessagesInput

  export const create = Object.assign(
    async (input?: OpenCodeSession.CreateInput) => runtime.runPromise((svc) => svc.create(input)),
    { schema: OpenCodeSession.CreateInput },
  )

  export async function list(input?: Parameters<typeof OpenCodeSession.list>[0]) {
    return Array.from(OpenCodeSession.list(input))
  }

  export async function get(id: Parameters<OpenCodeSession.Interface["get"]>[0]) {
    return runtime.runPromise((svc) => svc.get(id))
  }

  export async function fork(input: Parameters<OpenCodeSession.Interface["fork"]>[0]) {
    return runtime.runPromise((svc) => svc.fork(input))
  }

  export async function children(parentID: Parameters<OpenCodeSession.Interface["children"]>[0]) {
    return runtime.runPromise((svc) => svc.children(parentID))
  }

  export async function messages(input: Parameters<OpenCodeSession.Interface["messages"]>[0]) {
    return runtime.runPromise((svc) => svc.messages(input))
  }

  export async function setTitle(input: Parameters<OpenCodeSession.Interface["setTitle"]>[0]) {
    return runtime.runPromise((svc) => svc.setTitle(input))
  }

  export async function setArchived(
    input: Parameters<OpenCodeSession.Interface["setArchived"]>[0],
  ) {
    return runtime.runPromise((svc) => svc.setArchived(input))
  }

  export async function setPermission(
    input: Parameters<OpenCodeSession.Interface["setPermission"]>[0],
  ) {
    return runtime.runPromise((svc) => svc.setPermission(input))
  }

  export async function remove(sessionID: Parameters<OpenCodeSession.Interface["remove"]>[0]) {
    return runtime.runPromise((svc) => svc.remove(sessionID))
  }

  export async function updateMessage(
    message: Parameters<OpenCodeSession.Interface["updateMessage"]>[0],
  ) {
    return runtime.runPromise((svc) => svc.updateMessage(message))
  }

  export async function updatePart(part: Parameters<OpenCodeSession.Interface["updatePart"]>[0]) {
    return runtime.runPromise((svc) => svc.updatePart(part))
  }
}
