import katex, { type KatexOptions } from "katex"
import "katex/contrib/mhchem"
import type { MarkedExtension, Tokens } from "marked"

type MathDelimiter = {
  left: string
  right: string
  displayMode: boolean
  includeDelimiters: boolean
}

type MathMatch = {
  raw: string
  text: string
  displayMode: boolean
}

type BuddyMathExtensionOptions = {
  suppressErrors?: boolean
}

const katexOptions: KatexOptions = {
  output: "htmlAndMathml",
  throwOnError: false,
  trust: false,
}

const blockDelimiters: MathDelimiter[] = [
  { left: "$$", right: "$$", displayMode: true, includeDelimiters: false },
  { left: "\\[", right: "\\]", displayMode: true, includeDelimiters: false },
  {
    left: "\\begin{equation}",
    right: "\\end{equation}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{equation*}",
    right: "\\end{equation*}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{align}",
    right: "\\end{align}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{align*}",
    right: "\\end{align*}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{alignat}",
    right: "\\end{alignat}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{alignat*}",
    right: "\\end{alignat*}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{gather}",
    right: "\\end{gather}",
    displayMode: true,
    includeDelimiters: true,
  },
  {
    left: "\\begin{gather*}",
    right: "\\end{gather*}",
    displayMode: true,
    includeDelimiters: true,
  },
  { left: "\\begin{CD}", right: "\\end{CD}", displayMode: true, includeDelimiters: true },
]

const inlineDelimiters: MathDelimiter[] = [
  { left: "$$", right: "$$", displayMode: true, includeDelimiters: false },
  { left: "\\[", right: "\\]", displayMode: true, includeDelimiters: false },
  { left: "\\(", right: "\\)", displayMode: false, includeDelimiters: false },
  { left: "$", right: "$", displayMode: false, includeDelimiters: false },
  ...blockDelimiters.filter((delimiter) => delimiter.includeDelimiters),
]

const displayOnlyEnvironmentNames = [
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "gather",
  "gather*",
  "CD",
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;")
}

function findEndOfMath(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex
  let braceLevel = 0

  while (index < text.length) {
    const character = text[index]
    if (braceLevel <= 0 && text.startsWith(delimiter, index)) {
      return index
    }
    if (character === "\\") {
      index += 2
      continue
    }
    if (character === "{") {
      braceLevel += 1
    } else if (character === "}") {
      braceLevel -= 1
    }
    index += 1
  }

  return -1
}

function hasOddBackslashRunBefore(src: string, index: number): boolean {
  let count = 0
  let cursor = index - 1
  while (cursor >= 0 && src[cursor] === "\\") {
    count += 1
    cursor -= 1
  }
  return count % 2 === 1
}

function trimOneTrailingLineBreak(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2)
  if (value.endsWith("\n")) return value.slice(0, -1)
  return value
}

function mathTextForDelimiter(src: string, delimiter: MathDelimiter, endIndex: number): string {
  if (delimiter.includeDelimiters) {
    return src.slice(0, endIndex + delimiter.right.length).trim()
  }
  return src.slice(delimiter.left.length, endIndex).trim()
}

function isProbablyCurrencyText(value: string): boolean {
  const trimmed = value.trim()
  if (!/^\d+(?:[.,]\d{2})?(?:\s+[A-Za-z]+)+$/u.test(trimmed)) return false
  return !/[\\_^{}=<>+\-*/]/u.test(trimmed)
}

function isValidSingleDollarMath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return !isProbablyCurrencyText(trimmed)
}

function hasLikelyPaddedSingleDollarMath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^[A-Za-z]$/u.test(trimmed)) return true

  return /\\[A-Za-z]+|[_^=<>+\-*/]|[()[\]{}]|[0-9]|[|,&]/u.test(trimmed)
}

function shouldRenderInDisplayMode(value: string): boolean {
  const trimmed = value.trimStart()
  return displayOnlyEnvironmentNames.some((name) => trimmed.startsWith(`\\begin{${name}}`))
}

function escapeUnescapedPercent(value: string): string {
  let result = ""
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== "%") {
      result += character
      continue
    }

    let slashCount = 0
    let cursor = index - 1
    while (cursor >= 0 && value[cursor] === "\\") {
      slashCount += 1
      cursor -= 1
    }
    result += slashCount % 2 === 1 ? "%" : "\\%"
  }
  return result
}

