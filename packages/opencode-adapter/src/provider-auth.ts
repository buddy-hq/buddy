import * as OpenCodeProviderAuth from "opencode/provider/auth"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { makeRuntime } from "opencode/effect/run-service"
import { withCurrentInstance } from "./effect-runtime"

const runtime = makeRuntime(
  OpenCodeProviderAuth.Service,
  AppNodeBuilderV1.build(OpenCodeProviderAuth.node),
)

export namespace ProviderAuth {
  export const Method = OpenCodeProviderAuth.Method
  export type Method = OpenCodeProviderAuth.Method

  export const Methods = OpenCodeProviderAuth.Methods
  export type Methods = OpenCodeProviderAuth.Methods

  export const Authorization = OpenCodeProviderAuth.Authorization
  export type Authorization = OpenCodeProviderAuth.Authorization

  export const AuthorizeInput = OpenCodeProviderAuth.AuthorizeInput
  export type AuthorizeInput = OpenCodeProviderAuth.AuthorizeInput

  export const CallbackInput = OpenCodeProviderAuth.CallbackInput
  export type CallbackInput = OpenCodeProviderAuth.CallbackInput

  export async function methods() {
    return runtime.runPromise((svc) => withCurrentInstance(svc.methods()))
  }

  export async function authorize(
    input: Parameters<OpenCodeProviderAuth.Interface["authorize"]>[0],
  ) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.authorize(input)))
  }

  export async function callback(input: Parameters<OpenCodeProviderAuth.Interface["callback"]>[0]) {
    return runtime.runPromise((svc) => withCurrentInstance(svc.callback(input)))
  }
}
