import {
  KitchenSinkToolbar,
  MDXEditor,
  NestedLexicalEditor,
  createActiveEditorSubscription$,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkPlugin,
  linkDialogPlugin,
  listsPlugin,
  markdownSourceEditorValue$,
  markdownProcessingError$,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  setMarkdown$,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  viewMode$,
  type MDXEditorMethods,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import { createPortal } from "react-dom"
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical"
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react"
import type { RootContent } from "mdast"
import { cn } from "@buddy/ui"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { markdownClassName } from "@/components/markdown/markdown-html-segment"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
  restoreMarkdownFromMdxEditor,
} from "@/components/bench/markdown-bench-compatibility"
import {
  canRenderMdxIntrinsic,
  MarkdownBenchIntrinsicScope,
  MarkdownBenchMdxIntrinsicPreview,
} from "@/components/bench/markdown-bench-mdx-intrinsic"
import { resolveMarkdownBenchImageSrc } from "@/lib/markdown-bench-image-src"
import { readBenchSurfaceViewport, writeBenchSurfaceViewport } from "@/state/bench-surface-ui-state"
import { BUDDY_CODE_MIRROR_EXTENSIONS } from "@/components/bench/markdown-bench-code-theme"
import { buddyMathPlugin } from "@/components/bench/markdown-bench-math-plugin"
import { buddyMarkdownSvgPlugin } from "@/components/bench/markdown-bench-markdown-svg-plugin"
import {
  MarkdownBenchChemistryViewProvider,
  buddyChemistryPlugin,
  type MarkdownBenchChemistryViewOptions,
} from "@/components/bench/markdown-bench-chemistry-plugin"
import {
  MarkdownBenchMermaidViewProvider,
  buddyMermaidPlugin,
  type MarkdownBenchMermaidViewOptions,
} from "@/components/bench/markdown-bench-mermaid-plugin"
import {
  buildMarkdownBenchContentThemeCss,
  sanitizeMarkdownBenchThemeScopeID,
  type MarkdownBenchContentTheme,
} from "@/components/bench/markdown-bench-document-theme"
import { MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS } from "@/components/bench/markdown-bench-directives"
import { restoreObsidianCalloutsFromMdxEditor } from "@/components/bench/markdown-bench-obsidian-callouts"
import { resolveMarkdownBenchNoteTitle } from "@/components/bench/markdown-bench-note-title"
import {
  buddyObsidianWikiLinkPlugin,
  type ObsidianWikiLinkContext,
} from "@/components/bench/markdown-bench-obsidian-plugin"

export type MarkdownBenchEditorContract = {
  markdown: string
  version: string
  dirty: boolean
  saving: boolean
  conflict: boolean
  onChange(markdown: string): void
  onSave(markdown: string, expectedVersion: string): void
  onReload(): void
  getMarkdown(): string
  getSelectionMarkdown(): string
  setMarkdown(markdown: string): void
  focus(): void
}

export type MarkdownBenchEditorHandle = Pick<
  MarkdownBenchEditorContract,
  "getMarkdown" | "getSelectionMarkdown" | "setMarkdown" | "focus"
> & {
  redo(): void
  scrollToFragment(fragment: string): boolean
  undo(): void
}

export type MarkdownBenchHistoryControlsState = {
  canRedo: boolean
  canUndo: boolean
}

export type MarkdownBenchDocumentSelection = {
  text: string
  headingPath?: string[]
}

export type MarkdownBenchProcessingResult = {
  markdown: string
  error: string | undefined
}

type MarkdownBenchHistoryControls = MarkdownBenchHistoryControlsState & {
  redo(): void
  undo(): void
}

type MarkdownBenchHistoryPluginParams = {
  onChange(controls: MarkdownBenchHistoryControls): void
}

type MarkdownBenchErrorRecoveryPluginParams = {
  onProcessingErrorChange(message: string | undefined): void
}

type MarkdownBenchProcessingError = {
  error: string
  source: string
} | null

export type MarkdownBenchEditorAppearance = "paper" | "plain"

type MarkdownBenchEditorProps = Pick<
  MarkdownBenchEditorContract,
  "markdown" | "version" | "dirty" | "saving" | "conflict" | "onChange"
