import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useStore } from "zustand"
import {
  isMarkdownBenchPath,
  markdownBenchDocumentFormatFromPath,
} from "@buddy/workspace-file-policy"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { useOnBenchSurfaceActivated } from "@/components/bench/bench-surface-activity"
import { MarkdownBenchAgentEditWatcher } from "@/components/bench/markdown/agent-edit-watcher"
import {
  isMarkdownBenchContentThemeMode,
  resolveMarkdownBenchContentTheme,
} from "@/components/bench/markdown/document-theme"
import {
  MarkdownBenchEditor,
  type MarkdownBenchHistoryControlsState,
  type MarkdownBenchEditorHandle,
} from "@/components/bench/markdown/editor"
import { markdownBenchDirty } from "@/components/bench/markdown/file-rules"
import { resolveMarkdownBenchLink } from "@/components/bench/markdown/link-navigation"
import { resolveMarkdownBenchNoteTitle } from "@/components/bench/markdown/note-title"
import {
  MarkdownBenchAdvancedToolbarSlot,
  MarkdownBenchFileInfo,
  MarkdownBenchMissingFile,
  MarkdownBenchSaveError,
} from "@/components/bench/markdown/panels"
import { MarkdownBenchToolbar } from "@/components/bench/markdown/toolbar"
import { useMarkdownBenchActions } from "@/components/bench/markdown/use-actions"
import { useMarkdownBenchContext } from "@/components/bench/markdown/use-bench-context"
import {
  useMarkdownBenchFile,
  type MarkdownBenchDocumentIO,
} from "@/components/bench/markdown/use-file"
import { useMarkdownBenchPdfExport } from "@/components/bench/markdown/use-pdf-export"
import {
  useMarkdownBenchRename,
  type MarkdownBenchRenameTitle,
} from "@/components/bench/markdown/use-rename"
import { useMarkdownBenchSelectionSync } from "@/components/bench/markdown/use-selection-sync"
import { useMarkdownBenchWikiLinkContext } from "@/components/bench/markdown/use-wikilinks"
import type { ObsidianWikiLinkContext } from "@/components/bench/markdown/plugins/obsidian"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { usePlatform } from "@/context/platform"
import { useTheme } from "@/theme"
import { workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench, type BenchTarget } from "@/lib/bench-navigation"
import type { ProjectExplorerEditableFileState } from "@/state/chat-actions"
import { benchSurfaceUiKey } from "@/state/bench-surface-ui-state"
import {
  MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  useMarkdownBenchPreferences,
} from "@/state/markdown-bench-preferences"

const MARKDOWN_FRAGMENT_SCROLL_MAX_FRAMES = 30

export type MarkdownBenchDocument = {
  storageDirectory: string
  path: string
  initialFile: ProjectExplorerEditableFileState
  target?: BenchTarget
  title?: string
  io?: MarkdownBenchDocumentIO
  placeholder?: ReactNode
  createWikiLinkContext?(markdown: string): ObsidianWikiLinkContext
  renameTitle?: MarkdownBenchRenameTitle
}

type MarkdownBenchPageProps = {
  directory: string
  fragment?: string
  document: MarkdownBenchDocument
}

type MarkdownBenchDockPanel = "advanced-tools" | "file-info" | undefined

export function MarkdownBenchPage(props: MarkdownBenchPageProps) {
  const fileKey = workspaceFileInstanceKey({
    directory: props.document.storageDirectory,
    path: props.document.path,
  })

  return <MarkdownBenchPageInstance key={fileKey} {...props} />
}

