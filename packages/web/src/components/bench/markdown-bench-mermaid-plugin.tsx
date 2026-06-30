import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import { DecoratorNode } from "lexical"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import type { LexicalEditor, NodeKey, SerializedLexicalNode, Spread } from "lexical"
import type { Code } from "mdast"
import { Button } from "@buddy/ui"
import { MermaidDiagram } from "@/components/media/renderers/mermaid/mermaid-diagram"
import type { MermaidThemeConfig } from "@/components/media/renderers/mermaid/lib/theme"

type SerializedBuddyMermaidNode = Spread<
  {
    meta: string
    source: string
    type: "buddy-mermaid"
    version: 1
  },
  SerializedLexicalNode
>

type BuddyMermaidEditorProps = {
  editor: LexicalEditor
  node: BuddyMermaidNode
  source: string
}

export type MarkdownBenchMermaidPresentation = "interactive" | "static"

export type MarkdownBenchMermaidViewOptions = {
  presentation: MarkdownBenchMermaidPresentation
  themeConfig: MermaidThemeConfig
}

const MERMAID_LANGUAGE = "mermaid"
const MERMAID_IMPORT_PRIORITY = 100
const MarkdownBenchMermaidViewContext = createContext<MarkdownBenchMermaidViewOptions | null>(null)

export function MarkdownBenchMermaidViewProvider(props: {
  children: ReactNode
  value: MarkdownBenchMermaidViewOptions
}): ReactElement {
  return (
    <MarkdownBenchMermaidViewContext.Provider value={props.value}>
      {props.children}
    </MarkdownBenchMermaidViewContext.Provider>
  )
}

function isMermaidCodeNode(node: Code): boolean {
  return node.lang?.toLowerCase() === MERMAID_LANGUAGE
}

function BuddyMermaidEditor(props: BuddyMermaidEditorProps): ReactElement {
  const viewOptions = useContext(MarkdownBenchMermaidViewContext)
  const presentation = viewOptions?.presentation ?? "interactive"
  const isStatic = presentation === "static"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.source)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(props.source)
  }, [props.source])

  useEffect(() => {
    if (!editing) return
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [editing])

  const updateSource = (source: string) => {
    setDraft(source)
    props.editor.update(() => {
      props.node.setSource(source)
    })
  }

  const finishEditing = () => {
    setEditing(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finishEditing()
    }
    event.stopPropagation()
  }

  return (
    <figure
      contentEditable={false}
      data-component="markdown-bench-mermaid"
      className="group/mermaid my-4"
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          aria-label="Edit Mermaid diagram"
          className="min-h-48 w-full resize-y rounded-md border border-border-base bg-background-stronger px-3 py-2 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
          value={draft}
          onBlur={finishEditing}
          onChange={(event) => updateSource(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className="rounded-md border border-border-weaker-base bg-surface-weak/25 p-3">
          {isStatic ? null : (
            <div
              className="mb-2 flex items-center justify-between gap-2"
              data-markdown-export-ignore
            >
              <figcaption className="text-xs font-medium text-text-weak">
                Mermaid diagram
              </figcaption>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="opacity-0 transition-opacity group-hover/mermaid:opacity-100 focus-visible:opacity-100"
                onClick={() => setEditing(true)}
              >
                Edit source
              </Button>
            </div>
          )}
          <MermaidDiagram
            source={props.source}
            alt="Mermaid diagram"
            className={isStatic ? "w-full" : "h-[28rem] min-h-80"}
            presentation={presentation}
            themeConfig={viewOptions?.themeConfig}
            hideFullscreenAction
            minimalActions
            showRawSourceOnError
            hideLoadingPlaceholder={false}
          />
        </div>
      )}
    </figure>
  )
}

export class BuddyMermaidNode extends DecoratorNode<ReactElement> {
  __meta: string
  __source: string

  static getType(): string {
    return "buddy-mermaid"
  }

  static clone(node: BuddyMermaidNode): BuddyMermaidNode {
    return new BuddyMermaidNode(node.__source, node.__meta, node.__key)
  }

  static importJSON(serializedNode: SerializedBuddyMermaidNode): BuddyMermaidNode {
    return new BuddyMermaidNode(serializedNode.source, serializedNode.meta)
  }

  constructor(source: string, meta: string, key?: NodeKey) {
    super(key)
    this.__source = source
    this.__meta = meta
  }

  exportJSON(): SerializedBuddyMermaidNode {
    return {
      ...super.exportJSON(),
      meta: this.getMeta(),
      source: this.getSource(),
      type: "buddy-mermaid",
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement("div")
  }

  updateDOM(): false {
    return false
  }

  getMeta(): string {
    return this.getLatest().__meta
  }

  getSource(): string {
    return this.getLatest().__source
  }

  setSource(source: string): void {
    if (source !== this.__source) {
      this.getWritable().__source = source
    }
  }

  decorate(editor: LexicalEditor): ReactElement {
    return <BuddyMermaidEditor editor={editor} node={this} source={this.getSource()} />
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): true {
    return true
  }
}

function createBuddyMermaidNode(source: string, meta: string): BuddyMermaidNode {
  return new BuddyMermaidNode(source, meta)
}

function isBuddyMermaidNode(node: unknown): node is BuddyMermaidNode {
  return node instanceof BuddyMermaidNode
}

const buddyMermaidImportVisitor: MdastImportVisitor<Code> = {
  priority: MERMAID_IMPORT_PRIORITY,
  testNode(node) {
    return node.type === "code" && isMermaidCodeNode(node)
  },
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(createBuddyMermaidNode(mdastNode.value, mdastNode.meta ?? ""))
  },
}

const buddyMermaidExportVisitor: LexicalExportVisitor<BuddyMermaidNode, Code> = {
  testLexicalNode: isBuddyMermaidNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: "code",
      lang: MERMAID_LANGUAGE,
      meta: lexicalNode.getMeta() || null,
      value: lexicalNode.getSource(),
    })
  },
}

export const buddyMermaidPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: BuddyMermaidNode,
      [addImportVisitor$]: buddyMermaidImportVisitor,
      [addExportVisitor$]: buddyMermaidExportVisitor,
    })
  },
})
