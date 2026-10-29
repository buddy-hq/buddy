import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Plugin, type PluginContext } from "@buddy/opencode-adapter/plugin"
import {
  Credential,
  Integration,
  startProviderOAuth,
  completeProviderOAuth,
  cancelProviderOAuth,
  listProviderAuth,
  setProviderKey,
  removeProviderCredentials,
  resolveIntegrationCredential,
} from "@buddy/opencode-adapter/gateway/integration"
import { Provider, createProviderCatalogPlugin } from "@buddy/opencode-adapter/gateway/provider"
import { createChatGPTPlugin } from "@buddy/opencode-adapter/extension/chatgpt"
import { ChatGPTReconnectRequired, type ChatGPTCredentials } from "@buddy/agent-runtime/chatgpt"
import { createChatGPTAccountService } from "../../src/chatgpt/account"
import { createV2TestHost } from "../helpers/v2-host"

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return {
    promise,
    resolve(value: T) {
      if (!resolve) throw new Error("Deferred is uninitialized")
      resolve(value)
    },
  }
}

function oauthValue(access: string) {
  return Credential.OAuth.make({
    type: "oauth",
    methodID: Integration.MethodID.make("fixture-auto"),
    access,
    refresh: "refresh",
    expires: Date.now() + 3_600_000,
  })
}

test("independent OAuth attempt IDs target the correct completion and cancellation", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  const attempts: ReturnType<typeof deferred<Credential.OAuth>>[] = []
  await runtime.host.plugin(
    Plugin.define({
      id: "buddy.test.oauth",
      setup: async (ctx) => {
        await ctx.integration.transform((editor) =>
          editor.method.update({
            integrationID: "openai",
            method: {
              id: "fixture-auto",
              type: "oauth",
              label: "Fixture OAuth",
              form: [
                {
                  type: "string",
                  key: "deployment",
                  title: "Deployment",
                  required: true,
                  options: [{ label: "Public", value: "public" }],
                },
              ],
            },
            authorize: async (answers) => {
              expect(answers.deployment).toBe("public")
              const result = deferred<Credential.OAuth>()
              attempts.push(result)
              return {
                mode: "auto",
                url: "https://example.test/oauth",
                instructions: "Sign in",
                callback: result.promise,
              }
            },
          }),
        )
      },
    }),
  )
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(methods.openai?.some((method) => method.id === "chatgpt-browser")).toBe(true)
  expect(methods.openai?.find((method) => method.id === "fixture-auto")?.prompts).toEqual([
    {
      type: "select",
      key: "deployment",
      message: "Deployment",
      required: true,
      options: [{ label: "Public", value: "public" }],
    },
  ])
  const first = await startProviderOAuth(runtime.host, runtime.path, "openai", {
    methodID: "fixture-auto",
    answers: { deployment: "public" },
  })
  const second = await startProviderOAuth(runtime.host, runtime.path, "openai", {
    methodID: "fixture-auto",
    answers: { deployment: "public" },
  })
  expect(first.attemptID).not.toBe(second.attemptID)
  expect(first.methodID).toBe("fixture-auto")
  await cancelProviderOAuth(runtime.host, runtime.path, "openai", first.attemptID)
  const remaining = await runtime.host.integration.oauth.status({
    location: { directory: runtime.path },
    integrationID: "openai",
    attemptID: second.attemptID,
  })
  expect(remaining.data.status).toBe("pending")
  attempts[1]?.resolve(oauthValue("second-access"))
  expect(await completeProviderOAuth(runtime.host, runtime.path, "openai", second)).toBe(true)
  const credentials = await runtime.host.credential.list()
  expect(
    credentials.some(
      (entry) =>
        entry.integrationID === "openai" &&
        entry.value.type === "oauth" &&
        entry.value.access === "second-access",
    ),
  ).toBe(true)
})

test("disconnect removes all stored credentials while method lists never expose their values", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  await setProviderKey(runtime.host, runtime.path, "openai", "first-secret")
  await setProviderKey(runtime.host, runtime.path, "openai", "second-secret")
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(JSON.stringify(methods)).not.toContain("secret")
  await removeProviderCredentials(runtime.host, runtime.path, "openai")
  expect(
    (await runtime.host.credential.list()).filter((entry) => entry.integrationID === "openai"),
  ).toEqual([])
})

test("a disconnected provider alias resolves its integration for key set and removal", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(
    Plugin.define({
      id: "buddy.test.provider-alias",
      setup: async (ctx) => {
        await ctx.provider.transform((editor) =>
          editor.add({
            info: {
              ...Provider.Info.empty(Provider.ID.make("anthropic-alias")),
              name: "Anthropic alias",
              integrationID: Integration.ID.make("anthropic"),
            },
            models: [],
          }),
        )
      },
    }),
  )
  await runtime.host.plugin(createProviderCatalogPlugin())
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(methods["anthropic-alias"]).toEqual(methods.anthropic)
  await setProviderKey(runtime.host, runtime.path, "anthropic-alias", "alias-secret")
  const connected = await runtime.host.integration.get({
    location: { directory: runtime.path },
    integrationID: "anthropic",
  })
  expect(connected.data?.connections.some((connection) => connection.type === "credential")).toBe(
    true,
  )
  await removeProviderCredentials(runtime.host, runtime.path, "anthropic-alias")
  expect(
    (await runtime.host.credential.list()).filter((entry) => entry.integrationID === "anthropic"),
  ).toEqual([])
})

