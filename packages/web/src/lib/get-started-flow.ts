import {
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForDevtoolsMode,
  resolveGetStartedLearnerModelTier,
  type GetStartedChat,
  type GetStartedFlowDevtoolsMode,
} from "./get-started-chats"
import type { PrimaryUse } from "@/state/project-config-readers"

export const GET_STARTED_FLOW_STATUS = {
  loading: "loading",
  dismissed: "dismissed",
  overriddenHidden: "overridden_hidden",
  /** @deprecated Directory no longer gates the flow; board Inbox scope is UI-only. */
  outOfScope: "out_of_scope",
  active: "active",
} as const

export type GetStartedFlowStatus =
  (typeof GET_STARTED_FLOW_STATUS)[keyof typeof GET_STARTED_FLOW_STATUS]

export type GetStartedFlowSnapshot = {
  status: GetStartedFlowStatus
  /** True when the sidebar (and other non-Inbox-scoped surfaces) should show Get Started. */
  isActive: boolean
  enabled: boolean
  chats: readonly GetStartedChat[]
}

export type GetStartedFlowInput = {
  enabled: boolean
  persistedStateHydrated: boolean
  personalizationResolved: boolean
  primaryUse: PrimaryUse | undefined
  /**
   * Still accepted for call-site compatibility. Directory does not gate
   * `isActive` — the empty board decides Inbox-only presentation itself.
   */
  currentDirectory: string
  /** Active composer model; anonymous OpenCode models receive the bounded prompt set. */
  selectedModel?: string
  devtoolsMode: GetStartedFlowDevtoolsMode | undefined
}

type GetStartedDeveloperAudience = Exclude<
  GetStartedFlowDevtoolsMode,
  typeof GET_STARTED_FLOW_DEVTOOLS_MODE.appState | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.hidden
>

function isDeveloperAudienceOverride(
  devtoolsMode: GetStartedFlowDevtoolsMode | undefined,
): devtoolsMode is GetStartedDeveloperAudience {
  return (
    devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.student ||
    devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.teacher
  )
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

  const learnerModelTier = resolveGetStartedLearnerModelTier(input.selectedModel)
  const chats = isDeveloperAudienceOverride(input.devtoolsMode)
    ? getStartedChatsForDevtoolsMode(input.devtoolsMode, learnerModelTier)
    : getStartedChatsForPrimaryUse(input.primaryUse, learnerModelTier)
  if (!hasDeveloperAudienceOverride && !input.enabled) {
    return createSnapshot(GET_STARTED_FLOW_STATUS.dismissed, input.enabled, chats)
  }

  // Active in every notebook for the sidebar. Empty-board cards stay Inbox-only
  // via ChatEmptyStateBoard (`isInbox && isActive`).
  return createSnapshot(GET_STARTED_FLOW_STATUS.active, input.enabled, chats)
}
