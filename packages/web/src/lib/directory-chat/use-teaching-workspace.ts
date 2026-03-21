import { useEffect, useRef } from "react"
import { useTeachingRuntime } from "@/state/teaching-runtime"
import {
  activateTeachingWorkspaceFile,
  checkpointTeachingWorkspace,
  createTeachingWorkspaceFile,
  ensureTeachingWorkspace,
  loadTeachingWorkspace,
  probeTeachingWorkspace,
  restoreTeachingWorkspace,
  saveTeachingWorkspace,
  stringifyError,
  TeachingConflictError,
} from "@/state/teaching-actions"
import {
  intentFromSelection,
  teachingLanguageLabel,
  type TeachingIntent,
  type TeachingLanguage,
} from "@/state/teaching-runtime"
import { sendPrompt } from "@/state/chat-actions"
import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"

type UseTeachingWorkspaceProps = {
  decodedDirectory: string
  sessionID: string | undefined
  sessionKey: string
  isInteractiveMode: boolean
  isBusy: boolean
  messages: unknown[]
  selectedPersonaSupportsEditor: boolean
  selectedPersona: string
  storedIntent: TeachingIntent
  preferredLanguage: TeachingLanguage
  effectiveModelSelection: { providerID: string; modelID: string } | undefined
  setDirectoryError: (directory: string, error: string) => void
  setRightSidebarTab: (tab: ChatRightSidebarTab) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarWidth: (width: number) => void
  rightSidebarWidth: number
  setIsStartingInteractiveLesson: (value: boolean) => void
}

const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360

