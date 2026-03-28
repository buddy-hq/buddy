import { getPlatform } from "@/context/platform"
import { useChatStore } from "@/state/chat-store"
import type { DirectoryChatState } from "@/state/chat-types"
import { useOnboardingStore } from "@/state/onboarding-store"

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

export function shouldShowCurrentDesktopOnboarding() {
  return shouldShowDesktopOnboarding(readDesktopOnboardingState())
}

export function resolveCurrentDesktopEntryPath() {
  return resolveDesktopEntryPath(readDesktopOnboardingState())
}
