import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import { Button, Skeleton } from "@buddy/ui"
import { DecoratorNode } from "lexical"
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import type { LexicalEditor, NodeKey, SerializedLexicalNode, Spread } from "lexical"
import type { Code } from "mdast"
import { Alert, AlertDescription, AlertTitle } from "@buddy/ui/components/ui/alert"
import { ChemistryErrorBoundary } from "@/components/media/renderers/chemistry/chemistry-error-boundary"
import { ChemistryDiagram } from "@/components/media/renderers/chemistry/chemistry-diagram"
import {
  chemistryFenceAccessibleLabel,
  parseChemistryFenceMetadata,
} from "@/components/media/renderers/chemistry/fence-metadata"
import {
  chemistryFormatLabel,
  isChemistryFormat,
  type ChemistryFormat,
} from "@/components/media/renderers/chemistry/formats"
import { isKetcherChemistryFormat } from "@/components/bench/markdown-bench-chemistry-formats"

type SerializedBuddyChemistryNode = Spread<
  {
    format: ChemistryFormat
    language: string
    meta: string | null
    source: string
    type: "buddy-chemistry"
    version: 1
  },
  SerializedLexicalNode
>

type BuddyChemistryEditorProps = {
  editor: LexicalEditor
  format: ChemistryFormat
  meta: string | null
  node: BuddyChemistryNode
  source: string
}

export type MarkdownBenchChemistryPresentation = "interactive" | "static"

export type MarkdownBenchChemistryViewOptions = {
  directory: string
  documentPath: string
  presentation: MarkdownBenchChemistryPresentation
}

type StructureEditorRegistration = {
  key: NodeKey
  element: HTMLElement
}

type MarkdownBenchChemistryViewContextValue = MarkdownBenchChemistryViewOptions & {
  activeStructureEditorKey: NodeKey | null
  registerStructureEditor(key: NodeKey, element: HTMLElement | null): void
  releaseStructureEditor(key: NodeKey): void
  requestStructureEditor(key: NodeKey): boolean
}

type ChemistryEditingMode = "preview" | "source" | "structure"
type ChemistryFocusReturnTarget = "source" | "structure"

const CHEMISTRY_IMPORT_PRIORITY = 100
const CHEMISTRY_SOURCE_EDITOR_CLASS_NAME =
  "min-h-48 w-full resize-y rounded-md border border-border-base bg-background-stronger px-3 py-2 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
const MarkdownBenchChemistryViewContext =
  createContext<MarkdownBenchChemistryViewContextValue | null>(null)
const loadKetcherEditor = () => import("@/components/bench/markdown-bench-ketcher-editor")

function lazyKetcherEditorForAttempt(attempt: number) {
  void attempt
  return lazy(loadKetcherEditor)
}

function MarkdownBenchChemistryCoordinatorProvider(props: {
  children: ReactNode
  value: MarkdownBenchChemistryViewOptions
}): ReactElement {
  const [activeStructureEditorKey, setActiveStructureEditorKey] =
    useState<NodeKey | null>(null)
  const activeStructureEditorKeyRef = useRef<NodeKey | null>(null)
  const activeStructureEditorRegistrationRef =
    useRef<StructureEditorRegistration | null>(null)

  const registerStructureEditor = useCallback(
    (key: NodeKey, element: HTMLElement | null): void => {
      if (element) {
        activeStructureEditorRegistrationRef.current = { key, element }
        return
      }
      if (activeStructureEditorRegistrationRef.current?.key === key) {
        activeStructureEditorRegistrationRef.current = null
      }
    },
    [],
  )
  const releaseStructureEditor = useCallback((key: NodeKey): void => {
    if (activeStructureEditorKeyRef.current !== key) return
    activeStructureEditorKeyRef.current = null
    activeStructureEditorRegistrationRef.current = null
    setActiveStructureEditorKey(null)
  }, [])
  const requestStructureEditor = useCallback(
    (key: NodeKey): boolean => {
      if (props.value.presentation === "static") return false
      const activeKey = activeStructureEditorKeyRef.current
      if (activeKey && activeKey !== key) {
        const registration = activeStructureEditorRegistrationRef.current
        if (registration?.key === activeKey) {
          registration.element.scrollIntoView?.({ block: "nearest" })
          registration.element.focus({ preventScroll: true })
        }
        return false
      }
      activeStructureEditorKeyRef.current = key
      setActiveStructureEditorKey(key)
      return true
    },
    [props.value.presentation],
  )
  useEffect(() => {
    activeStructureEditorKeyRef.current = null
    activeStructureEditorRegistrationRef.current = null
    setActiveStructureEditorKey(null)
  }, [props.value.directory, props.value.documentPath, props.value.presentation])
  const contextValue = useMemo<MarkdownBenchChemistryViewContextValue>(
    () => ({
      ...props.value,
      activeStructureEditorKey,
      registerStructureEditor,
      releaseStructureEditor,
      requestStructureEditor,
    }),
    [
      activeStructureEditorKey,
      props.value,
      registerStructureEditor,
      releaseStructureEditor,
      requestStructureEditor,
    ],
  )

  return (
    <MarkdownBenchChemistryViewContext.Provider value={contextValue}>
      {props.children}
    </MarkdownBenchChemistryViewContext.Provider>
  )
}

