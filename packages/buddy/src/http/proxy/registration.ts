import { registerRuntimeTools } from "../../learning/runtime/register-tools"
import type { ProxyRegistrationFlags, ProxyRegistrationOption, ProxyToOpenCodeInput } from "./types"
import { allBuddyFeatures } from "../../learning/runtime/feature-registry"

async function registerOpenCodeTools(
  directory: string,
  flags: ProxyRegistrationFlags,
): Promise<void> {
  await registerRuntimeTools(directory, flags)
}

function resolveRegistration(
  body: Record<string, unknown>,
  value: ProxyRegistrationOption | undefined,
): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "function") return value(body)
  return false
}

function allFeatureIds(): string[] {
  return allBuddyFeatures().map((f) => f.id)
}

function buildProxyRegistrationFlags(
  resolveFeature: (featureId: string) => boolean,
): ProxyRegistrationFlags {
  return Object.fromEntries(
    allFeatureIds().map((id) => [id, resolveFeature(id)]),
  ) as ProxyRegistrationFlags
}

function normalizeToolRegistrationFlags(
  flags?: Partial<Record<string, boolean>>,
): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((id) => flags?.[id] === true)
}

function resolveInitialRegistrationFlags(input: ProxyToOpenCodeInput): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((id) =>
    typeof input.toolRegistrations?.[id] === "boolean" ? input.toolRegistrations[id] : false,
  )
}

function resolveBodyRegistrationFlags(
  body: Record<string, unknown>,
  input: ProxyToOpenCodeInput,
): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((id) =>
    resolveRegistration(body, input.toolRegistrations?.[id] as ProxyRegistrationOption | undefined),
  )
}

export {
  normalizeToolRegistrationFlags,
  registerOpenCodeTools,
  resolveBodyRegistrationFlags,
  resolveInitialRegistrationFlags,
}
