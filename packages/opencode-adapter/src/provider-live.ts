import { Effect } from "effect"
import { AppNodeBuilderV1 } from "opencode/effect/app-node-builder-v1"
import { InstanceRef } from "opencode/effect/instance-ref"
import { makeRuntime } from "opencode/effect/run-service"
import * as OpenCodeProvider from "opencode/provider/provider"
import { Config } from "./config"

type ProviderResolver = (input: {
  directory: string
  provider: OpenCodeProvider.Info
}) => Promise<OpenCodeProvider.Info | undefined>

const runtime = makeRuntime(OpenCodeProvider.Service, AppNodeBuilderV1.build(OpenCodeProvider.node))
const patchedServices = new WeakSet<OpenCodeProvider.Interface>()
const resolvers = new Map<string, ProviderResolver>()
let patchPromise: Promise<void> | undefined

const resolveProvider = Effect.fn("BuddyProvider.resolve")(function* (
  provider: OpenCodeProvider.Info,
) {
  const resolver = resolvers.get(provider.id)
  if (!resolver) return undefined

  const instance = yield* InstanceRef
  if (!instance) return undefined

  return yield* Effect.tryPromise({
    try: () => resolver({ directory: instance.directory, provider }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Buddy provider model resolution failed").pipe(
        Effect.annotateLogs({ providerID: provider.id, error }),
        Effect.as(undefined),
      ),
    ),
  )
})

function ensurePatched(service: OpenCodeProvider.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalList = service.list.bind(service)
  const originalGetProvider = service.getProvider.bind(service)
  const originalGetModel = service.getModel.bind(service)
  const originalClosest = service.closest.bind(service)
  const originalGetSmallModel = service.getSmallModel.bind(service)
  const originalDefaultModel = service.defaultModel.bind(service)

  const list: OpenCodeProvider.Interface["list"] = Effect.fn("BuddyProvider.list")(function* () {
    const providers = yield* originalList()
    const result = { ...providers }
    for (const provider of Object.values(providers)) {
      const resolved = yield* resolveProvider(provider)
      if (resolved) result[provider.id] = resolved
    }
    return result
  })

  const getProvider: OpenCodeProvider.Interface["getProvider"] = Effect.fn(
    "BuddyProvider.getProvider",
  )(function* (providerID) {
    const provider = yield* originalGetProvider(providerID)
    if (!provider) return provider
    return (yield* resolveProvider(provider)) ?? provider
  })

  const getModel: OpenCodeProvider.Interface["getModel"] = Effect.fn("BuddyProvider.getModel")(
    function* (providerID, modelID) {
      if (!resolvers.has(providerID)) return yield* originalGetModel(providerID, modelID)
      const provider = yield* originalGetProvider(providerID)
      if (!provider) return yield* originalGetModel(providerID, modelID)
      const resolved = yield* resolveProvider(provider)
      if (!resolved) return yield* originalGetModel(providerID, modelID)
      const model = resolved.models[modelID]
      if (model) return model
      return yield* new OpenCodeProvider.ModelNotFoundError({ providerID, modelID })
    },
  )

  const closest: OpenCodeProvider.Interface["closest"] = Effect.fn("BuddyProvider.closest")(
    function* (providerID, query) {
      if (!resolvers.has(providerID)) return yield* originalClosest(providerID, query)
      const provider = yield* originalGetProvider(providerID)
      if (!provider) return yield* originalClosest(providerID, query)
      const resolved = yield* resolveProvider(provider)
      if (!resolved) return yield* originalClosest(providerID, query)
      for (const part of query) {
        const modelID = Object.keys(resolved.models).find((id) => id.includes(part))
        if (modelID) return { providerID, modelID }
      }
      return undefined
    },
  )

  const getSmallModel: OpenCodeProvider.Interface["getSmallModel"] = Effect.fn(
    "BuddyProvider.getSmallModel",
  )(function* (providerID) {
    const model = yield* originalGetSmallModel(providerID)
    if (!resolvers.has(providerID) || (model && model.providerID !== providerID)) return model
    const provider = yield* originalGetProvider(providerID)
    if (!provider) return model
    const resolved = yield* resolveProvider(provider)
    if (!resolved) return model
    if (model) return resolved.models[model.id]

    const config = yield* Effect.tryPromise({
      try: () => Config.get(),
      catch: (error) => error,
    }).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!config?.small_model) return undefined
    const configured = OpenCodeProvider.parseModel(config.small_model)
    if (configured.providerID !== providerID) return undefined
    return resolved.models[configured.modelID]
  })

  const defaultModel: OpenCodeProvider.Interface["defaultModel"] = Effect.fn(
    "BuddyProvider.defaultModel",
  )(function* () {
    const selected = yield* originalDefaultModel()
    if (!resolvers.has(selected.providerID)) return selected
    const provider = yield* originalGetProvider(selected.providerID)
    if (!provider) return selected
    const resolved = yield* resolveProvider(provider)
    if (!resolved || resolved.models[selected.modelID]) return selected
    const [replacement] = Object.values(resolved.models)
    if (!replacement)
      return yield* new OpenCodeProvider.NoModelsError({ providerID: selected.providerID })
    return { providerID: selected.providerID, modelID: replacement.id }
  })

  Object.defineProperties(service, {
    list: { value: list },
    getProvider: { value: getProvider },
    getModel: { value: getModel },
    closest: { value: closest },
    getSmallModel: { value: getSmallModel },
    defaultModel: { value: defaultModel },
  })
}

export async function ensureProviderServicePatched() {
  patchPromise ??= runtime
    .runPromise((service) => Effect.sync(() => ensurePatched(service)))
    .catch((error) => {
      patchPromise = undefined
      throw error
    })
  await patchPromise
}

export function registerProviderResolver(providerID: string, resolver: ProviderResolver) {
  resolvers.set(providerID, resolver)
  return () => {
    if (resolvers.get(providerID) === resolver) resolvers.delete(providerID)
  }
}
