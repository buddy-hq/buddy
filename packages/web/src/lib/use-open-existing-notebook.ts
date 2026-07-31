import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { setOpenProjectsQueryData } from "@/state/bootstrap-query"
import { openProject } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import {
  connectObsidianVault,
  loadObsidianVaultProfile,
  obsidianVaultQueryKeys,
  type ObsidianVaultProfile,
} from "@/state/obsidian-vault-query"

type ObsidianConnectionPrompt = {
  directory: string
  busy: boolean
  error?: string
  onConnect: () => void
  onContinueAsNotebook: () => void
}

type OpenExistingNotebookFlowOptions = {
  onNotebookReady: (directory: string) => Promise<void>
  onDeferredError: (error: unknown) => void
}

type OpenExistingNotebookFlow = {
  openExistingNotebook: (directory: string) => Promise<void>
  obsidianConnectionPrompt?: ObsidianConnectionPrompt
}

export function needsObsidianConnectionPrompt(profile: ObsidianVaultProfile): boolean {
  return profile.detected && !profile.connected
}

export function useOpenExistingNotebook(
  options: OpenExistingNotebookFlowOptions,
): OpenExistingNotebookFlow {
  const queryClient = useQueryClient()
  const [pendingDirectory, setPendingDirectory] = useState<string>()
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string>()

  async function openExistingNotebook(directory: string): Promise<void> {
    setConnectionError(undefined)
    const nextDirectory = await openProject(directory)
    setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
    const profile = await loadObsidianVaultProfile(nextDirectory)
    queryClient.setQueryData(obsidianVaultQueryKeys.profile(nextDirectory), profile)

    if (needsObsidianConnectionPrompt(profile)) {
      setPendingDirectory(nextDirectory)
      return
    }

    await options.onNotebookReady(nextDirectory)
  }

  async function continueAsNotebook(): Promise<void> {
    if (!pendingDirectory || connecting) return
    const directory = pendingDirectory
    setPendingDirectory(undefined)
    setConnectionError(undefined)
    try {
      await options.onNotebookReady(directory)
    } catch (error) {
      options.onDeferredError(error)
    }
  }

  async function connectVault(): Promise<void> {
    if (!pendingDirectory || connecting) return
    const directory = pendingDirectory
    setConnecting(true)
    setConnectionError(undefined)

    let profile: ObsidianVaultProfile
    try {
      profile = await connectObsidianVault(directory)
      if (!profile.connected) {
        throw new Error(language.t("obsidian.connectionDialog.confirmationFailed"))
      }
      queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), profile)
    } catch (error) {
      setConnectionError(stringifyError(error))
      options.onDeferredError(error)
      setConnecting(false)
      return
    }

    setPendingDirectory(undefined)
    setConnecting(false)
    try {
      await options.onNotebookReady(directory)
    } catch (error) {
      options.onDeferredError(error)
    }
  }

  const obsidianConnectionPrompt: ObsidianConnectionPrompt | undefined = pendingDirectory
    ? {
        directory: pendingDirectory,
        busy: connecting,
        ...(connectionError ? { error: connectionError } : {}),
        onConnect: () => {
          void connectVault()
        },
        onContinueAsNotebook: () => {
          void continueAsNotebook()
        },
      }
    : undefined

  return {
    openExistingNotebook,
    obsidianConnectionPrompt,
  }
}

export type { ObsidianConnectionPrompt }