> & {
  advancedToolbarContainer?: HTMLElement | null
  /** "paper" (default) shows the document card chrome; "plain" renders a flush, minimal surface. */
  appearance?: MarkdownBenchEditorAppearance
  className?: string
  contentFontScale?: number
  contentTheme?: MarkdownBenchContentTheme
  directory: string
  documentFormat: MarkdownBenchDocumentFormat
  path: string
  placeholder?: ReactNode
  viewportKey?: string
  obsidianWikiLinkContext?: ObsidianWikiLinkContext
  onHistoryControlsChange?(controls: MarkdownBenchHistoryControlsState): void
  onOpenLink?(href: string): void
  onProcessingResult?(result: MarkdownBenchProcessingResult): void
  onRenameTitle?(title: string): Promise<void>
  onSelectionChange?(selection: MarkdownBenchDocumentSelection): void
  renamingTitle?: boolean
}

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Plain text",
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  css: "CSS",
  html: "HTML",
  json: "JSON",
  markdown: "Markdown",
  bash: "Bash",
  python: "Python",
}

const MARKDOWN_SERIALIZATION_OPTIONS = {
  listItemIndent: "one",
  resourceLink: false,
} as const

const MARKDOWN_FRAGMENT_TARGET_SELECTOR = "[id],h1,h2,h3,h4,h5,h6,p,li,blockquote"

function normalizedMarkdownFragment(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/u, "")
    .replace(/^\^/u, "")
    .replaceAll("-", " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase()
}

function decodedMarkdownFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

export function findMarkdownBenchFragmentTarget(
  root: HTMLElement,
  fragment: string,
): HTMLElement | undefined {
  const decoded = decodedMarkdownFragment(fragment).trim()
  if (!decoded) return undefined
  const normalized = normalizedMarkdownFragment(decoded)
  const blockMarker = decoded.startsWith("^") ? decoded : `^${decoded}`
  return Array.from(root.querySelectorAll<HTMLElement>(MARKDOWN_FRAGMENT_TARGET_SELECTOR)).find(
    (element) => {
      if (element.id === decoded) return true
      const text = element.textContent?.trim() ?? ""
      if (decoded.startsWith("^") && text.endsWith(blockMarker)) return true
      return /^H[1-6]$/u.test(element.tagName) && normalizedMarkdownFragment(text) === normalized
    },
  )
}

type MdxFlowChild = Extract<
  JsxEditorProps["mdastNode"],
  { type: "mdxJsxFlowElement" }
>["children"][number]
type MdxTextChild = Extract<
  JsxEditorProps["mdastNode"],
  { type: "mdxJsxTextElement" }
>["children"][number]

function isMdxFlowChild(node: RootContent): node is MdxFlowChild {
  switch (node.type) {
    case "blockquote":
    case "code":
    case "definition":
    case "footnoteDefinition":
    case "heading":
    case "html":
    case "list":
    case "math":
    case "mdxJsxFlowElement":
    case "paragraph":
    case "table":
    case "thematicBreak":
    case "yaml":
      return true
    default:
      return false
  }
}

function isMdxTextChild(node: RootContent): node is MdxTextChild {
  switch (node.type) {
    case "break":
    case "delete":
    case "emphasis":
    case "html":
    case "image":
    case "imageReference":
    case "inlineCode":
    case "link":
    case "linkReference":
    case "mdxJsxTextElement":
    case "strong":
    case "text":
      return true
    default:
      return false
  }
}

function GenericMdxComponentEditor({ mdastNode }: JsxEditorProps) {
  if (canRenderMdxIntrinsic(mdastNode.name)) {
    return <MarkdownBenchMdxIntrinsicPreview mdastNode={mdastNode} />
  }

  const label = (
    <code className="rounded bg-surface-inset-base px-1.5 py-0.5 text-xs text-text-weak">
      {mdastNode.name ?? "Fragment"}
    </code>
  )

  if (mdastNode.type === "mdxJsxTextElement") {
    const content = mdastNode.children.length > 0 && (
      <NestedLexicalEditor<typeof mdastNode>
        getContent={(node) => node.children}
        getUpdatedMdastNode={(node, children) => ({
          ...node,
          children: children.filter(isMdxTextChild),
        })}
      />
    )

    return (
      <span
        data-component="markdown-bench-mdx-component"
        className="inline-flex items-baseline gap-1"
      >
        {label}
        {content}
      </span>
    )
  }

  const content = mdastNode.children.length > 0 && (
    <NestedLexicalEditor<typeof mdastNode>
      block
      getContent={(node) => node.children}
      getUpdatedMdastNode={(node, children) => ({
        ...node,
        children: children.filter(isMdxFlowChild),
      })}
    />
  )

  return (
    <div
      data-component="markdown-bench-mdx-component"
      className="my-2 rounded-md border border-border-weak-base bg-surface-weak p-3"
    >
      {label}
      {content}
    </div>
  )
}