export function MarkdownBenchChemistryViewProvider(props: {
  children: ReactNode
  value: MarkdownBenchChemistryViewOptions
}): ReactElement {
  return (
    <MarkdownBenchChemistryCoordinatorProvider value={props.value}>
      {props.children}
    </MarkdownBenchChemistryCoordinatorProvider>
  )
}

export function chemistryFormatFromFenceLanguage(
  language: string | null | undefined,
): ChemistryFormat | undefined {
  if (!language) return undefined
  const normalizedLanguage = language.toLowerCase()
  return isChemistryFormat(normalizedLanguage) ? normalizedLanguage : undefined
}

function isChemistryCodeNode(node: Code): boolean {
  return chemistryFormatFromFenceLanguage(node.lang) !== undefined
}

function preloadKetcherEditor(): void {
  if (typeof window === "undefined") return
  void loadKetcherEditor().catch(() => undefined)
}

function ChemistryEditorLoading(): ReactElement {
  return (
    <div className="flex h-96 flex-col gap-3 rounded-md border border-border-base bg-background-base p-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="min-h-0 flex-1 w-full" />
      <p className="text-xs text-text-weak">Loading the structure editor…</p>
    </div>
  )
}

export function BuddyChemistryEditor(props: BuddyChemistryEditorProps): ReactElement {
  const viewOptions = useContext(MarkdownBenchChemistryViewContext)
  const isStatic = viewOptions?.presentation === "static"
  const [editingMode, setEditingMode] = useState<ChemistryEditingMode>("preview")
  const [draft, setDraft] = useState(props.source)
  const [ketcherLoadAttempt, setKetcherLoadAttempt] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sourceTriggerRef = useRef<HTMLButtonElement>(null)
  const structureTriggerRef = useRef<HTMLButtonElement>(null)
  const structureRegionRef = useRef<HTMLDivElement>(null)
  const pendingFocusReturnRef = useRef<ChemistryFocusReturnTarget | null>(null)
  const editorKey = props.node.getKey()
  const formatLabel = chemistryFormatLabel(props.format)
  const fenceMetadata = useMemo(
    () => parseChemistryFenceMetadata(props.meta ?? ""),
    [props.meta],
  )
  const accessibleLabel = chemistryFenceAccessibleLabel({
    format: props.format,
    source: props.source,
    alt: fenceMetadata.alt,
  })
  const structureEditorIsActive =
    editingMode === "structure" &&
    (!viewOptions || viewOptions.activeStructureEditorKey === editorKey)
  const registerStructureEditor = viewOptions?.registerStructureEditor
  const releaseStructureEditor = viewOptions?.releaseStructureEditor
  const RetryableKetcherEditor = useMemo(
    () => lazyKetcherEditorForAttempt(ketcherLoadAttempt),
    [ketcherLoadAttempt],
  )

  useEffect(() => {
    setDraft(props.source)
  }, [props.source])

  useEffect(() => {
    if (editingMode !== "source") return
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [editingMode])

  useEffect(() => {
    if (editingMode !== "preview") return
    const focusTarget = pendingFocusReturnRef.current
    if (!focusTarget) return
    pendingFocusReturnRef.current = null
    const trigger =
      focusTarget === "structure" ? structureTriggerRef.current : sourceTriggerRef.current
    trigger?.focus()
  }, [editingMode])

  useEffect(() => {
    if (!structureEditorIsActive) return
    const region = structureRegionRef.current
    if (!region) return
    registerStructureEditor?.(editorKey, region)
    region.focus({ preventScroll: true })
    return () => registerStructureEditor?.(editorKey, null)
  }, [editorKey, registerStructureEditor, structureEditorIsActive])

  useEffect(
    () => () => {
      releaseStructureEditor?.(editorKey)
    },
    [editorKey, releaseStructureEditor],
  )

  const updateSource = (source: string) => {
    setDraft(source)
    props.editor.update(() => {
      props.node.setSource(source)
    })
  }

  const finishSourceEditing = (restoreFocus: boolean) => {
    if (restoreFocus) pendingFocusReturnRef.current = "source"
    setEditingMode("preview")
  }

  const handleSourceKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finishSourceEditing(true)
    }
    event.stopPropagation()
  }

  const returnToPreview = (
    focusTarget: ChemistryFocusReturnTarget,
    restoreFocus = true,
  ): void => {
    if (restoreFocus) pendingFocusReturnRef.current = focusTarget
    releaseStructureEditor?.(editorKey)
    setEditingMode("preview")
  }

  const saveStructure = (source: string): void => {
    updateSource(source)
    returnToPreview("structure")
  }

  const openStructureEditor = (): void => {
    if (viewOptions && !viewOptions.requestStructureEditor(editorKey)) return
    setEditingMode("structure")
  }

  const openSourceEditor = (): void => {
    setEditingMode("source")
  }

  const openSourceEditorFromStructure = (): void => {
    releaseStructureEditor?.(editorKey)
    setEditingMode("source")
  }

  const handleStructureKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return
    if (
      event.target instanceof Element &&
      event.target.closest('[role="dialog"], [aria-modal="true"]')
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    returnToPreview("structure")
  }

  return (
    <div
      contentEditable={false}
      data-component="markdown-bench-chemistry"
      data-chemistry-format={props.format}
      className="group/chemistry my-4"
    >
      {editingMode === "source" ? (
        <textarea
          ref={textareaRef}
          aria-label={`Edit ${formatLabel} source`}
          className={CHEMISTRY_SOURCE_EDITOR_CLASS_NAME}
          value={draft}
          onBlur={() => finishSourceEditing(false)}
          onChange={(event) => updateSource(event.currentTarget.value)}
          onKeyDown={handleSourceKeyDown}
        />
      ) : structureEditorIsActive && isKetcherChemistryFormat(props.format) ? (
        <div
          ref={structureRegionRef}
          role="region"
          tabIndex={-1}
          aria-label={`Edit ${formatLabel} chemistry structure`}
          data-component="markdown-bench-chemistry-structure-region"
          onKeyDown={handleStructureKeyDown}
        >
          <ChemistryErrorBoundary
            resetKeys={[props.format, props.source, ketcherLoadAttempt]}
            fallback={({ error, retry }) => (
              <div className="flex flex-col gap-3 rounded-md border border-border-base bg-background-base p-4">
                <Alert variant="destructive">
                  <AlertTitle>Structure editor unavailable</AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
                <details className="rounded-md border border-border-base bg-surface-weak">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-weak">
                    View preserved chemistry source
                  </summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border-base p-3 text-xs text-text-base">
                    <code>{props.source}</code>
                  </pre>
                </details>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => returnToPreview("structure")}
                  >
                    Back to preview
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openSourceEditorFromStructure}
                  >
                    Edit source
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setKetcherLoadAttempt((attempt) => attempt + 1)
                      retry()
                      structureRegionRef.current?.focus({ preventScroll: true })
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}
          >
            <Suspense fallback={<ChemistryEditorLoading />}>
              <RetryableKetcherEditor
                format={props.format}
                source={props.source}
                onCancel={() => returnToPreview("structure")}
                onSave={saveStructure}
              />
            </Suspense>
          </ChemistryErrorBoundary>
        </div>
      ) : (
        <div className="relative" data-component="markdown-bench-chemistry-preview">
          {isStatic ? null : (
            <div
              className="absolute right-1 top-1 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/chemistry:opacity-100 focus-within:opacity-100"
              data-markdown-export-ignore
            >
              {isKetcherChemistryFormat(props.format) ? (
                <Button
                  ref={structureTriggerRef}
                  type="button"
                  variant="ghost"
                  size="xs"
                  onMouseEnter={preloadKetcherEditor}
                  onFocus={preloadKetcherEditor}
                  onClick={openStructureEditor}
                >
                  Edit structure
                </Button>
              ) : null}
              <Button
                ref={sourceTriggerRef}
                type="button"
                variant="ghost"
                size="xs"
                onClick={openSourceEditor}
              >
                Edit source
              </Button>
            </div>
          )}
          <ChemistryDiagram
            source={props.source}
            format={props.format}
            directory={viewOptions?.directory}
            alt={accessibleLabel}
            className="min-h-56 w-full"
            showSourceOnError
          />
        </div>
      )}
    </div>
  )
}

