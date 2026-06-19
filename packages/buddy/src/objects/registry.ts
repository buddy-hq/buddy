import type { z } from "zod"
import type { BuddyObjectManifest, BuddyObjectRef, BuddyObjectSummary } from "./manifest"
import type { BuddyObjectKind } from "./kinds"
import type { BuddyObjectViewResponse } from "./view-data"

type ObjectBenchTarget = {
  type: "object"
  ref: BuddyObjectRef
  viewID: string
}

type WorkspaceFileBenchTarget = {
  type: "workspace-file"
  path: string
  viewer: "markdown" | "file"
}

type ManagedBenchTarget = ObjectBenchTarget | WorkspaceFileBenchTarget

type ResolveObjectViewToBenchTargetInput = {
  directory: string
  ref: BuddyObjectRef
  viewID: string
  sessionID?: string
}

type ReadObjectViewInput = {
  directory: string
  ref: BuddyObjectRef
  viewID: string
  revisionID?: string
  itemID?: string
}

type ResolveObjectViewToBenchTargetResult =
  | {
      status: "ready"
      target: ManagedBenchTarget
    }
  | {
      status: "blocked" | "unavailable" | "error"
      reason: string
      message: string
    }

type BuddyObjectKindDefinition<Summary extends BuddyObjectSummary> = {
  kind: BuddyObjectKind
  manifestSchema: z.ZodType<BuddyObjectManifest & { summary: Summary }>
  readManifest(input: {
    directory: string
    ref: BuddyObjectRef
  }): Promise<BuddyObjectManifest & { summary: Summary }>
  readView(input: ReadObjectViewInput): Promise<BuddyObjectViewResponse>
  resolveBenchView(
    input: ResolveObjectViewToBenchTargetInput,
  ): Promise<ResolveObjectViewToBenchTargetResult>
  readContext?(input: { directory: string; ref: BuddyObjectRef; viewID: string }): Promise<string>
  delete?(input: { directory: string; ref: BuddyObjectRef }): Promise<void>
}

const objectKindDefinitions = new Map<
  BuddyObjectKind,
  BuddyObjectKindDefinition<BuddyObjectSummary>
>()

function registerBuddyObjectKind(definition: BuddyObjectKindDefinition<BuddyObjectSummary>): void {
  objectKindDefinitions.set(definition.kind, definition)
}

function getBuddyObjectKindDefinition(
  kind: BuddyObjectKind,
): BuddyObjectKindDefinition<BuddyObjectSummary> | undefined {
  return objectKindDefinitions.get(kind)
}

function requireBuddyObjectKindDefinition(
  kind: BuddyObjectKind,
): BuddyObjectKindDefinition<BuddyObjectSummary> {
  const definition = getBuddyObjectKindDefinition(kind)
  if (!definition) {
    throw new Error(`Buddy object kind '${kind}' is not registered.`)
  }
  return definition
}

export { getBuddyObjectKindDefinition, registerBuddyObjectKind, requireBuddyObjectKindDefinition }
export type {
  BuddyObjectKindDefinition,
  ManagedBenchTarget,
  ObjectBenchTarget,
  ReadObjectViewInput,
  ResolveObjectViewToBenchTargetInput,
  ResolveObjectViewToBenchTargetResult,
  WorkspaceFileBenchTarget,
}