const GENERIC_MDX_COMPONENT_DESCRIPTOR = {
  name: "*",
  kind: "flow",
  props: [],
  hasChildren: true,
  Editor: GenericMdxComponentEditor,
} satisfies JsxComponentDescriptor

const EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS: MarkdownBenchHistoryControls = {
  canRedo: false,
  canUndo: false,
  redo() {},
  undo() {},
}

const MDX_EDITOR_THEME_CLASS_NAME = [
  "![--accentBase:var(--surface-interactive-weak)]",
  "![--accentBgSubtle:var(--surface-interactive-weak)]",
  "![--accentBg:var(--surface-interactive-base)]",
  "![--accentBgHover:var(--surface-interactive-base-hover)]",
  "![--accentBgActive:var(--surface-interactive-hover)]",
  "![--accentLine:var(--border-interactive-base)]",
  "![--accentBorder:var(--border-interactive-base)]",
  "![--accentBorderHover:var(--border-interactive-hover)]",
  "![--accentSolid:var(--button-primary-base)]",
  "![--accentSolidHover:var(--button-primary-hover)]",
  "![--accentText:var(--text-interactive-base)]",
  "![--accentTextContrast:var(--text-strong)]",
  "![--basePageBg:var(--background-base)]",
  "![--baseBase:var(--background-base)]",
  "![--baseBgSubtle:var(--surface-inset-base)]",
  "![--baseBg:var(--surface-base)]",
  "![--baseBgHover:var(--surface-base-hover)]",
  "![--baseBgActive:var(--surface-raised-base)]",
  "![--baseLine:var(--border-weaker-base)]",
  "![--baseBorder:var(--border-base)]",
  "![--baseBorderHover:var(--border-hover)]",
  "![--baseSolid:var(--icon-weak)]",
  "![--baseSolidHover:var(--icon-base)]",
  "![--baseText:var(--text-weak)]",
  "![--baseTextContrast:var(--text-strong)]",
  "![--color-text-base:var(--markdown-text)]",
  "![--color-text-strong:var(--markdown-heading)]",
  "![--color-text-weak:var(--markdown-block-quote)]",
  "![--color-text-weaker:var(--text-weaker)]",
  "![--color-text-interactive-base:var(--markdown-link-text)]",
  "![--color-syntax-string:var(--markdown-code)]",
  "![--error-color:var(--text-critical-base)]",
  "![--font-body:var(--font-sans)]",
  "![--font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace]",
  "[&_.cm-editor]:!bg-background-stronger [&_.cm-editor]:!text-text-base",
  "[&_.cm-gutters]:!border-border-weaker-base [&_.cm-gutters]:!bg-background-stronger",
].join(" ")

const MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME = "markdown-bench-mdx-editor"
const MARKDOWN_BENCH_MDX_POPUP_Z_INDEX = 60
const MARKDOWN_BENCH_MDX_DIALOG_OVERLAY_Z_INDEX = MARKDOWN_BENCH_MDX_POPUP_Z_INDEX + 1
const MARKDOWN_BENCH_MDX_DIALOG_CONTENT_Z_INDEX = MARKDOWN_BENCH_MDX_POPUP_Z_INDEX + 2
const MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS = `
.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container {
  z-index: ${MARKDOWN_BENCH_MDX_POPUP_Z_INDEX};
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container [class*="_dialogOverlay_"] {
  z-index: ${MARKDOWN_BENCH_MDX_DIALOG_OVERLAY_Z_INDEX};
}

.${MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME}.mdxeditor-popup-container [role="dialog"] {
  z-index: ${MARKDOWN_BENCH_MDX_DIALOG_CONTENT_Z_INDEX};
}
`

function MarkdownBenchAdvancedToolbarPortal(props: { container?: HTMLElement | null }) {
  if (!props.container) return null
  return createPortal(
    <div
      data-component="markdown-bench-advanced-toolbar"
      className={cn(
        "mdxeditor flex min-w-max items-center gap-1 px-1 [&_[data-toolbar-item]]:mx-0.5 [&_[role='separator']]:mx-2",
        MDX_EDITOR_THEME_CLASS_NAME,
      )}
    >
      <KitchenSinkToolbar />
    </div>,
    props.container,
  )
}

