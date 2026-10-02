import {
  addExportVisitor$,
  addImportVisitor$,
  addMdastExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import {
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $setState,
  createState,
  type LexicalNode,
  type LineBreakNode,
} from "lexical"
import type { Break } from "mdast"
import type { CompileContext, Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Token } from "micromark-util-types"

const BEFORE_LIBRARY_VISITORS = 1
const BACKSLASH_STYLE = "backslash"
const TRAILING_SPACES_STYLE = "trailingSpaces"
const BACKSLASH_HARD_BREAK = "\\\n"
const TRAILING_SPACES_HARD_BREAK = "  \n"
const LINE_FEED = "\n"
const LEXICAL_LIST_ITEM_TYPE = "listitem"
const SPACE_OR_TAB_PATTERN = /[ \t]/u

type HardBreakStyle = typeof BACKSLASH_STYLE | typeof TRAILING_SPACES_STYLE

declare module "mdast" {
  interface BreakData {
    buddyHardBreakStyle?: HardBreakStyle
  }
}

const hardBreakStyleState = createState("buddyHardBreakStyle", {
  parse: (value) =>
    value === BACKSLASH_STYLE || value === TRAILING_SPACES_STYLE ? value : undefined,
})

function enterTrailingSpacesBreak(this: CompileContext, token: Token): void {
  this.enter({ type: "break", data: { buddyHardBreakStyle: TRAILING_SPACES_STYLE } }, token)
}

const trailingSpacesBreakMdastExtension: MdastExtension = {
  enter: {
    hardBreakTrailing: enterTrailingSpacesBreak,
  },
}

function stackHoldsAnyConstruct(
  stack: readonly string[],
  constructs: string | readonly string[] | null | undefined,
  whenNoneListed: boolean,
): boolean {
  const listedConstructs = [constructs ?? []].flat()
  if (listedConstructs.length === 0) return whenNoneListed
  return listedConstructs.some((construct) => stack.includes(construct))
}

const hardBreakToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    break(node: Break, _parent, state, info) {
      const lineEndingIsUnsafe = state.unsafe.some(
        (pattern) =>
          pattern.character === LINE_FEED &&
          stackHoldsAnyConstruct(state.stack, pattern.inConstruct, true) &&
          !stackHoldsAnyConstruct(state.stack, pattern.notInConstruct, false),
      )
      if (lineEndingIsUnsafe) return SPACE_OR_TAB_PATTERN.test(info.before) ? "" : " "
      return node.data?.buddyHardBreakStyle === TRAILING_SPACES_STYLE
        ? TRAILING_SPACES_HARD_BREAK
        : BACKSLASH_HARD_BREAK
    },
  },
}

function isUnmarkedLineBreak(node: LexicalNode | null): boolean {
  return $isLineBreakNode(node) && $getState(node, hardBreakStyleState) === undefined
}

function separatesParagraphsOfListItem(lineBreak: LineBreakNode): boolean {
  return (
    isUnmarkedLineBreak(lineBreak) &&
    lineBreak.getParent()?.getType() === LEXICAL_LIST_ITEM_TYPE &&
    (isUnmarkedLineBreak(lineBreak.getPreviousSibling()) ||
      isUnmarkedLineBreak(lineBreak.getNextSibling()))
  )
}

function exportsAsHardBreak(node: LexicalNode): node is LineBreakNode {
  return (
    $isLineBreakNode(node) && !separatesParagraphsOfListItem(node) && continuesOnTheNextLine(node)
  )
}

function continuesOnTheNextLine(lineBreak: LineBreakNode): boolean {
  const next = lineBreak.getNextSibling()
  if (next === null) return false
  if ($isLineBreakNode(next)) return exportsAsHardBreak(next)
  return !next.getTextContent().startsWith(LINE_FEED)
}

function hasTextEarlierOnItsLine(lineBreak: LineBreakNode): boolean {
  const previous = lineBreak.getPreviousSibling()
  if (previous === null || $isLineBreakNode(previous)) return false
  if (!$isTextNode(previous)) return true
  const textBeforeBreak = previous.getTextContent().split(LINE_FEED).at(-1) ?? ""
  return textBeforeBreak.trim() !== ""
}

function exportedHardBreak(lineBreak: LineBreakNode): Break {
  const style = $getState(lineBreak, hardBreakStyleState) ?? TRAILING_SPACES_STYLE
  if (style === TRAILING_SPACES_STYLE && hasTextEarlierOnItsLine(lineBreak)) {
    return { type: "break", data: { buddyHardBreakStyle: TRAILING_SPACES_STYLE } }
  }
  return { type: "break" }
}

const hardBreakImportVisitor: MdastImportVisitor<Break> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: "break",
  visitNode({ mdastNode, lexicalParent, actions }) {
    actions.nextVisitor()
    if (!$isElementNode(lexicalParent)) return
    const importedBreak = lexicalParent.getLastChild()
    if (!$isLineBreakNode(importedBreak)) return
    $setState(
      importedBreak,
      hardBreakStyleState,
      mdastNode.data?.buddyHardBreakStyle ?? BACKSLASH_STYLE,
    )
  },
}

const hardBreakExportVisitor: LexicalExportVisitor<LineBreakNode, Break> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: exportsAsHardBreak,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, exportedHardBreak(lexicalNode))
  },
}

export const buddyHardBreakPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addMdastExtension$]: trailingSpacesBreakMdastExtension,
      [addImportVisitor$]: hardBreakImportVisitor,
      [addExportVisitor$]: hardBreakExportVisitor,
      [addToMarkdownExtension$]: hardBreakToMarkdownExtension,
    })
  },
})
