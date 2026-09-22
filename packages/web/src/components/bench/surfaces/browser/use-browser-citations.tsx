import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import type { InAppBrowserCitationPoint } from "@buddy/browser-contract"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import { toast } from "@buddy/ui"
import { CitationSelectionToolbar } from "@/components/citations/citation-selection-toolbar"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import { readPromptComposerLiveDraft } from "@/components/prompt/prompt-composer-live-draft"
import { appendCitationToDraft } from "@/components/readers/utils/reading-selection-draft"
import type { InAppBrowserPlatform } from "@/context/platform"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { requestCitationComment } from "@/lib/citations/comment-request"
import { registerCitationNavigationHandler } from "@/lib/citations/navigation"
import {
  browserCitationCommentSource,
  createWebCitation,
  createWebCitationID,
  hostPointFromGuest,
  registerWebCitationRevealer,
  resolveWebCitationTarget,
  type BrowserBenchTarget,
  type WebCitation,
  type WebCitationMarkListener,
} from "@/lib/in-app-browser-citations"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"
import { usePromptStore } from "@/state/prompt-store"

const PAGE_READY_TIMEOUT_MS = 15_000
const PAGE_READY_POLL_MS = 100
const NO_SELECTION_NOTICE = "Select text on the page to cite it."
const QUOTE_NOT_FOUND_NOTICE =
  "Couldn't find the quoted text on this page. It may have changed or need sign-in."

type BrowserCitationPageState = {
  webContentsID: number | null
  loading: boolean
  failed: boolean
  zoomFactor: number
  surfaceActive: boolean
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function waitForLoadedPage(read: () => BrowserCitationPageState): Promise<number | null> {
  const deadline = Date.now() + PAGE_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const page = read()
    if (page.failed) return null
    if (page.webContentsID !== null && !page.loading) return page.webContentsID
    await wait(PAGE_READY_POLL_MS)
  }
  return read().webContentsID
}

