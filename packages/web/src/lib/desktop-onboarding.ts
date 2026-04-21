import { getPlatform } from "@/context/platform"
import { loadOpenProjects, loadProviderCatalogSnapshot } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { DirectoryChatState } from "@/state/chat-types"
import type { ProviderCatalogState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"
import { OPENAI_PROVIDER_ID } from "./provider-ids"

export type DesktopOnboardingState = {
  platform: "web" | "desktop"
  completed: boolean
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
  return (
    input.openProjects.length > 0 ||
    hasDirectoryValue(input.activeDirectory) ||
    hasDirectoryValue(input.pendingActiveDirectory) ||
    Object.keys(input.lastSessionByDirectory).length > 0 ||
    Object.keys(input.directories).length > 0
  )
}

export function shouldShowDesktopOnboarding(input: DesktopOnboardingState) {
  return input.platform === "desktop" && !input.completed && !hasExistingChatContext(input)
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
  loadProviderCatalogSnapshot: () => Promise<ProviderCatalogState>
  markOnboardingCompleted: () => void
}) {
  if (!shouldShowDesktopOnboarding(input.state)) {
    return "/chat"
  }

  const [openProjectsResult, providersResult] = await Promise.allSettled([
    input.loadOpenProjectsSnapshot(),
    input.loadProviderCatalogSnapshot(),
  ])

  if (openProjectsResult.status === "fulfilled" && openProjectsResult.value.length > 0) {
    return "/chat"
  }

  if (providersResult.status === "fulfilled" && hasConnectedOpenAiProvider(providersResult.value)) {
    input.markOnboardingCompleted()
    return "/chat"
  }

  return "/onboarding"
}

export function readDesktopOnboardingState(): DesktopOnboardingState {
  const chatState = useChatStore.getState()
  const onboardingState = useOnboardingStore.getState()

  return {
    platform: getPlatform().platform,
    completed: onboardingState.completed,
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
    loadProviderCatalogSnapshot,
    markOnboardingCompleted: () => useOnboardingStore.getState().markCompleted(),
  })
}
