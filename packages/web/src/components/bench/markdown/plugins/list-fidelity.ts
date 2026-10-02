import {
  addExportVisitor$,
  addImportVisitor$,
  createActiveEditorSubscription$,
  createRootEditorSubscription$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor"
import {
  $getState,
  $isElementNode,
  $setState,
  createState,
  getRegisteredNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical"
import type { List, ListItem } from "mdast"

const LEXICAL_LIST_TYPE = "list"
const LEXICAL_LIST_ITEM_TYPE = "listitem"
const NUMBERED_LIST = "number"
const TASK_LIST = "check"
const DEFAULT_LIST_START = 1
const BEFORE_LIBRARY_VISITORS = 1

type LexicalListNode = ElementNode & {
  getListType(): "bullet" | "check" | "number"
  getStart(): number
  setStart(start: number): LexicalListNode
}

type LexicalListItemNode = ElementNode & {
  getChecked(): boolean | undefined
}

const plainItemInTaskListState = createState("buddyPlainItemInTaskList", {
  parse: (value) => value === true,
})

const blankLineSpreadState = createState("buddyBlankLineSpread", {
  parse: (value) => value === true,
})

function isLexicalListNode(node: LexicalNode | null | undefined): node is LexicalListNode {
  return $isElementNode(node) && node.getType() === LEXICAL_LIST_TYPE
}

function isLexicalListItemNode(node: LexicalNode | null | undefined): node is LexicalListItemNode {
  return $isElementNode(node) && node.getType() === LEXICAL_LIST_ITEM_TYPE
}

function readNumberedListStart(list: List): number | undefined {
  if (list.ordered !== true) return undefined
  if (list.start === null || list.start === undefined) return undefined
  return list.start === DEFAULT_LIST_START ? undefined : list.start
}

function findTopLevelListImportedInto(lexicalParent: LexicalNode): LexicalListNode | undefined {
  if (!$isElementNode(lexicalParent) || isLexicalListItemNode(lexicalParent)) return undefined
  const lastChild = lexicalParent.getLastChild()
  return isLexicalListNode(lastChild) ? lastChild : undefined
}

function findNestedListImportedInto(
  lexicalParent: LexicalListItemNode,
): LexicalListNode | undefined {
  const holder = lexicalParent.getNextSibling()
  if (!isLexicalListItemNode(holder)) return undefined
  const nestedList = holder.getFirstChild()
  return isLexicalListNode(nestedList) ? nestedList : undefined
}

function findListImportedInto(lexicalParent: LexicalNode): LexicalListNode | undefined {
  return isLexicalListItemNode(lexicalParent)
    ? findNestedListImportedInto(lexicalParent)
    : findTopLevelListImportedInto(lexicalParent)
}

function holdsOnlyNestedList(listItem: LexicalListItemNode): boolean {
  return listItem.getChildrenSize() === 1 && isLexicalListNode(listItem.getFirstChild())
}

const numberedListStartImportVisitor: MdastImportVisitor<List> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: (node) => node.type === "list" && readNumberedListStart(node) !== undefined,
  visitNode({ mdastNode, lexicalParent, actions }) {
    actions.nextVisitor()
    const start = readNumberedListStart(mdastNode)
    const importedList = findTopLevelListImportedInto(lexicalParent)
    if (start === undefined || importedList?.getListType() !== NUMBERED_LIST) return
    importedList.setStart(start)
  },
}

const numberedListStartExportVisitor: LexicalExportVisitor<LexicalListNode, List> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: (node): node is LexicalListNode =>
    isLexicalListNode(node) &&
    node.getListType() === NUMBERED_LIST &&
    node.getStart() !== DEFAULT_LIST_START,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.nextVisitor()
    if (mdastParent.type === "listItem") return
    const exportedList = mdastParent.children.at(-1)
    if (exportedList?.type === "list") exportedList.start = lexicalNode.getStart()
  },
}

const plainItemInTaskListImportVisitor: MdastImportVisitor<ListItem> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: (node) => node.type === "listItem" && node.checked !== true && node.checked !== false,
  visitNode({ lexicalParent, actions }) {
    if (!isLexicalListNode(lexicalParent) || lexicalParent.getListType() !== TASK_LIST) {
      actions.nextVisitor()
      return
    }
    const importedItemIndex = lexicalParent.getChildrenSize()
    actions.nextVisitor()
    const importedItem = lexicalParent.getChildAtIndex(importedItemIndex)
    if (isLexicalListItemNode(importedItem)) {
      $setState(importedItem, plainItemInTaskListState, true)
    }
  },
}

