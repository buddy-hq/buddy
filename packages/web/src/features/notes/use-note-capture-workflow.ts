import { useCallback } from "react"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { startActiveChatSession } from "@/lib/active-chat-transition-coordinator"
import { BENCH_MODE_REQUEST_POLICY, type OpenBench } from "@/lib/bench-navigation"
import type { DirectoryWorkspaceController } from "@/lib/directory-workspace-controller"
import type { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import { createNotesBenchTarget } from "@/lib/bench-targets"
import type { PromptStore } from "@/state/prompt-store"
import { appQueryClient } from "@/state/query-client"
import {
  markOneTimeNoticeSeen,
  ONE_TIME_NOTICE_NOTES_LOCATION_INTRO,
  shouldShowOneTimeNotice,
} from "@/state/one-time-notices"
import { WORKSPACE_DRAWER_NOTES } from "@/state/directory-workspace-store"
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
  workspaceController: DirectoryWorkspaceController
  workspaceLifecycle: DirectoryWorkspaceLifecycleService
  openBench: OpenBench
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

export function useNoteCaptureWorkflow(input: NoteCaptureWorkflowInput) {
  const {
    directory,
    sessionID,
    setPromptDraft,
    workspaceController,
    workspaceLifecycle,
    openBench,
  } = input
  const refreshAfterCapture = useCallback(
    (note: NoteSummary) => {
      void invalidateNotesQueries(appQueryClient)
      void workspaceLifecycle.synchronizeCurrentWorkspaceFile({ reason: "client-action" })
      signalNoteCapture({ directory, relativePath: note.relativePath })
    },
    [directory, workspaceLifecycle],
  )

  const showCreatedNoteToast = useCallback(
    (note: NoteSummary) => {
      toast.success(language.t("notes.toast.saved"), {
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
      if (shouldShowOneTimeNotice(ONE_TIME_NOTICE_NOTES_LOCATION_INTRO)) {
        markOneTimeNoticeSeen(ONE_TIME_NOTICE_NOTES_LOCATION_INTRO)
        void workspaceController.execute({
          type: "open-drawer",
          drawer: WORKSPACE_DRAWER_NOTES,
        })
        return
      }
      if (capture.created) showCreatedNoteToast(capture.note)
    },
    [workspaceController, refreshAfterCapture, showCreatedNoteToast],
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
