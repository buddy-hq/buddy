import { getPlatform } from "@/context/platform"
import { loadOpenProjects } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { DirectoryChatState } from "@/state/chat-types"
import type { ProviderCatalogState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"
import { OPENAI_PROVIDER_ID } from "./provider-ids"

export type DesktopOnboardingState = {
  platform: "web" | "desktop"
  setupCompleted: boolean
  personalizationStepPending: boolean
  openProjects: string[]
  activeDirectory?: string
  pendingActiveDirectory?: string
  lastSessionByDirectory: Record<string, string>
  directories: Record<string, DirectoryChatState>
}

function hasDirectoryValue(value?: string) {
  return Boolean(value && value !== "/")
}

export function hasExistingChatContext(input: DesktopOnboardingState) {
  return input.openProjects.length > 0 || hasDirectoryValue(input.activeDirectory)
}

export function shouldShowDesktopOnboarding(input: DesktopOnboardingState) {
  if (input.platform !== "desktop") {
    return false
  }

  if (input.personalizationStepPending) {
    return true
  }

  return !hasExistingChatContext(input)
}

export function resolveDesktopEntryPath(input: DesktopOnboardingState) {
  return shouldShowDesktopOnboarding(input) ? "/onboarding" : "/chat"
}

export function hasConnectedOpenAiProvider(input: ProviderCatalogState) {
  return input.providers.some(
    (provider) => provider.id === OPENAI_PROVIDER_ID && provider.connected,
  )
}

export function resolveDesktopOnboardingAutoContinueDirectory(input: {
  connectedOpenAiProvider: boolean
  openProjects: string[]
  activeDirectory?: string
}) {
  if (!input.connectedOpenAiProvider || input.openProjects.length === 0) {
    return undefined
  }

  const activeDirectory = input.activeDirectory
  if (
    typeof activeDirectory === "string" &&
    hasDirectoryValue(activeDirectory) &&
    input.openProjects.includes(activeDirectory)
  ) {
    return activeDirectory
  }

  return input.openProjects[0]
}

export async function resolveDesktopEntryPathWithSnapshots(input: {
  state: DesktopOnboardingState
  loadOpenProjectsSnapshot: () => Promise<string[]>
}) {
  if (!shouldShowDesktopOnboarding(input.state)) {
    return "/chat"
  }

  if (input.state.personalizationStepPending) {
    return "/onboarding"
  }

  try {
    if ((await input.loadOpenProjectsSnapshot()).length > 0) {
      return "/chat"
    }
    if (useChatStore.getState().openProjectsRecovery?.needed) {
      return "/chat"
    }
  } catch {
    return "/onboarding"
  }

  return "/onboarding"
}

export function readDesktopOnboardingState(): DesktopOnboardingState {
  const chatState = useChatStore.getState()
  const onboardingState = useOnboardingStore.getState()

  return {
    platform: getPlatform().platform,
    setupCompleted: onboardingState.setupCompleted,
    personalizationStepPending: onboardingState.shouldShowPersonalizationStep(),
    openProjects: chatState.openProjects,
    activeDirectory: chatState.activeDirectory,
    pendingActiveDirectory: chatState.pendingActiveDirectory,
    lastSessionByDirectory: chatState.lastSessionByDirectory,
    directories: chatState.directories,
  }
}

export async function shouldShowCurrentDesktopOnboarding() {
  const path = await resolveCurrentDesktopEntryPath()
  return path === "/onboarding"
}

export async function resolveCurrentDesktopEntryPath() {
  return resolveDesktopEntryPathWithSnapshots({
    state: readDesktopOnboardingState(),
    loadOpenProjectsSnapshot: loadOpenProjects,
  })
}
