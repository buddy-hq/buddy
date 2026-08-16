import type {
  ObjectMermaidCreateInlineResponses,
  ObjectMermaidReadSourceResponses,
  ObjectMermaidResolveRenderResponses,
  ObjectMermaidStoreRenderData,
  ObjectMermaidStoreRenderResponses,
  SessionMermaidRepairAsyncResponses,
  SessionMermaidRepairStatusResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

type MermaidObjectRecord = ObjectMermaidReadSourceResponses[200]
type MermaidResolvedRenderResponse = ObjectMermaidResolveRenderResponses[200]
type MermaidStoredRenderRecord = ObjectMermaidStoreRenderResponses[200]
type MermaidRenderedStoreInput = Extract<
  ObjectMermaidStoreRenderData["body"],
  { status: "rendered" }
>
type MermaidRepairStartResponse = SessionMermaidRepairAsyncResponses[200]
type MermaidRepairStatusResponse = SessionMermaidRepairStatusResponses[200]
type MermaidInlineCreateResponse = ObjectMermaidCreateInlineResponses[200]

const mermaidAutoRepairRequests = new Map<string, Promise<MermaidRepairStartResponse>>()

async function readMermaidObject(
  directory: string,
  objectID: string,
  revisionID?: string | null,
): Promise<MermaidObjectRecord> {
  return requireBuddyData(
    await getBuddyClient(directory).objectMermaid.readSource(
      Object.assign(
        {
          objectID,
          directory,
        },
        revisionID ? { revisionID } : undefined,
      ),
    ),
  )
}

async function createInlineMermaidObject(input: {
  alt?: string
  caption?: string
  directory: string
  messageID: string
  partID: string
  segmentIndex: number
  sessionID: string
  source: string
}): Promise<MermaidInlineCreateResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectMermaid.createInline(
      Object.assign(
        {
          directory: input.directory,
          sessionID: input.sessionID,
          messageID: input.messageID,
          partID: input.partID,
          segmentIndex: input.segmentIndex,
          source: input.source,
        },
        input.alt ? { alt: input.alt } : undefined,
        input.caption ? { caption: input.caption } : undefined,
      ),
    ),
  )
}

async function resolvePersistedMermaidRender(input: {
  directory: string
  objectID: string
  renderConfigVersion: number
  rendererVersion: string
  revisionID?: string | null
  themeSignature: string
}): Promise<MermaidResolvedRenderResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectMermaid.resolveRender(
      Object.assign(
        {
          objectID: input.objectID,
          directory: input.directory,
          renderConfigVersion: input.renderConfigVersion,
          rendererVersion: input.rendererVersion,
          themeSignature: input.themeSignature,
        },
        input.revisionID ? { revisionID: input.revisionID } : undefined,
      ),
    ),
  )
}

async function storePersistedMermaidRender(
  input:
    | {
        contrastAdjustments: MermaidRenderedStoreInput["contrastAdjustments"]
        directory: string
        objectID: string
        renderConfigVersion: number
        rendererVersion: string
        revisionID?: string | null
        status: "rendered"
        svg: string
        themeSignature: string
      }
    | {
        directory: string
        errorMessage: string
        objectID: string
        renderConfigVersion: number
        rendererVersion: string
        revisionID?: string | null
        status: "failed"
        themeSignature: string
      },
): Promise<MermaidStoredRenderRecord> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectMermaid.storeRender(
      Object.assign(
        {
          objectID: input.objectID,
          directory: input.directory,
          body:
            input.status === "rendered"
              ? {
                  themeSignature: input.themeSignature,
                  rendererVersion: input.rendererVersion,
                  renderConfigVersion: input.renderConfigVersion,
                  status: "rendered" as const,
                  svg: input.svg,
                  contrastAdjustments: input.contrastAdjustments,
                }
              : {
                  themeSignature: input.themeSignature,
                  rendererVersion: input.rendererVersion,
                  renderConfigVersion: input.renderConfigVersion,
                  status: "failed" as const,
                  errorMessage: input.errorMessage,
                },
        },
        input.revisionID ? { revisionID: input.revisionID } : undefined,
      ),
    ),
  )
}

async function startMermaidAutoRepair(input: {
  directory: string
  failedRenderKey: string
  objectID: string
  sessionID: string
}): Promise<MermaidRepairStartResponse> {
  const key = [input.directory, input.sessionID, input.objectID, input.failedRenderKey].join("::")
  const existing = mermaidAutoRepairRequests.get(key)
  if (existing) {
    return existing
  }

  const request = getBuddyClient(input.directory)
    .session.mermaidRepairAsync({
      sessionID: input.sessionID,
      objectID: input.objectID,
      failedRenderKey: input.failedRenderKey,
    })
    .then((result) => requireBuddyData(result))
    .finally(() => {
      mermaidAutoRepairRequests.delete(key)
    })

  mermaidAutoRepairRequests.set(key, request)
  return request
}

async function readMermaidAutoRepairStatus(input: {
  directory: string
  repairRequestID: string
  sessionID: string
}): Promise<MermaidRepairStatusResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).session.mermaidRepairStatus({
      repairRequestID: input.repairRequestID,
      sessionID: input.sessionID,
    }),
  )
}

export {
  createInlineMermaidObject,
  readMermaidObject,
  readMermaidAutoRepairStatus,
  resolvePersistedMermaidRender,
  startMermaidAutoRepair,
  storePersistedMermaidRender,
}

export type {
  MermaidObjectRecord,
  MermaidRepairStartResponse,
  MermaidRepairStatusResponse,
  MermaidResolvedRenderResponse,
  MermaidStoredRenderRecord,
}