const MARKDOWN_CONTENT_BASE_CLASS_NAME = [
  markdownClassName,
  "focus:outline-none",
  // MDXEditor uses --text-base for font sizing, which shadows Buddy's color token alias.
  "![color:var(--markdown-text)]",
  "![font-size:calc(var(--buddy-font-size-base)*var(--markdown-bench-document-font-scale))]",
  "![line-height:1.5]",
  // Match Obsidian's base editor metrics while leaving Buddy's theme colors untouched.
  "[&_h1]:!text-[1.618em] [&_h1]:![font-weight:700] [&_h1]:!leading-[1.2] [&_h1]:!tracking-[-0.015em]",
  "[&_h2]:!text-[1.462em] [&_h2]:![font-weight:680] [&_h2]:!leading-[1.2] [&_h2]:!tracking-[-0.011em]",
  "[&_h3]:!text-[1.318em] [&_h3]:![font-weight:660] [&_h3]:!leading-[1.3] [&_h3]:!tracking-[-0.008em]",
  "[&_h4]:!text-[1.188em] [&_h4]:![font-weight:640] [&_h4]:!leading-[1.4] [&_h4]:!tracking-[-0.005em]",
  "[&_h5]:!text-[1.076em] [&_h5]:![font-weight:620] [&_h5]:!leading-[1.5] [&_h5]:!tracking-[-0.002em]",
  "[&_h6]:!text-[1em] [&_h6]:![font-weight:600] [&_h6]:!leading-[1.5] [&_h6]:!tracking-[0em]",
  // Lexical can apply its code-format class to nested strong/em nodes inside semantic <code>.
  "[&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!text-[var(--color-syntax-string)]",
  "[&_code_*]:!bg-transparent [&_code_*]:!p-0 [&_code_*]:!text-inherit",
].join(" ")

const MARKDOWN_CONTENT_PAPER_LAYOUT_CLASS_NAME =
  "min-h-[calc(100vh-12rem)] !px-0 !pt-0 !pb-[clamp(0px,calc((100%_-_28rem)/4),3rem)]"

const MARKDOWN_CONTENT_PLAIN_LAYOUT_CLASS_NAME = "min-h-full !px-0 !pt-0 !pb-3"

const MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME =
  "px-[clamp(0px,calc((100%_-_28rem)/6),2rem)]"

const MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME = "px-4"

const MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME =
  "mb-[0.5em] whitespace-pre-wrap [font-size:calc(var(--buddy-font-size-base)*1.618*var(--markdown-bench-document-font-scale))] [font-weight:700] leading-[1.2] tracking-[-0.015em]"

const MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME =
  "pt-[clamp(0px,calc((100%_-_28rem)/4),3rem)]"

const MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME = "pt-3"

const MARKDOWN_NOTE_TITLE_INPUT_CLASS_NAME =
  "block w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-inherit outline-none [font:inherit] [letter-spacing:inherit]"

const MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME =
  "mx-auto w-full max-w-3xl min-h-full overflow-hidden rounded-lg border border-border-weak-base bg-background-base shadow-sm"

const MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME = "w-full min-h-full bg-background-base"

const MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX = 3
const MARKDOWN_BENCH_SELECTION_EDGE_MIN_HEIGHT_PX = 3
const MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS =
  "px-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)] pt-[clamp(0px,calc((100%_-_28rem)/8),1.5rem)]"

type MarkdownBenchSelectionSection = {
  top: number
  height: number
}

function headingLevel(element: Element): number | undefined {
  const match = element.tagName.match(/^H([1-6])$/u)
  if (!match?.[1]) return undefined
  const level = Number.parseInt(match[1], 10)
  return Number.isFinite(level) ? level : undefined
}

