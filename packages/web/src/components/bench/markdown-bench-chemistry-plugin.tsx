import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import { DecoratorNode } from "lexical"
import { createContext, useContext, type ReactElement, type ReactNode } from "react"
import type { NodeKey, SerializedLexicalNode, Spread } from "lexical"
import type { Code } from "mdast"
import { ChemistryDiagram } from "@/components/media/renderers/chemistry/chemistry-diagram"
import {
  chemistryFenceAccessibleLabel,
  parseChemistryFenceMetadata,
} from "@/components/media/renderers/chemistry/fence-metadata"
import {
  isChemistryFormat,
  type ChemistryFormat,
} from "@/components/media/renderers/chemistry/formats"

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

type BuddyChemistryPreviewProps = {
  format: ChemistryFormat
  meta: string | null
  source: string
}

export type MarkdownBenchChemistryViewOptions = {
  directory: string
}

const CHEMISTRY_IMPORT_PRIORITY = 100
const MarkdownBenchChemistryViewContext =
  createContext<MarkdownBenchChemistryViewOptions | null>(null)

export function MarkdownBenchChemistryViewProvider(props: {
  children: ReactNode
  value: MarkdownBenchChemistryViewOptions
}): ReactElement {
  return (
    <MarkdownBenchChemistryViewContext.Provider value={props.value}>
      {props.children}
    </MarkdownBenchChemistryViewContext.Provider>
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

export function BuddyChemistryPreview(props: BuddyChemistryPreviewProps): ReactElement {
  const viewOptions = useContext(MarkdownBenchChemistryViewContext)
  const fenceMetadata = parseChemistryFenceMetadata(props.meta ?? "")
  const accessibleLabel = chemistryFenceAccessibleLabel({
    format: props.format,
    source: props.source,
    alt: fenceMetadata.alt,
  })

  return (
    <div
      contentEditable={false}
      data-component="markdown-bench-chemistry"
      data-chemistry-format={props.format}
      className="my-4"
    >
      <div data-component="markdown-bench-chemistry-preview">
        <ChemistryDiagram
          source={props.source}
          format={props.format}
          directory={viewOptions?.directory}
          alt={accessibleLabel}
          className="min-h-56 w-full"
          showSourceOnError
        />
      </div>
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

  decorate(): ReactElement {
    return (
      <BuddyChemistryPreview
        format={this.getFormat()}
        meta={this.getMeta()}
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
