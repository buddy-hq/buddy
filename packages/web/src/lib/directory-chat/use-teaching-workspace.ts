import { useCallback, useEffect, useRef } from "react"
import {
  type TeachingConflict,
  type TeachingLanguage,
  useTeachingRuntime,
} from "@/state/teaching-runtime"
import {
  loadTeachingWorkspace,
  probeTeachingWorkspace,
  saveTeachingWorkspace,
  stringifyError,
  TeachingConflictError,
} from "@/state/teaching-actions"

type UseTeachingWorkspaceProps = {
  decodedDirectory: string
  sessionID: string | undefined
  sessionKey: string
  isInteractiveMode: boolean
  isBusy: boolean
  messages: unknown[]
}

export function useTeachingWorkspace(props: UseTeachingWorkspaceProps) {
  const { decodedDirectory, sessionID, sessionKey, isInteractiveMode, isBusy, messages } = props

  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
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
  }, [decodedDirectory, isBusy, messages.length, sessionID, sessionKey, teachingWorkspace])

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

  // ── Core workspace operations ───────────────────────────────────────────────

  const flushTeachingWorkspace = useCallback(
    async (input?: { forceOverwrite?: boolean; language?: TeachingLanguage }) => {
      if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey) return true

      if (saveInFlightRef.current) {
        const settled = await saveInFlightRef.current
        if (!settled) return false
      }

      const latest = useTeachingRuntime.getState().workspaceBySession[sessionKey]
      if (!latest) {
        useTeachingRuntime
          .getState()
          .setSaveError(sessionKey, "Teaching workspace is still loading")
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
            const conflict = {
              code: saveError.payload.code,
              revision: saveError.payload.revision,
              files: saveError.payload.files,
              activeRelativePath: saveError.payload.activeRelativePath,
              lessonFilePath: saveError.payload.lessonFilePath,
              checkpointFilePath: saveError.payload.checkpointFilePath,
              language: saveError.payload.language,
              lspAvailable: saveError.payload.lspAvailable,
              diagnostics: saveError.payload.diagnostics,
            } satisfies TeachingConflict
            useTeachingRuntime.getState().setConflict(sessionKey, conflict)
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
    },
    [decodedDirectory, isInteractiveMode, sessionID, sessionKey],
  )

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
    flushTeachingWorkspace,
    isInteractiveMode,
    sessionID,
    sessionKey,
    teachingWorkspace,
    teachingWorkspace?.code,
    teachingWorkspace?.savedCode,
    teachingWorkspace?.conflict,
  ])

  return {
    flushTeachingWorkspace,
    workspaceProbeBySessionRef,
  }
}