function isHeadingBeforeSelectionStart(heading: Element, startContainer: Node): boolean {
  if (heading === startContainer) return true
  const position = heading.compareDocumentPosition(startContainer)
  return (
    (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ||
    (position & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0
  )
}

function resolveSelectionHeadingPath(editorRoot: HTMLElement, range: Range): string[] | undefined {
  const headingPath: string[] = []
  const headings = editorRoot.querySelectorAll("h1,h2,h3,h4,h5,h6")

  for (const heading of headings) {
    if (!isHeadingBeforeSelectionStart(heading, range.startContainer)) {
      break
    }

    const level = headingLevel(heading)
    const text = heading.textContent?.trim()
    if (level === undefined || !text) {
      continue
    }

    headingPath.splice(level - 1)
    headingPath[level - 1] = text
  }

  const compactHeadingPath = headingPath.filter((entry) => entry.length > 0)
  return compactHeadingPath.length > 0 ? compactHeadingPath : undefined
}

function resolveMarkdownBenchSelectionSection(input: {
  range: Range
  scrollRoot: HTMLElement
}): MarkdownBenchSelectionSection | undefined {
  const rootRect = input.scrollRoot.getBoundingClientRect()
  const rects = Array.from(input.range.getClientRects())
    .map((rect) => ({
      top: rect.top - rootRect.top + input.scrollRoot.scrollTop,
      height: rect.height,
    }))
    .filter((rect) => rect.height >= MARKDOWN_BENCH_SELECTION_EDGE_MIN_HEIGHT_PX)
    .toSorted((left, right) => left.top - right.top)

  if (rects.length === 0) {
    return undefined
  }

  const first = rects[0]
  const last = rects.at(-1)
  if (!first || !last) {
    return undefined
  }

  return {
    top: first.top,
    height: last.top + last.height - first.top,
  }
}

const markdownBenchHistoryControlsPlugin = realmPlugin<MarkdownBenchHistoryPluginParams>({
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

const markdownBenchErrorRecoveryPlugin = realmPlugin<MarkdownBenchErrorRecoveryPluginParams>({
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
})

export const MarkdownBenchEditor = forwardRef<MarkdownBenchEditorHandle, MarkdownBenchEditorProps>(
  function MarkdownBenchEditor(props, ref) {
    const appearance = props.appearance ?? "paper"
    const isPlainAppearance = appearance === "plain"
    const editorRef = useRef<MDXEditorMethods>(null)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const [selectionSection, setSelectionSection] = useState<
      MarkdownBenchSelectionSection | undefined
    >(undefined)
    const applyingExternalMarkdownRef = useRef(false)
    const historyControlsRef = useRef<MarkdownBenchHistoryControls>(
      EMPTY_MARKDOWN_BENCH_HISTORY_CONTROLS,
    )
    const onHistoryControlsChangeRef = useRef(props.onHistoryControlsChange)
    const onProcessingResultRef = useRef(props.onProcessingResult)
    const processingMarkdownRef = useRef(props.markdown)
    onProcessingResultRef.current = props.onProcessingResult
    processingMarkdownRef.current = props.markdown

    useLayoutEffect(() => {
      const editorRoot = editorRootRef.current
      const viewportKey = props.viewportKey
      if (!editorRoot || !viewportKey) return
      const restoredViewport = readBenchSurfaceViewport(viewportKey)
      if (restoredViewport?.scrollTop !== undefined) {
        editorRoot.scrollTop = restoredViewport.scrollTop
      }
      if (restoredViewport?.scrollLeft !== undefined) {
        editorRoot.scrollLeft = restoredViewport.scrollLeft
      }
      return () => {
        writeBenchSurfaceViewport(viewportKey, {
          scrollTop: editorRoot.scrollTop,
          scrollLeft: editorRoot.scrollLeft,
        })
      }
    }, [props.viewportKey])
    const rawThemeScopeID = useId()
    const themeScopeID = useMemo(
      () => sanitizeMarkdownBenchThemeScopeID(rawThemeScopeID),
      [rawThemeScopeID],
    )
    const scopedThemeCss = useMemo(() => {
      if (!props.contentTheme) return undefined
      return buildMarkdownBenchContentThemeCss({
        contentFontScale: props.contentFontScale,
        scopeID: themeScopeID,
        theme: props.contentTheme,
      })
    }, [props.contentFontScale, props.contentTheme, themeScopeID])
    const mermaidViewOptions = useMemo<MarkdownBenchMermaidViewOptions | undefined>(() => {
      if (!props.contentTheme) return undefined
      return {
        presentation: props.contentTheme.mode === "print" ? "static" : "interactive",
        themeConfig: props.contentTheme.mermaidThemeConfig,
      }
    }, [props.contentTheme])
    const isPrintView = props.contentTheme?.mode === "print"
    const onRenameTitle = props.onRenameTitle
    const noteTitle = useMemo(() => resolveMarkdownBenchNoteTitle(props.path), [props.path])
    const [noteTitleDraft, setNoteTitleDraft] = useState(noteTitle)
    const cancelTitleCommitRef = useRef(false)
    useEffect(() => {
      setNoteTitleDraft(noteTitle)
    }, [noteTitle])
    const commitNoteTitle = useCallback(
      async (event: ReactFocusEvent<HTMLInputElement>) => {
        if (cancelTitleCommitRef.current) {
          cancelTitleCommitRef.current = false
          return
        }
        const nextTitle = event.currentTarget.value.trim()
        if (!onRenameTitle || nextTitle === noteTitle) {
          setNoteTitleDraft(noteTitle)
          return
        }
        try {
          await onRenameTitle(nextTitle)
        } catch {
          setNoteTitleDraft(noteTitle)
        }
      },
      [noteTitle, onRenameTitle],
    )
    const handleNoteTitleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
          return
        }
        if (event.key !== "Escape") return
        event.preventDefault()
        cancelTitleCommitRef.current = true
        setNoteTitleDraft(noteTitle)
        event.currentTarget.blur()
      },
      [noteTitle],
    )
    const chemistryViewOptions = useMemo<MarkdownBenchChemistryViewOptions>(
      () => ({
        directory: props.directory,
      }),
      [props.directory],
    )
    const fallbackObsidianWikiLinkContext = useMemo<ObsidianWikiLinkContext>(
      () => ({
        directory: props.directory,
        documentPath: props.path,
        compatible: false,
        resolutions: new Map(),
        openResolution() {},
      }),
      [props.directory, props.path],
    )
    const obsidianWikiLinkContext = props.obsidianWikiLinkContext ?? fallbackObsidianWikiLinkContext
    const editorMarkdown = useMemo(
      () =>
        props.documentFormat === "mdx"
          ? prepareMdxForMdxEditor(props.markdown)
          : prepareMarkdownForMdxEditor(props.markdown),
      [props.documentFormat, props.markdown],
    )
    const restoreEditorMarkdown = useCallback(
      (markdown: string) => {
        const restoredCallouts = restoreObsidianCalloutsFromMdxEditor(markdown)
        return props.documentFormat === "mdx"
          ? restoredCallouts
          : restoreMarkdownFromMdxEditor(restoredCallouts)
      },
      [props.documentFormat],
    )
    const onSelectionChange = props.onSelectionChange
    const handleHistoryControlsChange = useCallback((controls: MarkdownBenchHistoryControls) => {
      historyControlsRef.current = controls
      onHistoryControlsChangeRef.current?.({
        canRedo: controls.canRedo,
        canUndo: controls.canUndo,
      })
    }, [])
    const handleProcessingErrorChange = useCallback((message: string | undefined) => {
      const result = {
        markdown: processingMarkdownRef.current,
        error: message,
      } satisfies MarkdownBenchProcessingResult
      queueMicrotask(() => {
        onProcessingResultRef.current?.(result)
      })
    }, [])
    const notifySelectionChange = useCallback(() => {
      if (!onSelectionChange) return
      window.requestAnimationFrame(() => {
        const editorRoot = editorRootRef.current
        const selection = window.getSelection()
        if (
          !editorRoot ||
          !selection ||
          selection.isCollapsed ||
          selection.rangeCount === 0 ||
          !selection.anchorNode ||
          !selection.focusNode ||
          !editorRoot.contains(selection.anchorNode) ||
          !editorRoot.contains(selection.focusNode)
        ) {
          setSelectionSection(undefined)
          onSelectionChange({ text: "" })
          return
        }

        const range = selection.getRangeAt(0)
        setSelectionSection(resolveMarkdownBenchSelectionSection({ range, scrollRoot: editorRoot }))
        const headingPath = resolveSelectionHeadingPath(editorRoot, range)
        onSelectionChange({
          text: selection.toString().trim(),
          ...(headingPath ? { headingPath } : {}),
        })
      })
    }, [onSelectionChange])
    const onOpenLink = props.onOpenLink
    const openLink = useCallback(
      (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!onOpenLink || !(event.target instanceof Element)) return
        const anchor = event.target.closest("a")
        if (!(anchor instanceof HTMLAnchorElement)) return
        const href = anchor.getAttribute("href")
        if (!href) return
        event.preventDefault()
        event.stopPropagation()
        onOpenLink(href)
      },
      [onOpenLink],
    )
    const plugins = useMemo(
      () => [
        diffSourcePlugin({
          codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
          viewMode: "rich-text",
        }),
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        thematicBreakPlugin(),
        buddyMathPlugin(),
        ...(props.documentFormat === "markdown" ? [buddyMarkdownSvgPlugin()] : []),
        buddyMermaidPlugin(),
        buddyChemistryPlugin(),
        buddyObsidianWikiLinkPlugin({ context: obsidianWikiLinkContext }),
        linkPlugin(),
        linkDialogPlugin({
          showLinkTitleField: true,
        }),
        tablePlugin(),
        codeBlockPlugin(),
        codeMirrorPlugin({
          codeBlockLanguages: CODE_BLOCK_LANGUAGES,
          codeMirrorExtensions: BUDDY_CODE_MIRROR_EXTENSIONS,
        }),
        frontmatterPlugin(),
        imagePlugin({
          imagePreviewHandler: (src) =>
            Promise.resolve(
              resolveMarkdownBenchImageSrc({
                directory: props.directory,
                documentPath: props.path,
                src,
              }),
            ),
        }),
        directivesPlugin({
          directiveDescriptors: MARKDOWN_BENCH_DIRECTIVE_DESCRIPTORS,
        }),
        ...(props.documentFormat === "mdx"
          ? [
              jsxPlugin({
                allowFragment: false,
                jsxComponentDescriptors: [GENERIC_MDX_COMPONENT_DESCRIPTOR],
              }),
            ]
          : []),
        markdownBenchErrorRecoveryPlugin({
          onProcessingErrorChange: handleProcessingErrorChange,
        }),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: "!hidden",
          toolbarContents: () => (
            <MarkdownBenchAdvancedToolbarPortal container={props.advancedToolbarContainer} />
          ),
        }),
        markdownBenchHistoryControlsPlugin({
          onChange: handleHistoryControlsChange,
        }),
      ],
      [
        handleHistoryControlsChange,
        handleProcessingErrorChange,
        obsidianWikiLinkContext,
        props.advancedToolbarContainer,
        props.directory,
        props.documentFormat,
        props.path,
      ],
    )

    useEffect(() => {
      setSelectionSection(undefined)
    }, [props.markdown])

    useEffect(() => {
      onHistoryControlsChangeRef.current = props.onHistoryControlsChange
    }, [props.onHistoryControlsChange])

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown() {
          return restoreEditorMarkdown(editorRef.current?.getMarkdown() ?? "")
        },
        getSelectionMarkdown() {
          return editorRef.current?.getSelectionMarkdown() ?? ""
        },
        setMarkdown(markdown: string) {
          applyingExternalMarkdownRef.current = true
          processingMarkdownRef.current = markdown
          editorRef.current?.setMarkdown(
            props.documentFormat === "mdx"
              ? prepareMdxForMdxEditor(markdown)
              : prepareMarkdownForMdxEditor(markdown),
          )
          window.queueMicrotask(() => {
            applyingExternalMarkdownRef.current = false
          })
        },
        focus() {
          editorRef.current?.focus()
        },
        redo() {
          historyControlsRef.current.redo()
        },
        scrollToFragment(fragment: string) {
          const editorRoot = editorRootRef.current
          if (!editorRoot) return false
          const target = findMarkdownBenchFragmentTarget(editorRoot, fragment)
          if (!target) return false
          target.scrollIntoView({ block: "center" })
          return true
        },
        undo() {
          historyControlsRef.current.undo()
        },
      }),
      [props.documentFormat, restoreEditorMarkdown],
    )

    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const currentMarkdown = restoreEditorMarkdown(editor.getMarkdown())
      if (currentMarkdown === props.markdown) {
        return
      }

      applyingExternalMarkdownRef.current = true
      editor.setMarkdown(editorMarkdown)
      window.queueMicrotask(() => {
        applyingExternalMarkdownRef.current = false
      })
    }, [editorMarkdown, props.markdown, restoreEditorMarkdown])

    const mdxEditorElement = (
      <div
        data-component="markdown-bench-paper"
        className={
          isPlainAppearance
            ? MARKDOWN_BENCH_PAPER_PLAIN_CLASS_NAME
            : MARKDOWN_BENCH_PAPER_CARD_CLASS_NAME
        }
      >
        <div
          data-component="markdown-bench-document-content"
          className={cn(
            isPlainAppearance
              ? MARKDOWN_DOCUMENT_PLAIN_INSET_CLASS_NAME
              : MARKDOWN_DOCUMENT_PAPER_INSET_CLASS_NAME,
          )}
        >
          <div
            role="heading"
            aria-level={1}
            data-component="markdown-bench-note-title"
            data-markdown-export-ignore
            className={cn(
              MARKDOWN_NOTE_TITLE_BASE_CLASS_NAME,
              isPlainAppearance
                ? MARKDOWN_NOTE_TITLE_PLAIN_LAYOUT_CLASS_NAME
                : MARKDOWN_NOTE_TITLE_PAPER_LAYOUT_CLASS_NAME,
            )}
          >
            <input
              type="text"
              aria-label="Note title"
              aria-busy={props.renamingTitle ? "true" : undefined}
              data-component="markdown-bench-note-title-input"
              className={MARKDOWN_NOTE_TITLE_INPUT_CLASS_NAME}
              readOnly={!onRenameTitle || props.renamingTitle || isPrintView}
              spellCheck={false}
              value={noteTitleDraft}
              onBlur={commitNoteTitle}
              onChange={(event) => setNoteTitleDraft(event.currentTarget.value)}
              onKeyDown={handleNoteTitleKeyDown}
            />
          </div>
          <MDXEditor
            ref={editorRef}
            className={cn(
              "min-h-full bg-background-base text-text-base",
              MARKDOWN_BENCH_MDX_EDITOR_CLASS_NAME,
              MDX_EDITOR_THEME_CLASS_NAME,
            )}
            markdown={editorMarkdown}
            plugins={plugins}
            readOnly={isPrintView || props.renamingTitle}
            placeholder={props.placeholder}
            suppressHtmlProcessing={props.documentFormat === "mdx"}
            toMarkdownOptions={MARKDOWN_SERIALIZATION_OPTIONS}
            onChange={(nextMarkdown, initialMarkdownNormalize) => {
              if (initialMarkdownNormalize || applyingExternalMarkdownRef.current) {
                return
              }
              props.onChange(restoreEditorMarkdown(nextMarkdown))
            }}
            contentEditableClassName={cn(
              MARKDOWN_CONTENT_BASE_CLASS_NAME,
              isPlainAppearance
                ? MARKDOWN_CONTENT_PLAIN_LAYOUT_CLASS_NAME
                : MARKDOWN_CONTENT_PAPER_LAYOUT_CLASS_NAME,
            )}
          />
        </div>
      </div>
    )

    return (
      <div
        ref={editorRootRef}
        data-component="markdown-bench-editor"
        data-dirty={props.dirty ? "true" : "false"}
        data-saving={props.saving ? "true" : "false"}
        data-conflict={props.conflict ? "true" : "false"}
        data-version={props.version}
        data-content-theme={props.contentTheme?.mode}
        data-obsidian-vault={obsidianWikiLinkContext.compatible ? "true" : "false"}
        data-markdown-bench-theme-scope={themeScopeID}
        className={cn(
          "markdown-bench-editor relative h-full min-h-0 overflow-y-auto text-text-base",
          isPlainAppearance
            ? "bg-background-base"
            : cn("bg-background-weak pb-48", MARKDOWN_BENCH_DOCUMENT_GUTTER_CLASS),
          props.className,
        )}
        onPointerUp={notifySelectionChange}
        onKeyUp={notifySelectionChange}
        onClickCapture={openLink}
      >
        {selectionSection ? (
          <div
            aria-hidden
            data-component="markdown-bench-selection-section-overlay"
            className="pointer-events-none absolute left-1/2 top-0 z-20 w-full max-w-3xl -translate-x-1/2"
          >
            <div
              data-component="markdown-bench-selection-section"
              className="absolute left-0 right-0 bg-[color:color-mix(in_oklab,var(--surface-warning-base)_42%,transparent)]"
              style={{
                top: selectionSection.top,
                height: selectionSection.height,
              }}
            >
              <div
                data-component="markdown-bench-selection-edge"
                className="absolute inset-y-0 left-0 rounded-r-sm bg-border-warning-base"
                style={{ width: MARKDOWN_BENCH_SELECTION_EDGE_WIDTH_PX }}
              />
            </div>
          </div>
        ) : null}
        {scopedThemeCss ? (
          <style data-markdown-bench-content-theme-style data-markdown-export-ignore>
            {scopedThemeCss}
          </style>
        ) : null}
        <style data-markdown-bench-mdx-popup-layer-style data-markdown-export-ignore>
          {MARKDOWN_BENCH_MDX_POPUP_LAYER_CSS}
        </style>
        <MarkdownBenchChemistryViewProvider value={chemistryViewOptions}>
          {mermaidViewOptions ? (
            <MarkdownBenchMermaidViewProvider value={mermaidViewOptions}>
              <MarkdownBenchIntrinsicScope
                value={{ directory: props.directory, documentPath: props.path }}
              >
                {mdxEditorElement}
              </MarkdownBenchIntrinsicScope>
            </MarkdownBenchMermaidViewProvider>
          ) : (
            <MarkdownBenchIntrinsicScope
              value={{ directory: props.directory, documentPath: props.path }}
            >
              {mdxEditorElement}
            </MarkdownBenchIntrinsicScope>
          )}
        </MarkdownBenchChemistryViewProvider>
      </div>
    )
  },
)