export class BuddyChemistryNode extends DecoratorNode<ReactElement> {
  __format: ChemistryFormat
  __language: string
  __meta: string | null
  __source: string

  static getType(): string {
    return "buddy-chemistry"
  }

  static clone(node: BuddyChemistryNode): BuddyChemistryNode {
    return new BuddyChemistryNode(
      node.__format,
      node.__language,
      node.__source,
      node.__meta,
      node.__key,
    )
  }

  static importJSON(serializedNode: SerializedBuddyChemistryNode): BuddyChemistryNode {
    return new BuddyChemistryNode(
      serializedNode.format,
      serializedNode.language,
      serializedNode.source,
      serializedNode.meta,
    )
  }

  constructor(
    format: ChemistryFormat,
    language: string,
    source: string,
    meta: string | null,
    key?: NodeKey,
  ) {
    super(key)
    this.__format = format
    this.__language = language
    this.__source = source
    this.__meta = meta
  }

  exportJSON(): SerializedBuddyChemistryNode {
    return {
      ...super.exportJSON(),
      format: this.getFormat(),
      language: this.getLanguage(),
      meta: this.getMeta(),
      source: this.getSource(),
      type: "buddy-chemistry",
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  getFormat(): ChemistryFormat {
    return this.getLatest().__format
  }

  getLanguage(): string {
    return this.getLatest().__language
  }

  getMeta(): string | null {
    return this.getLatest().__meta
  }

  getSource(): string {
    return this.getLatest().__source
  }

  setSource(source: string): void {
    if (source !== this.getLatest().__source) {
      this.getWritable().__source = source
    }
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <BuddyChemistryEditor
        editor={editor}
        format={this.getFormat()}
        meta={this.getMeta()}
        node={this}
        source={this.getSource()}
      />
    )
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): true {
    return true
  }
}

function createBuddyChemistryNode(input: {
  format: ChemistryFormat
  language: string
  source: string
  meta: string | null
}): BuddyChemistryNode {
  return new BuddyChemistryNode(input.format, input.language, input.source, input.meta)
}

function isBuddyChemistryNode(node: unknown): node is BuddyChemistryNode {
  return node instanceof BuddyChemistryNode
}

const buddyChemistryImportVisitor: MdastImportVisitor<Code> = {
  priority: CHEMISTRY_IMPORT_PRIORITY,
  testNode(node) {
    return node.type === "code" && isChemistryCodeNode(node)
  },
  visitNode({ mdastNode, actions }) {
    const language = mdastNode.lang
    const format = chemistryFormatFromFenceLanguage(language)
    if (!language || !format) return
    actions.addAndStepInto(
      createBuddyChemistryNode({
        format,
        language,
        source: mdastNode.value,
        meta: mdastNode.meta ?? null,
      }),
    )
  },
}

const buddyChemistryExportVisitor: LexicalExportVisitor<BuddyChemistryNode, Code> = {
  testLexicalNode: isBuddyChemistryNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "code",
      lang: lexicalNode.getLanguage(),
      meta: lexicalNode.getMeta(),
      value: lexicalNode.getSource(),
    })
  },
}

export const buddyChemistryPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: BuddyChemistryNode,
      [addImportVisitor$]: buddyChemistryImportVisitor,
      [addExportVisitor$]: buddyChemistryExportVisitor,
    })
  },
})