const plainItemInTaskListExportVisitor: LexicalExportVisitor<LexicalListItemNode, ListItem> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: (node): node is LexicalListItemNode =>
    isLexicalListItemNode(node) &&
    $getState(node, plainItemInTaskListState) &&
    node.getChecked() === false &&
    !holdsOnlyNestedList(node),
  visitLexicalNode({ mdastParent, actions }) {
    const exportedItemCount = mdastParent.children.length
    actions.nextVisitor()
    const exportedItem = mdastParent.children.at(-1)
    if (mdastParent.children.length !== exportedItemCount + 1) return
    if (exportedItem?.type === "listItem") exportedItem.checked = null
  },
}

const spreadListImportVisitor: MdastImportVisitor<List> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: (node) => node.type === "list" && node.spread === true,
  visitNode({ lexicalParent, actions }) {
    actions.nextVisitor()
    const importedList = findListImportedInto(lexicalParent)
    if (importedList) $setState(importedList, blankLineSpreadState, true)
  },
}

const spreadListExportVisitor: LexicalExportVisitor<LexicalListNode, List> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: (node): node is LexicalListNode =>
    isLexicalListNode(node) && $getState(node, blankLineSpreadState),
  visitLexicalNode({ mdastParent, actions }) {
    const exportedChildCount = mdastParent.children.length
    actions.nextVisitor()
    const exportedList = mdastParent.children.at(-1)
    if (mdastParent.children.length !== exportedChildCount + 1) return
    if (exportedList?.type === "list") exportedList.spread = true
  },
}

const spreadListItemImportVisitor: MdastImportVisitor<ListItem> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testNode: (node) => node.type === "listItem" && node.spread === true,
  visitNode({ lexicalParent, actions }) {
    if (!isLexicalListNode(lexicalParent)) {
      actions.nextVisitor()
      return
    }
    const importedItemIndex = lexicalParent.getChildrenSize()
    actions.nextVisitor()
    const importedItem = lexicalParent.getChildAtIndex(importedItemIndex)
    if (isLexicalListItemNode(importedItem)) $setState(importedItem, blankLineSpreadState, true)
  },
}

const spreadListItemExportVisitor: LexicalExportVisitor<LexicalListItemNode, ListItem> = {
  priority: BEFORE_LIBRARY_VISITORS,
  testLexicalNode: (node): node is LexicalListItemNode =>
    isLexicalListItemNode(node) &&
    $getState(node, blankLineSpreadState) &&
    !holdsOnlyNestedList(node),
  visitLexicalNode({ mdastParent, actions }) {
    const exportedChildCount = mdastParent.children.length
    actions.nextVisitor()
    const exportedItem = mdastParent.children.at(-1)
    if (mdastParent.children.length !== exportedChildCount + 1) return
    if (exportedItem?.type === "listItem") exportedItem.spread = true
  },
}

function clearPlainItemMarkOnceChecked(node: LexicalNode) {
  if (!isLexicalListItemNode(node) || node.getChecked() !== true) return
  if ($getState(node, plainItemInTaskListState)) $setState(node, plainItemInTaskListState, false)
}

function clearPlainItemMarkOnceCheckedInActiveEditor(node: LexicalNode) {
  clearPlainItemMarkOnceChecked(node)
}

function registerPlainItemMarkClearing(
  editor: LexicalEditor,
  transform: (node: LexicalNode) => void,
) {
  const listItemClass = getRegisteredNode(editor, LEXICAL_LIST_ITEM_TYPE)?.klass
  if (!listItemClass) return () => undefined
  return editor.registerNodeTransform(listItemClass, transform)
}

function registerPlainItemMarkClearingInRootEditor(editor: LexicalEditor) {
  return registerPlainItemMarkClearing(editor, clearPlainItemMarkOnceChecked)
}

function registerPlainItemMarkClearingInActiveEditor(editor: LexicalEditor) {
  return registerPlainItemMarkClearing(editor, clearPlainItemMarkOnceCheckedInActiveEditor)
}

/** Track plain-to-task conversions before a nested list has received a caret. */
export function registerMarkdownBenchNestedListFidelity(editor: LexicalEditor) {
  return registerPlainItemMarkClearing(editor, clearPlainItemMarkOnceChecked)
}

export const buddyListFidelityPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addImportVisitor$]: [
        numberedListStartImportVisitor,
        plainItemInTaskListImportVisitor,
        spreadListImportVisitor,
        spreadListItemImportVisitor,
      ],
      [addExportVisitor$]: [
        numberedListStartExportVisitor,
        plainItemInTaskListExportVisitor,
        spreadListExportVisitor,
        spreadListItemExportVisitor,
      ],
      [createRootEditorSubscription$]: registerPlainItemMarkClearingInRootEditor,
      [createActiveEditorSubscription$]: registerPlainItemMarkClearingInActiveEditor,
    })
  },
})
