import * as CoreSession from "@opencode-ai/core/session"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionExecutionLocal } from "@opencode-ai/core/session/execution/local"
import { SessionMessage } from "@opencode-ai/core/session/message"
import * as CorePrompt from "@opencode-ai/core/session/prompt"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(
  CoreSession.SessionV2.Service,
  AppNodeBuilder.build(CoreSession.SessionV2.node, [
    [SessionExecution.node, SessionExecutionLocal.node],
  ]),
)

export namespace SessionV2 {
  export const ID = CoreSession.ID
  export type ID = CoreSession.ID

  export const Info = CoreSession.Info
  export type Info = CoreSession.Info

  export const ListInput = CoreSession.SessionV2.ListInput
  export type ListInput = CoreSession.SessionV2.ListInput

  export const MessageID = SessionMessage.ID
  export type MessageID = SessionMessage.ID

  export const Message = SessionMessage.Message
  export type Message = SessionMessage.Message
  export type Assistant = SessionMessage.Assistant
  export type User = SessionMessage.User

  export const Prompt = CorePrompt.Prompt
  export type Prompt = CorePrompt.Prompt

  export async function list(input?: CoreSession.SessionV2.ListInput) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.list(input)))
  }

  export async function get(sessionID: CoreSession.ID) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.get(sessionID)))
  }

  export async function messages(
    input: Parameters<CoreSession.SessionV2.Interface["messages"]>[0],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.messages(input)))
  }

  export async function message(input: Parameters<CoreSession.SessionV2.Interface["message"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.message(input)))
  }

  export async function context(sessionID: CoreSession.ID) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.context(sessionID)))
  }
}