export function useBrowserCitations(input: {
  directory: string
  target: BrowserBenchTarget
  browser: InAppBrowserPlatform
  profileID: InAppBrowserProfileID
  webContentsID: number | null
  runtime: InAppBrowserTabRuntime
  zoomFactor: number
  surfaceActive: boolean
  pageAreaRef: RefObject<HTMLElement | null>
}): ReactNode {
  const { browser, directory, pageAreaRef, profileID, webContentsID } = input
  const { controller } = useDirectoryNotebookRouteContext()
  const promptKey =
    controller.status === "ready" ? controller.mainPaneProps.chatState.promptKey : undefined
  const setPromptDraft = usePromptStore((state) => state.replaceDraft)
  const workspace = useDirectoryWorkspaceOptional()
  const openBench = useOpenBench()
  const [selectionPoint, setSelectionPoint] = useState<InAppBrowserCitationPoint>()
  const actionRef = useRef<HTMLDivElement>(null)
  const markListenersRef = useRef(new Map<string, WebCitationMarkListener>())
  const targetRef = useRef(input.target)
  targetRef.current = input.target
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const revealingCitationIDRef = useRef<string>()
  const pageRef = useRef<BrowserCitationPageState>({
    webContentsID,
    loading: input.runtime.loading,
    failed: input.runtime.error !== null,
    zoomFactor: input.zoomFactor,
    surfaceActive: input.surfaceActive,
  })
  pageRef.current = {
    webContentsID,
    loading: input.runtime.loading,
    failed: input.runtime.error !== null,
    zoomFactor: input.zoomFactor,
    surfaceActive: input.surfaceActive,
  }

  const cite = useCallback(async () => {
    setSelectionPoint(undefined)
    const citedWebContentsID = pageRef.current.webContentsID
    if (!promptKey || citedWebContentsID === null) return
    const result = await browser.captureCitation({ webContentsID: citedWebContentsID })
    if (result["_tag"] !== "captured") {
      toast.warning(NO_SELECTION_NOTICE)
      return
    }
    const citation = createWebCitation({
      id: createWebCitationID(),
      capture: result.capture,
      profileID,
    })
    requestCitationComment(
      citation.id,
      browserCitationCommentSource({
        browser,
        webContentsID: citedWebContentsID,
        excerpt: citation.excerpt,
        source: citation.source,
        rect: result.capture.rect,
        pageAreaRef,
        readZoomFactor: () => pageRef.current.zoomFactor,
        markListeners: markListenersRef.current,
      }),
    )
    setPromptDraft(
      promptKey,
      appendCitationToDraft(readPromptComposerLiveDraft(promptKey), citation),
    )
  }, [browser, pageAreaRef, profileID, promptKey, setPromptDraft])
  const citeRef = useRef(cite)
  citeRef.current = cite

  useEffect(() => {
    if (webContentsID === null) return
    return browser.onCitation((message) => {
      if (message.webContentsID !== webContentsID) return
      const { event } = message
      if (event.type === "selection") setSelectionPoint(event.point)
      else if (event.type === "selection-cleared") setSelectionPoint(undefined)
      else if (event.type === "cite-requested") void citeRef.current()
      else if (event.type === "mark-moved") {
        markListenersRef.current.get(event.markID)?.moved(event.rect)
      } else markListenersRef.current.get(event.markID)?.lost()
    })
  }, [browser, webContentsID])

  useEffect(() => {
    setSelectionPoint(undefined)
  }, [input.surfaceActive, input.runtime.url, webContentsID])

  useEffect(() => {
    if (!selectionPoint) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && actionRef.current?.contains(event.target)) return
      setSelectionPoint(undefined)
    }
    document.addEventListener("pointerdown", dismiss, true)
    return () => document.removeEventListener("pointerdown", dismiss, true)
  }, [selectionPoint])

  const revealCitation = useCallback(
    async (citation: WebCitation) => {
      if (revealingCitationIDRef.current === citation.id) return
      revealingCitationIDRef.current = citation.id
      try {
        if (!pageRef.current.surfaceActive) {
          const opened = await openBench({
            directory,
            target: targetRef.current,
            mode: BENCH_MODE_REQUEST_POLICY,
            autoOpen: null,
          })
          if (opened.outcome !== "committed") return
        }
        const loadedWebContentsID = await waitForLoadedPage(() => pageRef.current)
        const revealed =
          loadedWebContentsID !== null &&
          (
            await browser.revealCitation({
              webContentsID: loadedWebContentsID,
              excerpt: citation.excerpt,
              selector: citation.source.selector,
            })
          )["_tag"] === "found"
        if (!revealed) toast.warning(QUOTE_NOT_FOUND_NOTICE)
      } finally {
        if (revealingCitationIDRef.current === citation.id)
          revealingCitationIDRef.current = undefined
      }
    },
    [browser, directory, openBench],
  )
  const revealCitationRef = useRef(revealCitation)
  revealCitationRef.current = revealCitation

  const tabID = input.target.tabID
  useEffect(
    () => registerWebCitationRevealer(tabID, (citation) => revealCitationRef.current(citation)),
    [tabID],
  )

  useEffect(
    () =>
      registerCitationNavigationHandler(async (citation) => {
        const currentWorkspace = workspaceRef.current
        if (citation.source.kind !== "web" || !currentWorkspace) return false
        const { openTab } = resolveWebCitationTarget({
          workspace: currentWorkspace.store.getState(),
          source: citation.source,
        })
        if (openTab?.tabID !== targetRef.current.tabID) return false
        await revealCitationRef.current({ ...citation, source: citation.source })
        return true
      }),
    [],
  )

  const pageArea = pageAreaRef.current
  const position =
    selectionPoint && promptKey && input.surfaceActive && pageArea
      ? hostPointFromGuest(selectionPoint, pageArea.getBoundingClientRect(), input.zoomFactor)
      : undefined
  return (
    <CitationSelectionToolbar
      actionRef={actionRef}
      position={position}
      onCite={() => void cite()}
    />
  )
}