test("Buddy credential resolution shares one refresh across concurrent notebook consumers", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  const refreshed = deferred<Credential.OAuth>()
  const started = deferred<void>()
  let calls = 0
  let context: PluginContext | undefined
  await runtime.host.plugin(
    Plugin.define({
      id: "buddy.test.refresh",
      setup: async (ctx) => {
        context = ctx
        await ctx.integration.transform((editor) =>
          editor.method.update({
            integrationID: "anthropic",
            method: { id: "fixture-auto", type: "oauth", label: "Fixture OAuth" },
            authorize: async () => ({
              mode: "auto",
              url: "https://example.test",
              instructions: "Sign in",
              callback: Promise.resolve(oauthValue("access")),
            }),
            refresh: async () => {
              calls += 1
              started.resolve()
              return refreshed.promise
            },
          }),
        )
      },
    }),
  )
  await runtime.host.integration.list({ location: { directory: runtime.path } })
  await runtime.host.credential.create({
    integrationID: "anthropic",
    value: {
      type: "oauth",
      methodID: "fixture-auto",
      access: "expired",
      refresh: "refresh",
      expires: 0,
    },
  })
  if (!context) throw new Error("Plugin did not activate")
  const firstContext = context
  const connection = await context.integration.connection.active("anthropic")
  if (!connection) throw new Error("Connection is missing")
  const secondDirectory = path.join(runtime.path, "second-notebook")
  await fs.mkdir(secondDirectory)
  await runtime.host.integration.list({ location: { directory: secondDirectory } })
  expect(context).not.toBe(firstContext)
  const first = resolveIntegrationCredential(firstContext, connection)
  await started.promise
  const second = resolveIntegrationCredential(context, connection)
  refreshed.resolve(oauthValue("refreshed"))
  expect((await first)?.type).toBe("oauth")
  expect((await second)?.type).toBe("oauth")
  expect(calls).toBe(1)
})

for (const nativeRefresh of [true, false]) {
  test(`a failed ChatGPT refresh ${nativeRefresh ? "recovers with a token refreshed by native chat" : "still requires reconnect without a native refresh"}`, async () => {
    await using runtime = await createV2TestHost()
    const started = deferred<void>()
    const failed = deferred<void>()
    let refreshToNew = false
    let delayResolution = false
    let context: PluginContext | undefined
    let credentials: ChatGPTCredentials | undefined
    const codex = createChatGPTPlugin((location, accountCredentials) => {
      credentials = accountCredentials
      return createChatGPTAccountService(location, accountCredentials, {
        fetch: async (input, init) => {
          const url = new URL(String(input))
          if (url.pathname.endsWith("/models")) return Response.json({ models: [] })
          if (url.pathname.endsWith("/userinfo")) {
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer new-access")
            return Response.json({ email: "student@example.test" })
          }
          throw new Error(`Unexpected request: ${url.pathname}`)
        },
      })
    })
    await runtime.host.plugin(
      Plugin.define({
        id: codex.id,
        async setup(ctx) {
          context = ctx
          await ctx.integration.transform((editor) =>
            editor.method.update({
              integrationID: "openai",
              method: { id: "chatgpt-browser", type: "oauth", label: "Fixture OAuth" },
              authorize: async () => {
                throw new Error("Unexpected authorization")
              },
              refresh: async (credential) =>
                refreshToNew
                  ? Credential.OAuth.make({
                      ...credential,
                      access: "new-access",
                      refresh: "new-refresh",
                      expires: Number.MAX_SAFE_INTEGER,
                    })
                  : credential,
            }),
          )
          return codex.setup({
            ...ctx,
            integration: {
              ...ctx.integration,
              connection: {
                ...ctx.integration.connection,
                resolve: async (connection) => {
                  const result = await ctx.integration.connection.resolve(connection)
                  if (!delayResolution) return result
                  expect(result).toMatchObject({
                    access: "old-access",
                    refresh: "old-refresh",
                    expires: 0,
                  })
                  started.resolve()
                  await failed.promise
                  throw new Error("Request failed: 401")
                },
              },
            },
          })
        },
      }),
    )
    await runtime.host.integration.list({ location: { directory: runtime.path } })
    const saved = await runtime.host.credential.create({
      integrationID: "openai",
      value: {
        type: "oauth",
        methodID: "chatgpt-browser",
        access: "old-access",
        refresh: "old-refresh",
        expires: 0,
      },
    })
    if (!context || !credentials) throw new Error("Plugin did not activate")
    delayResolution = true
    const oldRefresh = credentials.resolve()
    void oldRefresh.catch(() => undefined)
    await started.promise
    const connection = await context.integration.connection.active("openai")
    if (!connection || connection.type !== "credential") throw new Error("Connection is missing")
    expect(connection.id).toBe(saved.id)
    if (nativeRefresh) {
      refreshToNew = true
      expect(await context.integration.connection.resolve(connection)).toMatchObject({
        access: "new-access",
      })
      expect(
        (await runtime.host.credential.list()).find((entry) => entry.id === saved.id)?.value,
      ).toMatchObject({ access: "new-access" })
      delayResolution = false
    }
    failed.resolve()
    if (!nativeRefresh) {
      await expect(oldRefresh).rejects.toBeInstanceOf(ChatGPTReconnectRequired)
      return
    }
    expect(await oldRefresh).toMatchObject({ access: "new-access", credentialID: saved.id })
    const identity = await runtime.host.rpc.call({
      location: { directory: runtime.path },
      rpcID: "buddy.codex",
      method: "identity",
      input: {},
    })
    expect(identity.output).toEqual({ status: "ready", email: "student@example.test" })
    expect(
      (await context.integration.get({ integrationID: "openai" })).data.connections.some(
        (entry) => entry.status?.status === "needs_auth",
      ),
    ).toBe(false)
    expect(await credentials.resolve()).toMatchObject({ access: "new-access" })
  })
}

