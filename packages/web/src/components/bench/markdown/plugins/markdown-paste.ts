import {
  codeBlockEditorDescriptors$,
  createActiveEditorSubscription$,
  defaultCodeBlockLanguage$,
  directiveDescriptors$,
  importMdastTreeToLexical,
  importVisitors$,
  jsxComponentDescriptors$,
  mdastExtensions$,
  realmPlugin,
  rootEditor$,
  syntaxExtensions$,
} from "@mdxeditor/editor"
import { detectPlatform } from "@tanstack/react-hotkeys"
import {
  $addUpdateTag,
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  PASTE_TAG,
  isDOMNode,
  isExactShortcutMatch,
  isSelectionCapturedInDecoratorInput,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type PasteCommandType,
  type PointType,
  type RangeSelection,
} from "lexical"
import { fromMarkdown, type Extension as MdastExtension } from "mdast-util-from-markdown"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
} from "@/components/bench/markdown/compatibility"
import { readPastedMarkdown } from "@/lib/markdown-clipboard"

declare module "@mdxeditor/editor" {
  // 4.0.3 exports the parser's mdast extensions at runtime but leaves them out of its typings.
  export const mdastExtensions$: symbol & { valType: MdastExtension[] }
}

const LEXICAL_CLIPBOARD_TYPE = "application/x-lexical-editor"
const TABLE_CELL_SELECTOR = "td, th"
const ROOT_IMPORT_TYPE = "root"
const LEADING_SPACE_PATTERN = /^[\t ]+/u
const TRAILING_SPACE_PATTERN = /[\t ]+$/u
const LEADING_LINE_ENDING_PATTERN = /^[\t ]*\n/u
const TRAILING_LINE_ENDING_PATTERN = /\n[\t ]*$/u
const LITERAL_PASTE_KEY = "v"
const LITERAL_PASTE_MODIFIERS =
  detectPlatform() === "mac" ? { metaKey: true, shiftKey: true } : { ctrlKey: true, shiftKey: true }

// Mod+Shift+V pastes text as typed characters through the editor's own plain-text paste.
const literalPastes = new WeakSet<PasteCommandType>()

type MarkdownPastePluginParams = {
  documentFormat: MarkdownBenchDocumentFormat
}

function prepareFragment(markdown: string, documentFormat: MarkdownBenchDocumentFormat): string {
  // Pasted text lands mid-document, where a leading `---` block is a rule and a heading rather
  // than frontmatter; the leading line ending keeps every parser from reading it as frontmatter.
  const fragment = `\n${markdown}`
  return documentFormat === "mdx"
    ? prepareMdxForMdxEditor(fragment)
    : prepareMarkdownForMdxEditor(fragment)
}

type MarkdownPasteContext = {
  /** The pasted Markdown imported as a standalone document, or nothing when it does not parse. */
  $import(markdown: string): LexicalNode[]
  rootEditor(): LexicalEditor | null
}

function pasteClipboardData(event: PasteCommandType): DataTransfer | null {
  return "clipboardData" in event ? event.clipboardData : null
}

function capturedInDecoratorInput(event: Event): boolean {
  return isDOMNode(event.target) && isSelectionCapturedInDecoratorInput(event.target)
}

function $inInlineCode(selection: RangeSelection): boolean {
  const anchor = selection.anchor.getNode()
  return selection.hasFormat("code") || ($isTextNode(anchor) && anchor.hasFormat("code"))
}

function $blockAround(node: LexicalNode): ElementNode | null {
  let current: LexicalNode | null = node
  while (current && !($isElementNode(current) && !current.isInline())) current = current.getParent()
  return current
}

function $blockHasTextBeside(point: PointType, side: "before" | "after"): boolean {
  const block = $blockAround(point.getNode())
  if (!block) return false
  const range = $createRangeSelection()
  const blockEdge = side === "before" ? 0 : block.getChildrenSize()
  range.anchor.set(block.getKey(), blockEdge, "element")
  range.focus.set(point.key, point.offset, point.type)
  return range.getTextContent().length > 0
}

/**
 * Inserts imported blocks the way the pasted text reads in Markdown source: edge spaces still
 * separate words, and a line ending at either edge starts or ends a block.
 */
