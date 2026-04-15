import { registerRuntimeTools } from "../../learning/tools/register-runtime-tools"
import { allLearningToolGroups, type LearningToolGroup } from "../../learning/tools/tool-metadata"
import type { ProxyRegistrationFlags, ProxyRegistrationOption, ProxyToOpenCodeInput } from "./types"

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

function buildProxyRegistrationFlags(
  resolveGroup: (group: LearningToolGroup) => boolean,
): ProxyRegistrationFlags {
  return Object.fromEntries(
    allLearningToolGroups().map((group) => [group, resolveGroup(group)]),
  ) as ProxyRegistrationFlags
}

function normalizeToolRegistrationFlags(
  flags?: Partial<Record<LearningToolGroup, boolean>>,
): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((group) => flags?.[group] === true)
}

function resolveInitialRegistrationFlags(input: ProxyToOpenCodeInput): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((group) =>
    typeof input.toolRegistrations?.[group] === "boolean" ? input.toolRegistrations[group] : false,
  )
}

function resolveBodyRegistrationFlags(
  body: Record<string, unknown>,
  input: ProxyToOpenCodeInput,
): ProxyRegistrationFlags {
  return buildProxyRegistrationFlags((group) =>
    resolveRegistration(
      body,
      input.toolRegistrations?.[group] as ProxyRegistrationOption | undefined,
    ),
  )
}

export {
  normalizeToolRegistrationFlags,
  registerOpenCodeTools,
  resolveBodyRegistrationFlags,
  resolveInitialRegistrationFlags,
}
