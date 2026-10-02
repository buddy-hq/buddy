import {
  addImportVisitor$,
  addMdastExtension$,
  realmPlugin,
  type DirectiveEditorProps,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  type ElementNode,
} from "lexical"
import type { CompileContext, Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Token } from "micromark-util-types"

type ProseDirectiveNode = Extract<
  DirectiveEditorProps["mdastNode"],
  { type: "textDirective" | "leafDirective" }
>

const PROSE_DIRECTIVE_MARKERS = {
  textDirective: ":",
  leafDirective: "::",
} as const

function isProseDirectiveNode(node: { type: string }): node is ProseDirectiveNode {
  return node.type === "textDirective" || node.type === "leafDirective"
}

declare module "mdast" {
  interface Data {
    buddyDirectiveAttributesSource?: string
  }
}

declare module "mdast-util-from-markdown" {
  interface CompileData {
    buddyDirectiveAttributesStart?: Token["start"] | undefined
  }
}

function lastProseDirective(stack: readonly { type: string }[]): ProseDirectiveNode | undefined {
  return stack.findLast(isProseDirectiveNode)
}

function exitAttributesMarker(this: CompileContext, token: Token): void {
  const opening = this.data.buddyDirectiveAttributesStart
  if (opening === undefined) {
    this.data.buddyDirectiveAttributesStart = token.start
    return
  }
  this.data.buddyDirectiveAttributesStart = undefined
  const directive = lastProseDirective(this.stack)
  if (!directive) return
  directive.data = {
    ...directive.data,
    buddyDirectiveAttributesSource: this.sliceSerialize({ start: opening, end: token.end }),
  }
}

const directiveAttributesSourceMdastExtension: MdastExtension = {
  exit: {
    directiveTextAttributesMarker: exitAttributesMarker,
    directiveLeafAttributesMarker: exitAttributesMarker,
  },
}

type MdastSiblings = { children: readonly { type: string }[] } | null

function $createFormattedTextNode(value: string, format: number, style: string) {
  const node = $createTextNode(value).setFormat(format)
  return style === "" ? node : node.setStyle(style)
}

function siblingType(
  mdastNode: ProseDirectiveNode,
  mdastParent: MdastSiblings,
  offset: -1 | 1,
): string | undefined {
  const index = mdastParent?.children.indexOf(mdastNode) ?? -1
  return index < 0 ? undefined : mdastParent?.children[index + offset]?.type
}

function $appendParagraphBreak(lexicalParent: ElementNode) {
  lexicalParent.append($createLineBreakNode(), $createLineBreakNode())
}

function $proseDirectiveContainer(
  mdastNode: ProseDirectiveNode,
  mdastParent: MdastSiblings,
  lexicalParent: ElementNode,
): ElementNode {
  if (mdastNode.type === "textDirective") return lexicalParent
  if (lexicalParent.getType() !== "listitem") {
    const paragraph = $createParagraphNode()
    lexicalParent.append(paragraph)
    return paragraph
  }
  const previousType = siblingType(mdastNode, mdastParent, -1)
  if (previousType === "paragraph" || previousType === "leafDirective") {
    $appendParagraphBreak(lexicalParent)
  }
  return lexicalParent
}

const proseDirectiveImportVisitor: MdastImportVisitor<ProseDirectiveNode> = {
  testNode: isProseDirectiveNode,
  visitNode({ mdastNode, mdastParent, lexicalParent, actions }) {
    if (!$isElementNode(lexicalParent)) return
    const container = $proseDirectiveContainer(mdastNode, mdastParent, lexicalParent)
    const format = actions.getParentFormatting()
    const style = actions.getParentStyle()

    const opening = `${PROSE_DIRECTIVE_MARKERS[mdastNode.type]}${mdastNode.name}`
    const attributes = mdastNode.data?.buddyDirectiveAttributesSource ?? ""
    if (mdastNode.children.length === 0) {
      container.append($createFormattedTextNode(`${opening}${attributes}`, format, style))
    } else {
      container.append($createFormattedTextNode(`${opening}[`, format, style))
      actions.addFormatting(0)
      actions.visitChildren(mdastNode, container)
      container.append($createFormattedTextNode(`]${attributes}`, format, style))
    }
    if (
      mdastNode.type === "leafDirective" &&
      container === lexicalParent &&
      siblingType(mdastNode, mdastParent, 1) === "paragraph"
    ) {
      $appendParagraphBreak(container)
    }
  },
}

export const buddyProseDirectivePlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addMdastExtension$]: directiveAttributesSourceMdastExtension,
      [addImportVisitor$]: proseDirectiveImportVisitor,
    })
  },
})
