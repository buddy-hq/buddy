import type {
  MermaidArtifactsReadResponses,
  MermaidArtifactsResolveRenderResponses,
  MermaidArtifactsStoreRenderResponses,
  SessionMermaidRepairAsyncResponses,
  SessionMermaidRepairStatusResponses,
} from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

type MermaidArtifactRecord = MermaidArtifactsReadResponses[200]
type MermaidResolvedRenderResponse = MermaidArtifactsResolveRenderResponses[200]
type MermaidStoredRenderRecord = MermaidArtifactsStoreRenderResponses[200]
type MermaidRepairStartResponse = SessionMermaidRepairAsyncResponses[200]
type MermaidRepairStatusResponse = SessionMermaidRepairStatusResponses[200]

const mermaidAutoRepairRequests = new Map<string, Promise<MermaidRepairStartResponse>>()

async function readMermaidArtifact(
  directory: string,
  artifactID: string,
): Promise<MermaidArtifactRecord> {
  return requireBuddyData(await getBuddyClient(directory).mermaidArtifacts.read({ artifactID }))
}

async function createInlineMermaidArtifact(input: {
  alt?: string
  caption?: string
  directory: string
  messageID: string
  partID: string
  segmentIndex: number
  sessionID: string
  source: string
}): Promise<MermaidArtifactRecord> {
  return requireBuddyData(
    await getBuddyClient(input.directory).mermaidArtifacts.createInline({
      sessionID: input.sessionID,
      messageID: input.messageID,
      partID: input.partID,
      segmentIndex: input.segmentIndex,
      source: input.source,
      ...(input.alt ? { alt: input.alt } : {}),
      ...(input.caption ? { caption: input.caption } : {}),
    }),
  )
}

async function resolvePersistedMermaidRender(input: {
  artifactID: string
  directory: string
  renderConfigVersion: number
  rendererVersion: string
  themeSignature: string
}): Promise<MermaidResolvedRenderResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).mermaidArtifacts.resolveRender({
      artifactID: input.artifactID,
      renderConfigVersion: input.renderConfigVersion,
      rendererVersion: input.rendererVersion,
      themeSignature: input.themeSignature,
    }),
  )
}

async function storePersistedMermaidRender(
  input:
    | {
        artifactID: string
        contrastAdjustments: MermaidStoredRenderRecord extends infer T
          ? T extends { status: "rendered"; contrastAdjustments: infer Adjustments }
            ? Adjustments
            : never
          : never
        directory: string
        renderConfigVersion: number
        rendererVersion: string
        status: "rendered"
        svg: string
        themeSignature: string
      }
    | {
        artifactID: string
        directory: string
        errorMessage: string
        renderConfigVersion: number
        rendererVersion: string
        status: "failed"
        themeSignature: string
      },
): Promise<MermaidStoredRenderRecord> {
  return requireBuddyData(
    await getBuddyClient(input.directory).mermaidArtifacts.storeRender({
      artifactID: input.artifactID,
      body:
        input.status === "rendered"
          ? {
              themeSignature: input.themeSignature,
              rendererVersion: input.rendererVersion,
              renderConfigVersion: input.renderConfigVersion,
              status: "rendered",
              svg: input.svg,
              contrastAdjustments: input.contrastAdjustments,
            }
          : {
              themeSignature: input.themeSignature,
              rendererVersion: input.rendererVersion,
              renderConfigVersion: input.renderConfigVersion,
              status: "failed",
              errorMessage: input.errorMessage,
            },
    }),
  )
}

async function startMermaidAutoRepair(input: {
  artifactID: string
  directory: string
  failedRenderKey: string
  sessionID: string
}): Promise<MermaidRepairStartResponse> {
  const key = [input.directory, input.sessionID, input.artifactID, input.failedRenderKey].join("::")
  const existing = mermaidAutoRepairRequests.get(key)
  if (existing) {
    return existing
  }

  const request = getBuddyClient(input.directory)
    .session.mermaidRepairAsync({
      sessionID: input.sessionID,
      artifactID: input.artifactID,
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
  createInlineMermaidArtifact,
  readMermaidArtifact,
  readMermaidAutoRepairStatus,
  resolvePersistedMermaidRender,
  startMermaidAutoRepair,
  storePersistedMermaidRender,
}

export type {
  MermaidArtifactRecord,
  MermaidRepairStartResponse,
  MermaidRepairStatusResponse,
  MermaidResolvedRenderResponse,
  MermaidStoredRenderRecord,
}
