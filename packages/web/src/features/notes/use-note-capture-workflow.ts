import { useCallback } from "react"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { startActiveChatSession } from "@/lib/active-chat-transition-coordinator"
import { BENCH_MODE_REQUEST_POLICY, type OpenBench } from "@/lib/bench-navigation"
import type { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import {
  BENCH_WORKSPACE_ROOT_NOTES,
  createNotesBenchTarget,
  type BenchTabTarget,
} from "@/lib/bench-targets"
import type { PromptStore } from "@/state/prompt-store"
import { appQueryClient } from "@/state/query-client"
import {
  annotateChatMessage,
  captureComposerNote,
  type NoteCaptureImage,
  type NoteSummary,
  type SessionNoteCapture,
} from "./api"
import { signalNoteCapture } from "./capture-activity"
import { invalidateNotesQueries } from "./queries"
import { quoteMessageIntoPromptDraft } from "./quote-message-into-prompt-draft"

type NoteCaptureWorkflowInput = {
  directory: string
  sessionID?: string
  setPromptDraft: PromptStore["replaceDraft"]
  workspaceLifecycle: DirectoryWorkspaceLifecycleService
  openBench: OpenBench
  readVisibleBenchTarget: () => BenchTabTarget | undefined
}

type SaveComposerNoteInput = {
  text: string
  messageID?: string
  images?: NoteCaptureImage[]
}

type QuoteMessageInput = {
  sessionID: string
  messageID: string
  text: string
}

function isShowingNote(target: BenchTabTarget | undefined, note: NoteSummary) {
  return (
    target?.type === "workspace-file" &&
    target.root === BENCH_WORKSPACE_ROOT_NOTES &&
    ((note.id !== undefined && target.id === note.id) || target.path === note.relativePath)
  )
}

export function useNoteCaptureWorkflow(input: NoteCaptureWorkflowInput) {
  const {
    directory,
    sessionID,
    setPromptDraft,
    workspaceLifecycle,
    openBench,
    readVisibleBenchTarget,
  } = input
  const refreshAfterCapture = useCallback(
    (note: NoteSummary) => {
      void invalidateNotesQueries(appQueryClient)
      void workspaceLifecycle.synchronizeCurrentWorkspaceFile({ reason: "client-action" })
      signalNoteCapture({ directory, relativePath: note.relativePath, id: note.id })
    },
    [directory, workspaceLifecycle],
  )

  const showSavedNoteToast = useCallback(
    (note: NoteSummary) => {
      toast.success(language.t("notes.toast.savedTo", { name: note.title }), {
        action: {
          label: language.t("notes.action.open"),
          onClick: () => {
            void openBench({
              directory,
              target: createNotesBenchTarget(note),
              mode: BENCH_MODE_REQUEST_POLICY,
              autoOpen: null,
            })
          },
        },
      })
    },
    [directory, openBench],
  )

  const handleCaptureSuccess = useCallback(
    (capture: SessionNoteCapture) => {
      refreshAfterCapture(capture.note)
      if (!isShowingNote(readVisibleBenchTarget(), capture.note)) {
        showSavedNoteToast(capture.note)
      }
    },
    [readVisibleBenchTarget, refreshAfterCapture, showSavedNoteToast],
  )

  const saveComposerNote = useCallback(
    async ({ text, messageID, images }: SaveComposerNoteInput) => {
      let targetSessionID = sessionID
      if (!targetSessionID) {
        const result = await startActiveChatSession({ directory })
        if (result.outcome === "failed") throw result.error
        if (result.outcome !== "committed" && result.outcome !== "noop") {
          throw new Error(language.t("notes.session.prepareFailed"))
        }
        targetSessionID = result.value.id
      }

      const capture = messageID
        ? await annotateChatMessage({
            directory,
            sessionID: targetSessionID,
            messageID,
            text,
            images,
          })
        : await captureComposerNote({
            directory,
            sessionID: targetSessionID,
            text,
            images,
          })
      handleCaptureSuccess(capture)
      return { sessionID: targetSessionID }
    },
    [directory, handleCaptureSuccess, sessionID],
  )

  const quoteMessage = useCallback(
    (message: QuoteMessageInput) => {
      quoteMessageIntoPromptDraft({
        directory,
        sessionID: message.sessionID,
        messageID: message.messageID,
        text: message.text,
        replaceDraft: setPromptDraft,
      })
    },
    [directory, setPromptDraft],
  )

  return { quoteMessage, saveComposerNote }
}
