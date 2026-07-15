import {
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForDevtoolsMode,
  type GetStartedChat,
  type GetStartedFlowDevtoolsMode,
} from "./get-started-chats"
import type { PrimaryUse } from "@/state/project-config-readers"

const GET_STARTED_FLOW_DIRECTORY_NAME = "inbox" as const

export const GET_STARTED_FLOW_STATUS = {
  loading: "loading",
  dismissed: "dismissed",
  overriddenHidden: "overridden_hidden",
  outOfScope: "out_of_scope",
  active: "active",
} as const

export type GetStartedFlowStatus =
  (typeof GET_STARTED_FLOW_STATUS)[keyof typeof GET_STARTED_FLOW_STATUS]

export type GetStartedFlowSnapshot = {
  status: GetStartedFlowStatus
  isActive: boolean
  enabled: boolean
  chats: readonly GetStartedChat[]
}

export type GetStartedFlowInput = {
  enabled: boolean
  persistedStateHydrated: boolean
  personalizationResolved: boolean
  primaryUse: PrimaryUse | undefined
  currentDirectory: string
  devtoolsMode: GetStartedFlowDevtoolsMode | undefined
}

type GetStartedDeveloperAudience = Exclude<
  GetStartedFlowDevtoolsMode,
  | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.appState
  | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.hidden
>

function isDeveloperAudienceOverride(
  devtoolsMode: GetStartedFlowDevtoolsMode | undefined,
): devtoolsMode is GetStartedDeveloperAudience {
  return (
    devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.student ||
    devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.teacher
  )
}

function isInboxDirectory(directory: string): boolean {
  const cleaned = directory.replace(/[\\/]+$/, "")
  const parts = cleaned.split(/[\\/]/).filter(Boolean)
  return parts.at(-1)?.toLowerCase() === GET_STARTED_FLOW_DIRECTORY_NAME
}

function createSnapshot(
  status: GetStartedFlowStatus,
  enabled: boolean,
  chats: readonly GetStartedChat[],
): GetStartedFlowSnapshot {
  return {
    status,
    isActive: status === GET_STARTED_FLOW_STATUS.active,
    enabled,
    chats,
  }
}

export function resolveGetStartedFlow(input: GetStartedFlowInput): GetStartedFlowSnapshot {
  if (input.devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.hidden) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.overriddenHidden, input.enabled, [])
  }

  const hasDeveloperAudienceOverride = isDeveloperAudienceOverride(input.devtoolsMode)
  if (
    !hasDeveloperAudienceOverride &&
    (!input.persistedStateHydrated || !input.personalizationResolved)
  ) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.loading, input.enabled, [])
  }

  const chats = isDeveloperAudienceOverride(input.devtoolsMode)
    ? getStartedChatsForDevtoolsMode(input.devtoolsMode)
    : getStartedChatsForPrimaryUse(input.primaryUse)
  if (!hasDeveloperAudienceOverride && !input.enabled) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.dismissed, input.enabled, chats)
  }
  if (!isInboxDirectory(input.currentDirectory)) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.outOfScope, input.enabled, chats)
  }

  return createSnapshot(GET_STARTED_FLOW_STATUS.active, input.enabled, chats)
}
