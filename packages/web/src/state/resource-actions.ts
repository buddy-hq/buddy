import type {
  ObjectResourceCreateResponses,
  ObjectResourceDeleteByKeyResponses,
  ObjectResourceListResponses,
  ObjectResourceRebuildByKeyResponses,
  ObjectResourceRenameByKeyResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"

export const RESOURCE_API_BASE_PATH = "/api/objects/resource" as const

export type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

type ResourceApiRecord = ObjectResourceListResponses[200]["resources"][number]

export type ResourceRecord = Pick<
  ResourceApiRecord,
  | "objectID"
  | "alias"
  | "sourceRelpath"
  | "format"
  | "status"
  | "sourceValidity"
  | "extractionStatus"
  | "warnings"
  | "preparedAt"
  | "sourceMtimeMs"
  | "sourceSizeBytes"
  | "coverRelpath"
  | "title"
  | "author"
  | "readerPath"
> & {
  sourceOriginRelpath?: string
}

export async function loadResources(directory: string) {
  const result = await getBuddyClient(directory).objectResource.list()
  const response = requireBuddyData<ObjectResourceListResponses[200]>(result)
  return response.resources
}

export async function addResource(
  directory: string,
  input: {
    sourcePath: string
    alias?: string
  },
) {
  const result = await getBuddyClient(directory).objectResource.create({
    sourcePath: input.sourcePath,
    alias: input.alias,
  })
  return requireBuddyData<ObjectResourceCreateResponses[200]>(result)
}

export async function renameResource(
  directory: string,
  input: {
    resourceKey: string
    alias: string
  },
) {
  const result = await getBuddyClient(directory).objectResource.renameByKey({
    resourceKey: input.resourceKey,
    alias: input.alias,
  })
  return requireBuddyData<ObjectResourceRenameByKeyResponses[200]>(result)
}

export async function rebuildResource(
  directory: string,
  input: {
    resourceKey: string
  },
) {
  const result = await getBuddyClient(directory).objectResource.rebuildByKey({
    resourceKey: input.resourceKey,
  })
  return requireBuddyData<ObjectResourceRebuildByKeyResponses[200]>(result)
}

export async function removeResource(
  directory: string,
  input: {
    resourceKey: string
  },
) {
  const result = await getBuddyClient(directory).objectResource.deleteByKey({
    resourceKey: input.resourceKey,
  })
  return requireBuddyData<ObjectResourceDeleteByKeyResponses[200]>(result)
}