function matchInlineMath(src: string): MathMatch | undefined {
  for (const delimiter of inlineDelimiters) {
    if (!src.startsWith(delimiter.left)) continue
    const startsWithPadding = delimiter.left === "$" && /\s/u.test(src[delimiter.left.length] ?? "")
    const endIndex = findEndOfMath(delimiter.right, src, delimiter.left.length)
    if (endIndex < 0) return undefined

    const raw = src.slice(0, endIndex + delimiter.right.length)
    const text = mathTextForDelimiter(src, delimiter, endIndex)
    if (delimiter.left === "$" && !isValidSingleDollarMath(text)) {
      return undefined
    }
    if (startsWithPadding && !hasLikelyPaddedSingleDollarMath(text)) {
      return undefined
    }
    return {
      raw,
      text,
      displayMode: delimiter.displayMode || shouldRenderInDisplayMode(text),
    }
  }
  return undefined
}

function findInlineMathStart(src: string): number | undefined {
  let searchIndex = 0
  while (searchIndex < src.length) {
    let nextIndex = -1
    for (const delimiter of inlineDelimiters) {
      const index = src.indexOf(delimiter.left, searchIndex)
      if (
        index >= 0 &&
        delimiter.left !== "$" &&
        delimiter.left !== "$$" &&
        (nextIndex < 0 || index < nextIndex)
      ) {
        nextIndex = index
      }
      if (
        index >= 0 &&
        (delimiter.left === "$" || delimiter.left === "$$") &&
        !hasOddBackslashRunBefore(src, index) &&
        (nextIndex < 0 || index < nextIndex)
      ) {
        nextIndex = index
      }
    }
    if (nextIndex < 0) return undefined

    const match = matchInlineMath(src.slice(nextIndex))
    if (match) return nextIndex
    searchIndex = nextIndex + 1
  }
  return undefined
}

function matchBlockMath(src: string): MathMatch | undefined {
  const indentMatch = src.match(/^ {0,3}/u)
  const indent = indentMatch?.[0] ?? ""
  const body = src.slice(indent.length)

  for (const delimiter of blockDelimiters) {
    if (!body.startsWith(delimiter.left)) continue
    const endIndex = findEndOfMath(delimiter.right, body, delimiter.left.length)
    if (endIndex < 0) return undefined

    const closeEnd = endIndex + delimiter.right.length
    const nextLineIndex = body.indexOf("\n", closeEnd)
    const trailing = nextLineIndex < 0 ? body.slice(closeEnd) : body.slice(closeEnd, nextLineIndex)
    if (!/^[\t ]*$/u.test(trailing)) continue

    const rawBodyEnd = nextLineIndex < 0 ? body.length : nextLineIndex + 1
    const raw = indent + body.slice(0, rawBodyEnd)
    return {
      raw,
      text: mathTextForDelimiter(body, delimiter, endIndex),
      displayMode: delimiter.displayMode,
    }
  }

  return undefined
}

function renderMathToken(token: Tokens.Generic, options: BuddyMathExtensionOptions): string {
  const text = typeof token["text"] === "string" ? token["text"] : ""
  const raw = typeof token["raw"] === "string" ? token["raw"] : text
  const displayMode = token["displayMode"] === true
  const normalizedText = escapeUnescapedPercent(text)

  try {
    return katex.renderToString(normalizedText, {
      ...katexOptions,
      displayMode,
      throwOnError: options.suppressErrors ? true : katexOptions.throwOnError,
    })
  } catch {
    return escapeHtml(raw)
  }
}

export function buddyMathExtension(options: BuddyMathExtensionOptions = {}): MarkedExtension {
  return {
    extensions: [
      {
        name: "buddyBlockMath",
        level: "block",
        tokenizer(src) {
          const match = matchBlockMath(src)
          if (!match) return undefined
          return {
            type: "buddyBlockMath",
            raw: match.raw,
            text: match.text,
            displayMode: true,
          }
        },
        renderer(token) {
          return `${renderMathToken(token, options)}\n`
        },
      },
      {
        name: "buddyInlineMath",
        level: "inline",
        start(src) {
          return findInlineMathStart(src)
        },
        tokenizer(src) {
          const match = matchInlineMath(src)
          if (!match) return undefined
          return {
            type: "buddyInlineMath",
            raw: match.raw,
            text: trimOneTrailingLineBreak(match.text),
            displayMode: match.displayMode,
          }
        },
        renderer(token) {
          return renderMathToken(token, options)
        },
      },
    ],
  }
}
