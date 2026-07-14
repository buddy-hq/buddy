import {
  GET_STARTED_CHAT_TEST_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForTestMode,
  type GetStartedChat,
  type GetStartedChatTestMode,
} from "./get-started-chats"
import type { PrimaryUse } from "@/state/project-config-readers"

const GET_STARTED_FLOW_DIRECTORY_NAME = "inbox" as const

export const GET_STARTED_FLOW_STATUS = {
  loading: "loading",
  unavailable: "unavailable",
  dismissed: "dismissed",
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
  testMode: GetStartedChatTestMode | undefined
}

type GetStartedDeveloperAudience = Exclude<
  GetStartedChatTestMode,
  typeof GET_STARTED_CHAT_TEST_MODE.hidden
>

function isDeveloperAudienceOverride(
  testMode: GetStartedChatTestMode | undefined,
): testMode is GetStartedDeveloperAudience {
  return (
    testMode === GET_STARTED_CHAT_TEST_MODE.student ||
    testMode === GET_STARTED_CHAT_TEST_MODE.teacher
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
  const hasDeveloperAudienceOverride = isDeveloperAudienceOverride(input.testMode)
  if (
    !input.persistedStateHydrated ||
    (!hasDeveloperAudienceOverride && !input.personalizationResolved)
  ) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.loading, input.enabled, [])
  }

  const chats = isDeveloperAudienceOverride(input.testMode)
    ? getStartedChatsForTestMode(input.testMode)
    : getStartedChatsForPrimaryUse(input.primaryUse)
  if (!input.enabled) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.dismissed, input.enabled, chats)
  }
  if (chats.length === 0) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.unavailable, input.enabled, chats)
  }
  if (!isInboxDirectory(input.currentDirectory)) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.outOfScope, input.enabled, chats)
  }

  return createSnapshot(GET_STARTED_FLOW_STATUS.active, input.enabled, chats)
}
