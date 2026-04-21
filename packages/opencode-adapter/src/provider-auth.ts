import * as OpenCodeProviderAuth from "opencode/provider/auth"
import { makeRuntime } from "opencode/effect/run-service"

const runtime = makeRuntime(OpenCodeProviderAuth.Service, OpenCodeProviderAuth.defaultLayer)

export namespace ProviderAuth {
  export const Method = OpenCodeProviderAuth.Method.zod
  export type Method = OpenCodeProviderAuth.Method

  export const Methods = OpenCodeProviderAuth.Methods.zod
  export type Methods = OpenCodeProviderAuth.Methods

  export const Authorization = OpenCodeProviderAuth.Authorization.zod
  export type Authorization = OpenCodeProviderAuth.Authorization

  export const AuthorizeInput = OpenCodeProviderAuth.AuthorizeInput.zod
  export type AuthorizeInput = OpenCodeProviderAuth.AuthorizeInput

  export const CallbackInput = OpenCodeProviderAuth.CallbackInput.zod
  export type CallbackInput = OpenCodeProviderAuth.CallbackInput

  export async function methods() {
    return runtime.runPromise((svc) => svc.methods())
  }

  export async function authorize(
    input: Parameters<OpenCodeProviderAuth.Interface["authorize"]>[0],
  ) {
    return runtime.runPromise((svc) => svc.authorize(input))
  }

  export async function callback(input: Parameters<OpenCodeProviderAuth.Interface["callback"]>[0]) {
    return runtime.runPromise((svc) => svc.callback(input))
  }
}
