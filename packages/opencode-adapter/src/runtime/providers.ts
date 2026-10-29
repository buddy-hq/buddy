import { RuntimeError, type RuntimeErrorKind } from "@buddy/agent-runtime/errors"
import type { Providers } from "@buddy/agent-runtime/providers"
import z from "zod"
import { cancelProviderOAuth, completeProviderOAuth, listProviderAuth, removeProviderCredentials, setProviderKey, startProviderOAuth } from "../gateway/integration"
import { listProviderCatalog } from "../gateway/provider"
import type { OpenCodeHost } from "../host"
import type { OpenCodeRuntimeOptions } from "./options"
import { toRuntimeError } from "./errors"

async function providerRequest<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (cause) {
    const native = cause instanceof Error ? cause : new Error(String(cause))
    const error = toRuntimeError(cause, native.message || "Provider request failed")
    const body = z.object({ "_tag": z.string().optional() }).safeParse(native)
    const tag = body.success ? body.data["_tag"] ?? native.name : native.name
    let kind: RuntimeErrorKind = "internal"
    switch (tag) {
      case "IntegrationNotFoundError":
      case "IntegrationAttemptNotFoundError":
      case "IntegrationMethodNotFoundError":
      case "ProviderNotFoundError":
        kind = "not_found"
        break
      case "InvalidRequestError":
      case "FormInvalidAnswerError":
      case "ProviderOAuthError":
        kind = "invalid"
        break
    }
    throw error.kind === kind ? error : new RuntimeError(kind, error.message, { subject: error.subject, cause })
  }
}

export function createProviders(host: OpenCodeHost, _options: OpenCodeRuntimeOptions): Providers {
  return {
    catalog: (directory) => providerRequest(() => listProviderCatalog(host, directory)),
    defaultModel: (directory) => providerRequest(async () => {
      const { data } = await host.model.default({ location: { directory } })
      return data ? { providerID: data.providerID, modelID: data.id } : undefined
    }),
    authMethods: (directory) => providerRequest(() => listProviderAuth(host, directory)),
    startOAuth: (directory, providerID, input) => providerRequest(() => startProviderOAuth(host, directory, providerID, input)),
    completeOAuth: (directory, providerID, input, signal) => providerRequest(async () => {
      await completeProviderOAuth(host, directory, providerID, input, signal)
    }),
    cancelOAuth: (directory, providerID, attemptID) => providerRequest(async () => {
      await cancelProviderOAuth(host, directory, providerID, attemptID)
    }),
    setKey: (directory, providerID, key, answers) => providerRequest(async () => {
      await setProviderKey(host, directory, providerID, key, answers)
    }),
    removeCredentials: (directory, providerID) => providerRequest(async () => {
      await removeProviderCredentials(host, directory, providerID)
    }),
  }
}