function $insertPastedNodes(input: {
  markdown: string
  nodes: LexicalNode[]
  selection: RangeSelection
  inRootEditor: boolean
}) {
  const { markdown, nodes, selection } = input
  const [start, end] = selection.isBackward()
    ? [selection.focus, selection.anchor]
    : [selection.anchor, selection.focus]
  const textBefore = $blockHasTextBeside(start, "before")
  const textAfter = $blockHasTextBeside(end, "after")
  const first = nodes[0]
  const last = nodes.at(-1)
  const leading = LEADING_SPACE_PATTERN.exec(markdown)?.[0]
  if (leading && textBefore && $isParagraphNode(first)) {
    first.splice(0, 0, [$createTextNode(leading)])
  }
  const trailing = TRAILING_SPACE_PATTERN.exec(markdown)?.[0]
  if (trailing && textAfter && $isParagraphNode(last)) last.append($createTextNode(trailing))

  const startsBlock = textBefore && LEADING_LINE_ENDING_PATTERN.test(markdown)
  if (startsBlock) selection.insertParagraph()
  $getSelection()?.insertNodes(nodes)
  if (textAfter) {
    const afterPaste = $getSelection()
    if ($isRangeSelection(afterPaste) && TRAILING_LINE_ENDING_PATTERN.test(markdown)) {
      afterPaste.insertParagraph()
    }
    return
  }
  // Inserting blocks after text splits the caret's block, and a trailing list or other
  // non-paragraph block leaves the split's empty remainder behind as a stray blank line. The
  // document's last paragraph stays so there is somewhere to type below the paste.
  if (!textBefore || startsBlock || $isParagraphNode(last)) return
  const remainder = last?.getNextSibling()
  if (!$isParagraphNode(remainder) || !remainder.isEmpty()) return
  if (
    input.inRootEditor &&
    remainder.getNextSibling() === null &&
    $isRootNode(remainder.getParent())
  ) {
    return
  }
  remainder.remove()
}

function registerMarkdownPaste(editor: LexicalEditor, context: MarkdownPasteContext): () => void {
  const unregisterPaste = editor.registerCommand(
    PASTE_COMMAND,
    (event) => {
      if (literalPastes.has(event) || capturedInDecoratorInput(event)) return false
      const clipboardData = pasteClipboardData(event)
      if (
        !clipboardData ||
        clipboardData.files.length > 0 ||
        clipboardData.types.includes(LEXICAL_CLIPBOARD_TYPE)
      ) {
        return false
      }
      const markdown = readPastedMarkdown(clipboardData)
      const selection = $getSelection()
      if (markdown === undefined || !$isRangeSelection(selection) || $inInlineCode(selection)) {
        return false
      }

      const nodes = context.$import(markdown)
      if (nodes.length === 0) return false
      // A table cell saves one line of inline content, so blocks pasted there would be lost.
      const inTableCell = editor.getRootElement()?.closest(TABLE_CELL_SELECTOR) != null
      if (inTableCell && !(nodes.length === 1 && $isParagraphNode(nodes[0]))) return false

      event.preventDefault()
      $addUpdateTag(PASTE_TAG)
      $insertPastedNodes({
        markdown,
        nodes,
        selection,
        inRootEditor: context.rootEditor() === editor,
      })
      return true
    },
    COMMAND_PRIORITY_LOW,
  )

  const unregisterLiteralPasteKey = editor.registerCommand(
    KEY_DOWN_COMMAND,
    (event) => {
      if (!isExactShortcutMatch(event, LITERAL_PASTE_KEY, LITERAL_PASTE_MODIFIERS)) return false
      if (capturedInDecoratorInput(event) || !("clipboard" in navigator)) return false

      event.preventDefault()
      void navigator.clipboard.readText().then(
        (text) => {
          if (!text) return
          const clipboardData = new DataTransfer()
          clipboardData.setData("text/plain", text)
          const paste = new ClipboardEvent("paste", { clipboardData })
          literalPastes.add(paste)
          editor.dispatchCommand(PASTE_COMMAND, paste)
        },
        () => undefined,
      )
      return true
    },
    COMMAND_PRIORITY_LOW,
  )

  return () => {
    unregisterPaste()
    unregisterLiteralPasteKey()
  }
}

/**
 * Pastes plain text as Markdown, the way a Markdown source editor would show it, instead of
 * inserting its syntax as literal characters that the serializer then escapes.
 */
export const buddyMarkdownPastePlugin = realmPlugin<MarkdownPastePluginParams>({
  init(realm, params) {
    const documentFormat = params?.documentFormat ?? "markdown"
    const context: MarkdownPasteContext = {
      $import(markdown) {
        const nodes: LexicalNode[] = []
        try {
          const mdastRoot = fromMarkdown(prepareFragment(markdown, documentFormat), {
            extensions: realm.getValue(syntaxExtensions$),
            mdastExtensions: realm.getValue(mdastExtensions$),
          })
          importMdastTreeToLexical({
            root: {
              append: (node) => nodes.push(node),
              getType: () => ROOT_IMPORT_TYPE,
            },
            mdastRoot,
            visitors: realm.getValue(importVisitors$),
            jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$),
            directiveDescriptors: realm.getValue(directiveDescriptors$),
            codeBlockEditorDescriptors: realm.getValue(codeBlockEditorDescriptors$),
            defaultCodeBlockLanguage: realm.getValue(defaultCodeBlockLanguage$),
          })
        } catch {
          return []
        }
        return nodes
      },
      rootEditor: () => realm.getValue(rootEditor$),
    }
    realm.pub(createActiveEditorSubscription$, (editor) => registerMarkdownPaste(editor, context))
  },
})
