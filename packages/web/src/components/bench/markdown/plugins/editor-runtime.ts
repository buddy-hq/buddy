import {
  createActiveEditorSubscription$,
  markdownProcessingError$,
  markdownSourceEditorValue$,
  realmPlugin,
  setMarkdown$,
  viewMode$,
} from "@mdxeditor/editor"
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical"

export type MarkdownBenchHistoryControlsState = {
  canRedo: boolean
  canUndo: boolean
}

export type MarkdownBenchHistoryControls = MarkdownBenchHistoryControlsState & {
  redo(): void
  undo(): void
}

export const EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS: MarkdownBenchHistoryControls = {
  canRedo: false,
  canUndo: false,
  redo() {},
  undo() {},
}

type MarkdownBenchHistoryPluginParams = {
  onChange(controls: MarkdownBenchHistoryControls): void
}

type MarkdownBenchProcessingError = { error: string; source: string } | null

type MarkdownBenchErrorRecoveryPluginParams = {
  onProcessingErrorChange(message: string | undefined): void
}

export const markdownBenchHistoryControlsPlugin = realmPlugin<MarkdownBenchHistoryPluginParams>({
  init(realm, params) {
    realm.pub(createActiveEditorSubscription$, (editor) => {
      let active = true
      let canRedo = false
      let canUndo = false

      const publish = () => {
        const controls = {
          canRedo,
          canUndo,
          redo() {
            editor.dispatchCommand(REDO_COMMAND, undefined)
          },
          undo() {
            editor.dispatchCommand(UNDO_COMMAND, undefined)
          },
        }
        queueMicrotask(() => {
          if (active) params?.onChange(controls)
        })
      }

      publish()

      const unregisterCanUndo = editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          canUndo = payload
          publish()
          return false
        },
        COMMAND_PRIORITY_CRITICAL,
      )
      const unregisterCanRedo = editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          canRedo = payload
          publish()
          return false
        },
        COMMAND_PRIORITY_CRITICAL,
      )

      return () => {
        active = false
        unregisterCanUndo()
        unregisterCanRedo()
      }
    })
  },
})

export const markdownBenchErrorRecoveryPlugin = realmPlugin<MarkdownBenchErrorRecoveryPluginParams>(
  {
    postInit(realm, params) {
      let automaticallyEnteredSourceMode = false

      const handleProcessingErrorChange = (error: MarkdownBenchProcessingError) => {
        params?.onProcessingErrorChange(error?.error)
        if (!error) {
          if (!automaticallyEnteredSourceMode) return
          automaticallyEnteredSourceMode = false
          queueMicrotask(() => {
            realm.pub(viewMode$, "rich-text")
          })
          return
        }

        if (realm.getValue(viewMode$) === "source") return
        automaticallyEnteredSourceMode = true
        queueMicrotask(() => {
          realm.pub(viewMode$, "source")
        })
      }

      realm.sub(setMarkdown$, (markdown) => {
        if (realm.getValue(viewMode$) === "source") {
          realm.pub(markdownSourceEditorValue$, markdown)
        }
        queueMicrotask(() => {
          handleProcessingErrorChange(realm.getValue(markdownProcessingError$))
        })
      })
      realm.sub(markdownProcessingError$, handleProcessingErrorChange)
      handleProcessingErrorChange(realm.getValue(markdownProcessingError$))
    },
  },
)
