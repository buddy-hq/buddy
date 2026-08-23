import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Prec, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { tags } from "@lezer/highlight"

const buddyCodeMirrorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background-stronger)",
    color: "var(--text-base)",
    fontSize: "var(--buddy-code-font-size)",
  },
  ".cm-content": {
    caretColor: "var(--text-strong)",
    fontFamily: "var(--buddy-font-family-mono)",
    fontFeatureSettings: "var(--font-family-mono--font-feature-settings)",
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background-stronger)",
    borderRight: "1px solid var(--border-weaker-base)",
    color: "var(--text-weaker)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--surface-base-hover)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-strong)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--surface-interactive-hover)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--surface-interactive-base)",
    color: "var(--text-strong)",
    outline: "1px solid var(--border-interactive-base)",
  },
  ".cm-panels": {
    backgroundColor: "var(--surface-raised-base)",
    color: "var(--text-base)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-raised-stronger-non-alpha)",
    border: "1px solid var(--border-base)",
    color: "var(--text-base)",
  },
})

const buddyCodeMirrorHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: "var(--syntax-comment)",
  },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--syntax-property)",
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null, tags.atom],
    color: "var(--syntax-constant)",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.tagName],
    color: "var(--syntax-type)",
  },
  {
    tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [
      tags.operator,
      tags.operatorKeyword,
      tags.arithmeticOperator,
      tags.logicOperator,
      tags.bitwiseOperator,
      tags.compareOperator,
    ],
    color: "var(--syntax-operator)",
  },
  {
    tag: [tags.string, tags.docString, tags.character, tags.attributeValue],
    color: "var(--syntax-string)",
  },
  {
    tag: [tags.variableName, tags.name, tags.labelName, tags.macroName],
    color: "var(--syntax-variable)",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-primitive)",
  },
  {
    tag: [tags.regexp, tags.escape],
    color: "var(--syntax-regexp)",
  },
  {
    tag: [tags.punctuation, tags.separator, tags.bracket],
    color: "var(--syntax-punctuation)",
  },
  {
    tag: [tags.heading, tags.quote],
    color: "var(--syntax-info)",
  },
  {
    tag: [tags.link, tags.url],
    color: "var(--syntax-unknown)",
    textDecoration: "underline",
  },
  {
    tag: tags.strong,
    color: "var(--text-strong)",
    fontWeight: "600",
  },
  {
    tag: tags.emphasis,
    fontStyle: "italic",
  },
  {
    tag: tags.invalid,
    color: "var(--syntax-critical)",
  },
])

export const BUDDY_CODE_MIRROR_EXTENSIONS: Extension[] = [
  Prec.high(buddyCodeMirrorTheme),
  Prec.high(syntaxHighlighting(buddyCodeMirrorHighlightStyle)),
]
