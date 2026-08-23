import * as OpenCodeSession from "opencode/session/session"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"
import { canonicalizeSession, removeCachedSession, updateCachedSession } from "./session-live"

const runtime = makeRuntime(OpenCodeSession.Service, AppNodeBuilderV1.build(OpenCodeSession.node))

export namespace Session {
  export const Info = OpenCodeSession.Info
  export type Info = OpenCodeSession.Info

  export const CreateInput = OpenCodeSession.CreateInput
  export type CreateInput = OpenCodeSession.CreateInput

  export const GetInput = OpenCodeSession.GetInput
  export const ChildrenInput = OpenCodeSession.ChildrenInput
  export const MessagesInput = OpenCodeSession.MessagesInput

  export const create = Object.assign(
    async (input?: OpenCodeSession.CreateInput) => {
      const session = await runtime.runPromise((svc) => withCurrentInstance(svc.create(input)))
      return canonicalizeSession(session)
    },
    { schema: CreateInput },
  )

  export async function list(input?: Parameters<OpenCodeSession.Interface["list"]>[0]) {
    const sessions = await runtime.runPromise((svc) => withCurrentInstance(svc.list(input)))
    return sessions.map(canonicalizeSession)
  }

  export async function get(id: Parameters<OpenCodeSession.Interface["get"]>[0]) {
    const session = await runtime.runPromise((svc) => withCurrentInstance(svc.get(id)))
    return canonicalizeSession(session)
  }

  export async function fork(input: Parameters<OpenCodeSession.Interface["fork"]>[0]) {
    const session = await runtime.runPromise((svc) => withCurrentInstance(svc.fork(input)))
    return canonicalizeSession(session)
  }

  export async function children(parentID: Parameters<OpenCodeSession.Interface["children"]>[0]) {
    const sessions = await runtime.runPromise((svc) => withCurrentInstance(svc.children(parentID)))
    return sessions.map(canonicalizeSession)
  }

  export async function messages(input: Parameters<OpenCodeSession.Interface["messages"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.messages(input)))
  }

  export async function setTitle(input: Parameters<OpenCodeSession.Interface["setTitle"]>[0]) {
    await runtime.runPromise((svc) => withCurrentInstance(svc.setTitle(input)))
    updateCachedSession({
      sessionID: input.sessionID,
      title: input.title,
    })
  }

  export async function setArchived(
    input: Parameters<OpenCodeSession.Interface["setArchived"]>[0],
  ) {
    await runtime.runPromise((svc) => withCurrentInstance(svc.setArchived(input)))
    updateCachedSession({
      sessionID: input.sessionID,
      archived: input.time,
    })
  }

  export async function setMetadata(
    input: Parameters<OpenCodeSession.Interface["setMetadata"]>[0],
  ) {
    await runtime.runPromise((svc) => withCurrentInstance(svc.setMetadata(input)))
    updateCachedSession({
      sessionID: input.sessionID,
      metadata: input.metadata,
      updated: Date.now(),
    })
  }

  export async function setPermission(
    input: Parameters<OpenCodeSession.Interface["setPermission"]>[0],
  ) {
    await runtime.runPromise((svc) => withCurrentInstance(svc.setPermission(input)))
    updateCachedSession({
      sessionID: input.sessionID,
      permission: input.permission,
      updated: Date.now(),
    })
  }

  export async function remove(sessionID: Parameters<OpenCodeSession.Interface["remove"]>[0]) {
    await runtime.runPromise((svc) => withCurrentInstance(svc.remove(sessionID)))
    removeCachedSession(sessionID)
  }

  export async function updateMessage(
    message: Parameters<OpenCodeSession.Interface["updateMessage"]>[0],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.updateMessage(message)))
  }

  export async function updatePart(part: Parameters<OpenCodeSession.Interface["updatePart"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.updatePart(part)))
  }
}
