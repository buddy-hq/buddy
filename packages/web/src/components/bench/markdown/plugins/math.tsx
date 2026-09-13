import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import { mathFromMarkdown, mathToMarkdown, type InlineMath, type Math } from "mdast-util-math"
import { math } from "micromark-extension-math"
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react"
import { renderBuddyMathToHtml } from "@/components/markdown/markdown-math"

type SerializedBuddyMathNode = Spread<
  {
    displayMode: boolean
    type: "buddy-math"
    value: string
    version: 1
  },
  SerializedLexicalNode
>

type BuddyMathEditorProps = {
  displayMode: boolean
  editor: LexicalEditor
  node: BuddyMathNode
  value: string
}

function BuddyMathEditor(props: BuddyMathEditorProps): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.value)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const html = useMemo(
    () => renderBuddyMathToHtml(props.value, props.displayMode),
    [props.displayMode, props.value],
  )

  useEffect(() => {
    setDraft(props.value)
  }, [props.value])

  useEffect(() => {
    if (editing) {
      const editor = props.displayMode ? textareaRef.current : inputRef.current
      editor?.focus()
      editor?.select()
    }
  }, [editing, props.displayMode])

  const updateValue = (value: string) => {
    setDraft(value)
    props.editor.update(() => {
      props.node.setValue(value)
    })
  }

  const finishEditing = () => {
    setEditing(false)
  }

  const inputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      finishEditing()
    }
    event.stopPropagation()
  }

  const activateEditor = () => {
    setEditing(true)
  }

  const renderedMathKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    activateEditor()
  }

  if (props.displayMode) {
    return (
      <div
        contentEditable={false}
        data-component="markdown-bench-math"
        data-display="block"
        className="group/math my-4 overflow-x-auto py-1"
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            aria-label="Edit display math"
            className="min-h-20 w-full resize-y rounded border border-border-base bg-background-stronger px-3 py-2 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
            value={draft}
            onBlur={finishEditing}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onKeyDown={inputKeyDown}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            className="block w-full cursor-text bg-transparent text-inherit"
            title="Edit equation"
            onClick={activateEditor}
            onKeyDown={renderedMathKeyDown}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    )
  }

  return (
    <span
      contentEditable={false}
      data-component="markdown-bench-math"
      data-display="inline"
      className="inline-block align-baseline"
    >
      {editing ? (
        <input
          ref={inputRef}
          aria-label="Edit inline math"
          className="min-w-32 rounded border border-border-base bg-background-stronger px-1.5 py-0.5 font-mono text-[13px] text-text-base outline-none focus:border-border-interactive-base"
          value={draft}
          onBlur={finishEditing}
          onChange={(event) => updateValue(event.currentTarget.value)}
          onKeyDown={inputKeyDown}
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          className="cursor-text bg-transparent p-0 text-inherit"
          title="Edit equation"
          onClick={activateEditor}
          onKeyDown={renderedMathKeyDown}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </span>
  )
}

export class BuddyMathNode extends DecoratorNode<ReactElement> {
  mathDisplayMode: boolean
  latexSource: string

  static getType(): string {
    return "buddy-math"
  }

  static clone(node: BuddyMathNode): BuddyMathNode {
    return new BuddyMathNode(node.latexSource, node.mathDisplayMode, node.getKey())
  }

  static importJSON(serializedNode: SerializedBuddyMathNode): BuddyMathNode {
    return new BuddyMathNode(serializedNode.value, serializedNode.displayMode)
  }

  constructor(value: string, displayMode: boolean, key?: NodeKey) {
    super(key)
    this.latexSource = value
    this.mathDisplayMode = displayMode
  }

  exportJSON(): SerializedBuddyMathNode {
    return {
      ...super.exportJSON(),
      displayMode: this.getDisplayMode(),
      type: "buddy-math",
      value: this.getValue(),
      version: 1,
    }
  }

  createDOM(): HTMLElement {
    return document.createElement(this.mathDisplayMode ? "div" : "span")
  }

  updateDOM(previousNode: BuddyMathNode, dom: HTMLElement, _config: EditorConfig): boolean {
    const expectedTagName = this.mathDisplayMode ? "DIV" : "SPAN"
    return previousNode.mathDisplayMode !== this.mathDisplayMode || dom.tagName !== expectedTagName
  }

  getValue(): string {
    return this.getLatest().latexSource
  }

  setValue(value: string): void {
    if (value !== this.latexSource) {
      this.getWritable().latexSource = value
    }
  }

  getDisplayMode(): boolean {
    return this.getLatest().mathDisplayMode
  }

  decorate(editor: LexicalEditor): ReactElement {
    return (
      <BuddyMathEditor
        displayMode={this.getDisplayMode()}
        editor={editor}
        node={this}
        value={this.getValue()}
      />
    )
  }

  isInline(): boolean {
    return !this.mathDisplayMode
  }
}

function createBuddyMathNode(value: string, displayMode: boolean): BuddyMathNode {
  return new BuddyMathNode(value, displayMode)
}

function isBuddyMathNode(node: LexicalNode | null | undefined): node is BuddyMathNode {
  return node instanceof BuddyMathNode
}

const buddyMathImportVisitor: MdastImportVisitor<Math | InlineMath> = {
  testNode(node) {
    return node.type === "math" || node.type === "inlineMath"
  },
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(createBuddyMathNode(mdastNode.value, mdastNode.type === "math"))
  },
}

const buddyMathExportVisitor: LexicalExportVisitor<BuddyMathNode, Math | InlineMath> = {
  testLexicalNode: isBuddyMathNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    if (lexicalNode.getDisplayMode()) {
      actions.appendToParent(mdastParent, {
        type: "math",
        value: lexicalNode.getValue(),
      })
      return
    }

    actions.appendToParent(mdastParent, {
      type: "inlineMath",
      value: lexicalNode.getValue(),
    })
  },
}

export const buddyMathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: math({ singleDollarTextMath: true }),
      [addMdastExtension$]: mathFromMarkdown(),
      [addLexicalNode$]: BuddyMathNode,
      [addImportVisitor$]: buddyMathImportVisitor,
      [addExportVisitor$]: buddyMathExportVisitor,
      [addToMarkdownExtension$]: mathToMarkdown({ singleDollarTextMath: true }),
    })
  },
})