for (const refreshedAccess of ["access-B", "access-A"]) {
  test(`a rejected ChatGPT connection ${refreshedAccess === "access-B" ? "recovers after a native token refresh" : "still requires reconnect with the same access token"}`, async () => {
    await using runtime = await createV2TestHost()
    let refreshToken = false
    let context: PluginContext | undefined
    let credentials: ChatGPTCredentials | undefined
    await runtime.host.plugin(
      createChatGPTPlugin((location, accountCredentials) => {
        credentials = accountCredentials
        return createChatGPTAccountService(location, accountCredentials, {
          fetch: async (input) => {
            const url = new URL(String(input))
            if (url.pathname.endsWith("/models")) return Response.json({ models: [] })
            if (url.pathname.endsWith("/usage"))
              return Response.json({ error: "Token rejected" }, { status: 401 })
            if (url.pathname.endsWith("/userinfo"))
              return Response.json({ email: "student@example.test" })
            throw new Error(`Unexpected request: ${url.pathname}`)
          },
        })
      }),
    )
    await runtime.host.plugin(
      Plugin.define({
        id: "buddy.test.rejected-token-refresh",
        async setup(ctx) {
          context = ctx
          await ctx.integration.transform((editor) =>
            editor.method.update({
              integrationID: "openai",
              method: { id: "chatgpt-browser", type: "oauth", label: "Fixture refresh" },
              authorize: async () => {
                throw new Error("Unexpected authorization")
              },
              refresh: async (credential) =>
                refreshToken
                  ? Credential.OAuth.make({
                      ...credential,
                      access: refreshedAccess,
                      refresh: "refresh-B",
                      expires: Number.MAX_SAFE_INTEGER,
                    })
                  : credential,
            }),
          )
        },
      }),
    )
    await runtime.host.integration.list({ location: { directory: runtime.path } })
    const saved = await runtime.host.credential.create({
      integrationID: "openai",
      value: {
        type: "oauth",
        methodID: "chatgpt-browser",
        access: "access-A",
        refresh: "refresh-A",
        expires: 0,
      },
    })
    const usage = await runtime.host.rpc.call({
      location: { directory: runtime.path },
      rpcID: "buddy.codex",
      method: "usage",
      input: { refresh: true },
    })
    expect(usage.output).toEqual({ status: "reconnect_required" })
    if (!context || !credentials) throw new Error("Plugin did not activate")
    const connection = await context.integration.connection.active("openai")
    if (!connection || connection.type !== "credential") throw new Error("Connection is missing")
    expect(connection.id).toBe(saved.id)
    expect(
      (await context.integration.get({ integrationID: "openai" })).data.connections.find(
        (entry) => entry.type === "credential" && entry.id === saved.id,
      )?.status?.status,
    ).toBe("needs_auth")
    refreshToken = true
    expect(await context.integration.connection.resolve(connection)).toMatchObject({
      access: refreshedAccess,
    })
    expect(
      (await runtime.host.credential.list()).find((entry) => entry.id === saved.id)?.value,
    ).toMatchObject({ access: refreshedAccess })
    if (refreshedAccess === "access-B") {
      const identity = await runtime.host.rpc.call({
        location: { directory: runtime.path },
        rpcID: "buddy.codex",
        method: "identity",
        input: {},
      })
      expect(identity.output).toEqual({ status: "ready", email: "student@example.test" })
      expect(
        (await context.integration.get({ integrationID: "openai" })).data.connections.find(
          (entry) => entry.type === "credential" && entry.id === saved.id,
        )?.status,
      ).toBeUndefined()
    } else {
      await expect(credentials.resolve()).rejects.toBeInstanceOf(ChatGPTReconnectRequired)
      expect(
        (await context.integration.get({ integrationID: "openai" })).data.connections.find(
          (entry) => entry.type === "credential" && entry.id === saved.id,
        )?.status?.status,
      ).toBe("needs_auth")
    }
  })
}
