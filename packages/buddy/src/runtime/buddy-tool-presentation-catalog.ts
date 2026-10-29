import { realpathSync } from "node:fs"
import path from "node:path"
import {
  cloneToolPresentationDescriptor,
  type ToolPresentationDescriptor,
} from "@buddy/transcript-contract/tool-presentation"

export type BuddyToolPresentationRegistration = {
  id: string
  presentation: ToolPresentationDescriptor
}

const catalogs = new Map<string, Map<string, ToolPresentationDescriptor>>()
let defaultRegistrationsPromise: Promise<readonly BuddyToolPresentationRegistration[]> | undefined

function directoryKey(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function loadDefaultRegistrations(): Promise<readonly BuddyToolPresentationRegistration[]> {
  defaultRegistrationsPromise ??= Promise.all([
    import("../learning/runtime/feature-registry"),
    import("../learning/runtime/dynamic-tool-discovery"),
  ]).then(([{ allBuddyTools }, { getDynamicToolSearchTools }]) =>
    [...allBuddyTools(), ...getDynamicToolSearchTools()].map((tool) => ({
      id: tool.id,
      presentation: tool.presentation,
    })),
  )

  return defaultRegistrationsPromise
}

export function registerBuddyToolPresentationCatalog(
  directory: string,
  registrations: readonly BuddyToolPresentationRegistration[],
) {
  const key = directoryKey(directory)
  const catalog = catalogs.get(key) ?? new Map<string, ToolPresentationDescriptor>()
  for (const registration of registrations) {
    catalog.set(registration.id, cloneToolPresentationDescriptor(registration.presentation))
  }
  catalogs.set(key, catalog)
}

export async function ensureBuddyToolPresentationCatalog(directory: string): Promise<void> {
  const registrations = await loadDefaultRegistrations()
  const catalog = catalogs.get(directoryKey(directory))
  if (registrations.every((registration) => catalog?.has(registration.id) === true)) return

  registerBuddyToolPresentationCatalog(directory, registrations)
}

export function getBuddyToolPresentationDescriptor(
  directory: string,
  toolName: string,
): ToolPresentationDescriptor | undefined {
  const descriptor = catalogs.get(directoryKey(directory))?.get(toolName)
  if (descriptor) return cloneToolPresentationDescriptor(descriptor)
  return undefined
}
