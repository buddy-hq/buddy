import {
  addExportVisitor$,
  addImportVisitor$,
  addToMarkdownExtension$,
  IS_BOLD,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import { $getState, $isElementNode, $setState, createState, type LexicalNode } from "lexical"
import { z } from "zod"
import type { Delete, Emphasis, Nodes, PhrasingContent, Root, RootContent, Strong } from "mdast"

type FormattingNode = Strong | Emphasis | Delete

const FORMATTING_TYPES = new Set(["strong", "emphasis", "delete"])
const FORMATTING_MASK = IS_BOLD | IS_ITALIC | IS_STRIKETHROUGH
const BEFORE_INLINE_VISITORS = 2
const INLINE_IMPORT_TYPES = new Set([
  "inlineMath",
  "link",
  "image",
  "obsidianWikiLink",
  "inlineCode",
  "break",
  "buddyRawHtmlText",
])
const inheritedFormattingSchema = z.number().int().min(0).max(FORMATTING_MASK)
const inheritedFormattingState = createState("buddyInlineFormatting", {
  parse: (value) => {
    const result = inheritedFormattingSchema.safeParse(value)
    return result.success ? result.data : 0
  },
})
const PHRASING_TYPES = new Set([
  "break",
  "buddyAutolink",
  "buddyRawHtmlText",
  "delete",
  "emphasis",
  "footnoteReference",
  "html",
  "image",
  "imageReference",
  "inlineCode",
  "inlineMath",
  "link",
  "linkReference",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "obsidianWikiLink",
  "strong",
  "text",
  "textDirective",
])

function isPhrasingContent(node: RootContent): node is PhrasingContent {
  return PHRASING_TYPES.has(node.type)
}

function isFormattingNode(node: PhrasingContent | undefined): node is FormattingNode {
  return node !== undefined && FORMATTING_TYPES.has(node.type)
}

function joinFormattingRuns(children: PhrasingContent[]) {
  let index = 1
  while (index < children.length) {
    const before = children[index - 1]
    const after = children[index]
    if (isFormattingNode(before) && isFormattingNode(after) && before.type === after.type) {
      before.children.push(...after.children)
      children.splice(index, 1)
      continue
    }
    index += 1
  }
}

const inlineFormattingImportVisitor: MdastImportVisitor<Nodes> = {
  priority: BEFORE_INLINE_VISITORS,
  testNode: (node) => INLINE_IMPORT_TYPES.has(node.type),
  visitNode({ lexicalParent, mdastNode, actions }) {
    const format = actions.getParentFormatting() & FORMATTING_MASK
    if (!format || !$isElementNode(lexicalParent)) {
      actions.nextVisitor()
      return
    }
    if ("children" in mdastNode) {
      // MDXEditor's link visitor does not pass the surrounding formatting to its label.
      const bit = format & IS_BOLD ? IS_BOLD : format & IS_ITALIC ? IS_ITALIC : IS_STRIKETHROUGH
      actions.addFormatting(bit, mdastNode)
    }
    const index = lexicalParent.getChildrenSize()
    actions.nextVisitor()
    const imported = lexicalParent.getChildAtIndex(index)
    if (imported) $setState(imported, inheritedFormattingState, format)
  },
}

function currentInheritedFormatting(node: LexicalNode): number {
  // Auto-links are created by Lexical after import, so use their label's formatting.
  const inherited =
    node.getType() === "autolink" ? FORMATTING_MASK : $getState(node, inheritedFormattingState)
  if (!$isElementNode(node)) return inherited
  // Link labels can be reformatted after import; their current text wins.
  return node.getAllTextNodes().reduce((format, text) => format & text.getFormat(), inherited)
}

function unwrapFormatting(children: PhrasingContent[], types: Set<string>): PhrasingContent[] {
  return children.flatMap((child) => {
    if (!("children" in child)) return [child]
    const unwrapped = unwrapFormatting(child.children, types)
    return types.has(child.type) ? unwrapped : [{ ...child, children: unwrapped }]
  })
}

const inlineFormattingExportVisitor: LexicalExportVisitor<LexicalNode, RootContent> = {
  priority: BEFORE_INLINE_VISITORS,
  shouldJoin: (before, after) => FORMATTING_TYPES.has(before.type) && before.type === after.type,
  join(before, after) {
    if (!("children" in before) || !("children" in after)) return before
    const joined = { ...before, children: [...before.children, ...after.children] }
    // Join nested wrappers before MDXEditor moves their surrounding spaces out.
    joinFormattingAroundInlineNodes(joined)
    return joined
  },
  testLexicalNode: (node): node is LexicalNode => currentInheritedFormatting(node) !== 0,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    const start = mdastParent.children.length
    actions.nextVisitor()
    const emitted = mdastParent.children.slice(start)
    if (emitted.length === 0 || !emitted.every(isPhrasingContent)) return
    const format = currentInheritedFormatting(lexicalNode)
    const types: FormattingNode["type"][] = []
    if (format & IS_ITALIC) types.push("emphasis")
    if (format & IS_BOLD) types.push("strong")
    if (format & IS_STRIKETHROUGH) types.push("delete")
    let children = unwrapFormatting(emitted, new Set(types))
    for (const type of types.toReversed()) children = [{ type, children }]
    mdastParent.children.splice(start)
    for (const child of children) actions.appendToParent(mdastParent, child)
  },
}

export function joinFormattingAroundInlineNodes(node: Nodes) {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "tableCell":
    case "strong":
    case "emphasis":
    case "delete":
    case "link":
    case "linkReference":
    case "buddyAutolink":
      joinFormattingRuns(node.children)
      break
    default:
      break
  }
  if ("children" in node) {
    for (const child of node.children) joinFormattingAroundInlineNodes(child)
  }
}

function serializeRoot(
  node: Root,
  state: Parameters<NonNullable<NonNullable<ToMarkdownExtension["handlers"]>["root"]>>[2],
  info: Parameters<NonNullable<NonNullable<ToMarkdownExtension["handlers"]>["root"]>>[3],
) {
  joinFormattingAroundInlineNodes(node)
  const phrasing = node.children.filter(isPhrasingContent)
  if (phrasing.length > 0 && phrasing.length === node.children.length) {
    return state.containerPhrasing({ type: "paragraph", children: phrasing }, info)
  }
  return state.containerFlow(node, info)
}

export const formattingRunsToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    root(node, _parent, state, info) {
      return serializeRoot(node, state, info)
    },
  },
}

export const buddyFormattingRunsPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addImportVisitor$]: inlineFormattingImportVisitor,
      [addExportVisitor$]: inlineFormattingExportVisitor,
      [addToMarkdownExtension$]: formattingRunsToMarkdownExtension,
    })
  },
})