export function useTeachingWorkspace(props: UseTeachingWorkspaceProps) {
  const { decodedDirectory, sessionID, sessionKey, isInteractiveMode, isBusy } = props

  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const teachingSessionInitializedRef = useRef(new Set<string>())
  const workspaceProbeBySessionRef = useRef(
    new Map<string, Promise<Awaited<ReturnType<typeof loadTeachingWorkspace>> | undefined>>(),
  )

  const teachingWorkspace = sessionKey
    ? useTeachingRuntime.getState().workspaceBySession[sessionKey]
    : undefined

  // ── Probe for workspace when session loads ──────────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !sessionID || !sessionKey || teachingWorkspace) return
    if (workspaceProbeBySessionRef.current.has(sessionKey)) return

    let cancelled = false
    const probe = probeTeachingWorkspace({
      directory: decodedDirectory,
      sessionID,
    })
      .then((workspace) => {
        if (!workspace || cancelled) return undefined
        const teaching = useTeachingRuntime.getState()
        teaching.setWorkspace(sessionKey, workspace)
        teaching.setSaveError(sessionKey, undefined)
        return workspace
      })
      .catch(() => undefined)
      .finally(() => {
        workspaceProbeBySessionRef.current.delete(sessionKey)
      })

    workspaceProbeBySessionRef.current.set(sessionKey, probe)
    return () => {
      cancelled = true
    }
  }, [decodedDirectory, isBusy, props.messages.length, sessionID, sessionKey, teachingWorkspace])

  // ── Open editor sidebar on first workspace load ─────────────────────────────
  useEffect(() => {
    if (
      !decodedDirectory ||
      !sessionID ||
      !sessionKey ||
      !teachingWorkspace ||
      !props.selectedPersonaSupportsEditor
    )
      return
    if (teachingSessionInitializedRef.current.has(sessionKey)) return

    teachingSessionInitializedRef.current.add(sessionKey)
    props.setRightSidebarTab("editor")
    props.setRightSidebarOpen(true)
    if (props.rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      props.setRightSidebarWidth(640)
    }
  }, [
    decodedDirectory,
    sessionID,
    sessionKey,
    props.selectedPersonaSupportsEditor,
    teachingWorkspace,
  ])

  // ── Reload workspace after agent turn completes ─────────────────────────────
  const previousBusyRef = useRef(false)
  useEffect(() => {
    if (
      !decodedDirectory ||
      !sessionID ||
      !isInteractiveMode ||
      !sessionKey ||
      !teachingWorkspace
    ) {
      previousBusyRef.current = isBusy
      return
    }

    if (previousBusyRef.current && !isBusy) {
      void loadTeachingWorkspace({ directory: decodedDirectory, sessionID })
        .then((workspace) => {
          useTeachingRuntime.getState().applyRemoteSnapshot(sessionKey, workspace)
        })
        .catch((workspaceError) => {
          useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(workspaceError))
        })
    }

    previousBusyRef.current = isBusy
  }, [decodedDirectory, isBusy, isInteractiveMode, sessionID, sessionKey, teachingWorkspace])

  // ── Poll workspace while agent is mid-run ───────────────────────────────────
  useEffect(() => {
    if (
      !decodedDirectory ||
      !sessionID ||
      !isInteractiveMode ||
      !sessionKey ||
      !teachingWorkspace ||
      !isBusy
    )
      return

    const activeDirectory = decodedDirectory
    const activeSessionID = sessionID
    let cancelled = false
    let refreshInFlight = false

    async function refreshWorkspace() {
      if (cancelled || refreshInFlight || saveInFlightRef.current) return
      refreshInFlight = true
      try {
        const workspace = await loadTeachingWorkspace({
          directory: activeDirectory,
          sessionID: activeSessionID,
        })
        if (!cancelled) {
          useTeachingRuntime.getState().applyRemoteSnapshot(sessionKey, workspace)
        }
      } catch {
        // Ignore transient refresh failures while the agent is still mid-step.
      } finally {
        refreshInFlight = false
      }
    }

    void refreshWorkspace()
    const interval = window.setInterval(() => void refreshWorkspace(), 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [decodedDirectory, isBusy, isInteractiveMode, sessionID, sessionKey, teachingWorkspace])

  // ── Auto-flush on code change (debounced 500ms) ─────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey || !teachingWorkspace)
      return
    if (teachingWorkspace.conflict) return
    if (teachingWorkspace.code === teachingWorkspace.savedCode) return

    const timeout = window.setTimeout(() => {
      void flushTeachingWorkspace()
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [
    decodedDirectory,
    isInteractiveMode,
    sessionID,
    sessionKey,
    teachingWorkspace?.code,
    teachingWorkspace?.savedCode,
    teachingWorkspace?.conflict,
  ])

  // ── Core workspace operations ───────────────────────────────────────────────

  async function flushTeachingWorkspace(input?: {
    forceOverwrite?: boolean
    language?: TeachingLanguage
  }) {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey) return true

    if (saveInFlightRef.current) {
      const settled = await saveInFlightRef.current
      if (!settled) return false
    }

    const latest = useTeachingRuntime.getState().workspaceBySession[sessionKey]
    if (!latest) {
      useTeachingRuntime.getState().setSaveError(sessionKey, "Teaching workspace is still loading")
      return false
    }

    if (latest.conflict && !input?.forceOverwrite) return false

    const nextLanguage = input?.language ?? latest.language
    const hasChanges =
      latest.code !== latest.savedCode ||
      nextLanguage !== latest.language ||
      !!input?.forceOverwrite
    if (!hasChanges) return true

    const expectedRevision =
      input?.forceOverwrite && latest.conflict ? latest.conflict.revision : latest.revision
    const requestCode = latest.code

    const task = (async () => {
      useTeachingRuntime.getState().setPendingSave(sessionKey, true)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)

      try {
        const saved = await saveTeachingWorkspace({
          directory: decodedDirectory,
          sessionID,
          code: requestCode,
          expectedRevision,
          relativePath: latest.activeRelativePath,
          language: nextLanguage,
        })
        useTeachingRuntime
          .getState()
          .applySaveSuccess(sessionKey, { requestCode, workspace: saved })
        return true
      } catch (saveError) {
        if (saveError instanceof TeachingConflictError) {
          useTeachingRuntime.getState().setConflict(sessionKey, {
            code: saveError.payload.code,
            revision: saveError.payload.revision,
            lessonFilePath: saveError.payload.lessonFilePath,
          })
          return false
        }
        useTeachingRuntime.getState().setPendingSave(sessionKey, false)
        useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(saveError))
        return false
      }
    })()

    saveInFlightRef.current = task
    try {
      return await task
    } finally {
      if (saveInFlightRef.current === task) {
        saveInFlightRef.current = null
      }
    }
  }

  async function onTeachingSelectFile(relativePath: string) {
    if (!decodedDirectory || !sessionID || !sessionKey) return
    const currentWorkspace = useTeachingRuntime.getState().workspaceBySession[sessionKey]
    if (currentWorkspace?.activeRelativePath === relativePath) return

    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      const workspace = await activateTeachingWorkspaceFile({
        directory: decodedDirectory,
        sessionID,
        relativePath,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (fileError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(fileError))
    }
  }

  async function onCreateTeachingFileConfirm(relativePath: string) {
    if (!decodedDirectory || !sessionID || !sessionKey) return

    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      const workspace = await createTeachingWorkspaceFile({
        directory: decodedDirectory,
        sessionID,
        relativePath,
        activate: true,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
      props.setRightSidebarTab("editor")
      props.setRightSidebarOpen(true)
    } catch (fileError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(fileError))
    }
  }

  function onTeachingCodeChange(code: string) {
    if (!sessionKey) return
    useTeachingRuntime.getState().updateWorkspaceCode(sessionKey, code)
  }

  function onTeachingSelectionChange(selection?: {
    selectionStartLine?: number
    selectionStartColumn?: number
    selectionEndLine?: number
    selectionEndColumn?: number
  }) {
    if (!sessionKey) return
    useTeachingRuntime.getState().setSelection(sessionKey, selection)
  }

  function onTeachingLanguageChange(language: TeachingLanguage) {
    void flushTeachingWorkspace({ language })
  }

  function onTeachingPreferredLanguageChange(language: TeachingLanguage) {
    if (!sessionKey) return
    const teaching = useTeachingRuntime.getState()
    teaching.setPreferredLanguage(sessionKey, language)
  }

  async function onTeachingCheckpoint() {
    if (!decodedDirectory || !sessionID || !sessionKey) return
    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      await checkpointTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
      })
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (checkpointError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(checkpointError))
    }
  }

  async function onTeachingRestoreAccepted() {
    if (!decodedDirectory || !sessionID || !sessionKey) return

    try {
      const workspace = await restoreTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (restoreError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(restoreError))
    }
  }

  function onLoadExternalChanges() {
    if (!sessionKey) return
    useTeachingRuntime.getState().loadConflictVersion(sessionKey)
  }

  function onForceOverwrite() {
    void flushTeachingWorkspace({ forceOverwrite: true })
  }

  async function onStartInteractiveLesson(input: {
    sessionID: string
    sessionKey: string
    preferredLanguage: TeachingLanguage
    selectedPersona: string
    storedIntent: TeachingIntent
    effectiveModelSelection: { providerID: string; modelID: string } | undefined
    isBusy: boolean
    isStartingInteractiveLesson: boolean
    selectedPersonaSupportsEditor: boolean
    rightSidebarWidth: number
    setIsStartingInteractiveLesson: (value: boolean) => void
  }) {
    const { isBusy, isStartingInteractiveLesson, selectedPersonaSupportsEditor } = input

    if (
      !decodedDirectory ||
      !sessionID ||
      !sessionKey ||
      !selectedPersonaSupportsEditor ||
      isBusy ||
      isStartingInteractiveLesson
    )
      return

    input.setIsStartingInteractiveLesson(true)
    props.setRightSidebarTab("editor")
    if (input.rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      props.setRightSidebarWidth(640)
    }
    props.setRightSidebarOpen(true)

    try {
      const workspace = await ensureTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
        language: input.preferredLanguage,
        persona: input.selectedPersona,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)

      await sendPrompt(
        decodedDirectory,
        `I started an interactive lesson in ${teachingLanguageLabel(input.preferredLanguage)} mode. Interactive workspace tools are now available. Please use the editor workspace to set up the next hands-on step and guide me there.`,
        {
          persona: input.selectedPersona,
          intent: intentFromSelection(input.storedIntent),
          model: input.effectiveModelSelection,
          teaching: {
            active: true,
            sessionID: workspace.sessionID,
            lessonFilePath: workspace.lessonFilePath,
            checkpointFilePath: workspace.checkpointFilePath,
            language: workspace.language,
            revision: workspace.revision,
          },
        },
      )
    } catch (interactiveError) {
      const message = stringifyError(interactiveError)
      props.setDirectoryError(decodedDirectory, message)
      useTeachingRuntime.getState().setSaveError(sessionKey, message)
    } finally {
      input.setIsStartingInteractiveLesson(false)
    }
  }

  return {
    flushTeachingWorkspace,
    workspaceProbeBySessionRef,
    onTeachingSelectFile,
    onCreateTeachingFileConfirm,
    onTeachingCodeChange,
    onTeachingSelectionChange,
    onTeachingLanguageChange,
    onTeachingPreferredLanguageChange,
    onTeachingCheckpoint,
    onTeachingRestoreAccepted,
    onLoadExternalChanges,
    onForceOverwrite,
    onStartInteractiveLesson,
  }
}
