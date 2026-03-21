import type {
  ResourceAddResponses,
  ResourceListResponses,
  ResourceRebuildResponses,
  ResourceRemoveResponses,
  ResourceRenameResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"

export const RESOURCE_API_BASE_PATH = "/api/resource" as const

export type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type ResourceRecord = ResourceListResponses[200]["resources"][number]

export async function loadResources(directory: string) {
  const result = await getBuddyClient(directory).resource.list()
  const response = requireBuddyData<ResourceListResponses[200]>(result)
  return response.resources
}

export async function addResource(
  directory: string,
  input: {
    sourcePath: string
    alias?: string
  },
) {
  const result = await getBuddyClient(directory).resource.add({
    sourcePath: input.sourcePath,
    alias: input.alias,
  })
  return requireBuddyData<ResourceAddResponses[200]>(result)
}

export async function renameResource(
  directory: string,
  input: {
    resourceKey: string
    alias: string
  },
) {
  const result = await getBuddyClient(directory).resource.rename({
    resourceKey: input.resourceKey,
    alias: input.alias,
  })
  return requireBuddyData<ResourceRenameResponses[200]>(result)
}

export async function rebuildResource(
  directory: string,
  input: {
    resourceKey: string
  },
) {
  const result = await getBuddyClient(directory).resource.rebuild({
    resourceKey: input.resourceKey,
  })
  return requireBuddyData<ResourceRebuildResponses[200]>(result)
}

export async function removeResource(
  directory: string,
  input: {
    resourceKey: string
  },
) {
  const result = await getBuddyClient(directory).resource.remove({
    resourceKey: input.resourceKey,
  })
  return requireBuddyData<ResourceRemoveResponses[200]>(result)
}