function MarkdownBenchPageInstance(props: MarkdownBenchPageProps) {
  const benchDocument = props.document
  const documentFormat = markdownBenchDocumentFormatFromPath(benchDocument.path)
  if (!documentFormat) {
    throw new Error("Markdown Bench received an unsupported document format.")
  }

  const location = useMemo(
    () => ({ directory: benchDocument.storageDirectory, path: benchDocument.path }),
    [benchDocument.storageDirectory, benchDocument.path],
  )
  const title = benchDocument.title ?? resolveMarkdownBenchNoteTitle(benchDocument.path)
  const { controller } = useDirectoryNotebookRouteContext()
  const openBenchRoute = useOpenBench()
  const platform = usePlatform()
  const { themeId, themes } = useTheme()
  const editorRef = useRef<MarkdownBenchEditorHandle>(null)
  const [renamingTitle, setRenamingTitle] = useState(false)
  const [openDockPanel, setOpenDockPanel] = useState<MarkdownBenchDockPanel>()
  const [advancedToolbarContainer, setAdvancedToolbarContainer] = useState<HTMLDivElement | null>(
    null,
  )
  const [historyControls, setHistoryControls] = useState<MarkdownBenchHistoryControlsState>({
    canRedo: false,
    canUndo: false,
  })

  const applyExternalMarkdown = useCallback((markdown: string) => {
    editorRef.current?.setMarkdown(markdown)
  }, [])
  const file = useMarkdownBenchFile({
    location,
    initialFile: benchDocument.initialFile,
    io: benchDocument.io,
    renamingTitle,
    onExternalMarkdown: applyExternalMarkdown,
  })
  const { store } = file
  const markdown = useStore(store, (state) => state.markdown)
  const version = useStore(store, (state) => state.version)
  const exists = useStore(store, (state) => state.exists)
  const saving = useStore(store, (state) => state.saving)
  const conflict = useStore(store, (state) => state.conflict)
  const saveError = useStore(store, (state) => state.saveError)
  const dirty = useStore(store, markdownBenchDirty)
  const changeMarkdown = useStore(store, (state) => state.changeMarkdown)
  const applyProcessingResult = useStore(store, (state) => state.applyProcessingResult)

  const renameTitle = useMarkdownBenchRename({
    directory: props.directory,
    location,
    file,
    renameTitle: benchDocument.renameTitle,
    setRenaming: setRenamingTitle,
  })
  const { exporting, exportRef, exportPdf } = useMarkdownBenchPdfExport({
    directory: location.directory,
    path: location.path,
    title,
  })
  const actions = useMarkdownBenchActions({ file, exporting, exportPdf })
  const wikiLinkContext = useMarkdownBenchWikiLinkContext({
    directory: props.directory,
    storageDirectory: location.directory,
    path: location.path,
    markdown,
    createContext: benchDocument.createWikiLinkContext,
  })

  const contentFontScale = useMarkdownBenchPreferences((state) => state.contentFontScale)
  const contentThemeMode = useMarkdownBenchPreferences((state) => state.contentThemeMode)
  const decreaseContentFontScale = useMarkdownBenchPreferences(
    (state) => state.decreaseContentFontScale,
  )
  const increaseContentFontScale = useMarkdownBenchPreferences(
    (state) => state.increaseContentFontScale,
  )
  const resetContentFontScale = useMarkdownBenchPreferences((state) => state.resetContentFontScale)
  const setContentThemeMode = useMarkdownBenchPreferences((state) => state.setContentThemeMode)

  const contextTarget = useMemo<BenchTarget>(
    () =>
      benchDocument.target ??
      Object.assign(
        {
          type: "workspace-file" as const,
          path: location.path,
          viewer: "markdown" as const,
        },
        props.fragment ? { fragment: props.fragment } : undefined,
      ),
    [benchDocument.target, location.path, props.fragment],
  )
  useMarkdownBenchContext({
    file,
    location,
    presentation: { contentFontScale, contentThemeMode },
    target: contextTarget,
    title,
    leaveGuard: file.leaveGuard,
    synchronize: file.synchronize,
  })

  const activeSessionID =
    controller.status === "ready" ? controller.mainPaneProps.chatState.sessionID : undefined
  const promptKey =
    controller.status === "ready" ? controller.mainPaneProps.chatState.promptKey : undefined
  const syncSelectionToChat = useMarkdownBenchSelectionSync({
    path: location.path,
    promptKey,
    version,
  })
  useOnBenchSurfaceActivated(() => {
    void file.synchronize()
  }, activeSessionID)

  const reloadAfterAgentEdit = useCallback(() => {
    if (markdownBenchDirty(store.getState())) return
    void file.reload()
  }, [file, store])

  useEffect(() => {
    if (!props.fragment) return
    let cancelled = false
    let frameCount = 0
    let animationFrameID = 0
    const scrollWhenReady = () => {
      if (cancelled || !props.fragment) return
      if (editorRef.current?.scrollToFragment(props.fragment)) return
      frameCount += 1
      if (frameCount < MARKDOWN_FRAGMENT_SCROLL_MAX_FRAMES) {
        animationFrameID = window.requestAnimationFrame(scrollWhenReady)
      }
    }
    animationFrameID = window.requestAnimationFrame(scrollWhenReady)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameID)
    }
  }, [props.fragment, location.path])

  const contentTheme = useMemo(() => {
    const theme = themes[themeId]
    if (!theme) return undefined
    return resolveMarkdownBenchContentTheme({ mode: contentThemeMode, theme })
  }, [contentThemeMode, themeId, themes])

  const openMarkdownLink = useCallback(
    (href: string) => {
      const target = resolveMarkdownBenchLink(location.path, href)
      if (!target) return
      if (target.type === "external") {
        platform.openLink(target.url)
        return
      }
      void openBenchRoute({
        directory: props.directory,
        target: Object.assign(
          {
            type: "workspace-file" as const,
            path: target.path,
            viewer: isMarkdownBenchPath(target.path) ? ("markdown" as const) : ("file" as const),
          },
          target.fragment ? { fragment: target.fragment } : undefined,
        ),
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
    },
    [location.path, openBenchRoute, platform, props.directory],
  )

  const isPrintView = contentThemeMode === "print"
  const advancedToolsOpen = openDockPanel === "advanced-tools" && !isPrintView
  const fileInfoOpen = openDockPanel === "file-info"
  const undo = useCallback(() => editorRef.current?.undo(), [])
  const redo = useCallback(() => editorRef.current?.redo(), [])
  const toggleAdvancedTools = useCallback(() => {
    if (isPrintView) return
    setOpenDockPanel((panel) => (panel === "advanced-tools" ? undefined : "advanced-tools"))
  }, [isPrintView])
  const toggleFileInfo = useCallback(() => {
    setOpenDockPanel((panel) => (panel === "file-info" ? undefined : "file-info"))
  }, [])
  const changeContentThemeMode = useCallback(
    (mode: string) => {
      if (!isMarkdownBenchContentThemeMode(mode)) return
      setContentThemeMode(mode)
    },
    [setContentThemeMode],
  )

  const status = !exists
    ? "Unavailable"
    : conflict
      ? "Conflict"
      : saving
        ? "Saving..."
        : dirty
          ? "Unsaved"
          : "Saved"

  return (
    <BenchViewerShell
      title={title}
      subtitle={status === "Saved" ? location.path : `${location.path} · ${status}`}
      actions={actions}
      toolbar={
        <MarkdownBenchToolbar
          advancedToolsOpen={advancedToolsOpen}
          canDecreaseFontScale={
            !isPrintView && contentFontScale > MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE
          }
          canIncreaseFontScale={
            !isPrintView && contentFontScale < MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE
          }
          canRedo={historyControls.canRedo}
          canUndo={historyControls.canUndo}
          contentThemeMode={contentThemeMode}
          fileInfoOpen={fileInfoOpen}
          fontScaleLabel={`${Math.round(contentFontScale * 100)}%`}
          printView={isPrintView}
          onContentThemeModeChange={changeContentThemeMode}
          onDecreaseFontScale={decreaseContentFontScale}
          onIncreaseFontScale={increaseContentFontScale}
          onRedo={redo}
          onResetFontScale={resetContentFontScale}
          onToggleAdvancedTools={toggleAdvancedTools}
          onToggleFileInfo={toggleFileInfo}
          onUndo={undo}
        />
      }
      controlsPlacement="dock"
      hideHeader
      dockPanel={
        advancedToolsOpen ? (
          <MarkdownBenchAdvancedToolbarSlot ref={setAdvancedToolbarContainer} />
        ) : fileInfoOpen ? (
          <MarkdownBenchFileInfo title={title} />
        ) : undefined
      }
      contentClassName="overflow-hidden"
    >
      <MarkdownBenchAgentEditWatcher
        directory={props.directory}
        sessionID={activeSessionID}
        path={location.path}
        onSettled={reloadAfterAgentEdit}
      />
      {saveError ? <MarkdownBenchSaveError message={saveError} /> : null}
      <div ref={exportRef} className="h-full min-h-0">
        {!exists && !dirty ? (
          <MarkdownBenchMissingFile path={location.path} />
        ) : (
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={markdown}
            version={version}
            dirty={dirty}
            saving={saving}
            conflict={conflict}
            advancedToolbarContainer={advancedToolbarContainer}
            contentFontScale={contentFontScale}
            contentTheme={contentTheme}
            directory={location.directory}
            documentFormat={documentFormat}
            path={location.path}
            viewportKey={benchSurfaceUiKey({
              directory: props.directory,
              target: contextTarget,
            })}
            placeholder={benchDocument.placeholder}
            obsidianWikiLinkContext={wikiLinkContext}
            onChange={changeMarkdown}
            onHistoryControlsChange={setHistoryControls}
            onOpenLink={openMarkdownLink}
            onProcessingResult={applyProcessingResult}
            onRenameTitle={renameTitle}
            onSelectionChange={syncSelectionToChat}
            renamingTitle={renamingTitle}
          />
        )}
      </div>
    </BenchViewerShell>
  )
}
