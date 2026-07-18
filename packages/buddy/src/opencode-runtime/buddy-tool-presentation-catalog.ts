import { ToolRegistry } from "@buddy/opencode-adapter/registry"

let presentationRegistrationsPromise:
  | Promise<readonly ToolRegistry.ToolPresentationRegistration[]>
  | undefined

function loadBuddyToolPresentationRegistrations(): Promise<
  readonly ToolRegistry.ToolPresentationRegistration[]
> {
  presentationRegistrationsPromise ??= Promise.all([
    import("../learning/runtime/feature-registry"),
    import("../learning/runtime/dynamic-tool-discovery"),
  ]).then(([{ allBuddyTools }, { getDynamicToolSearchTools }]) =>
    [...allBuddyTools(), ...getDynamicToolSearchTools()].map((tool) => ({
      id: tool.id,
      presentation: tool.presentation,
    })),
  )

  return presentationRegistrationsPromise
}

/**
 * Presentation enrichment can run before OpenCode constructs the Buddy plugin,
 * especially when a cold desktop process opens persisted history. Keep catalog
 * readiness independent from agent execution so every transport boundary sees
 * the same authored Buddy descriptors.
 */
export async function ensureBuddyToolPresentationCatalog(directory: string): Promise<void> {
  const registrations = await loadBuddyToolPresentationRegistrations()
  const toolIDs = registrations.map((registration) => registration.id)
  if (ToolRegistry.hasToolPresentationCatalog(directory, toolIDs)) return

  ToolRegistry.registerToolPresentationCatalog(directory, registrations)
}
