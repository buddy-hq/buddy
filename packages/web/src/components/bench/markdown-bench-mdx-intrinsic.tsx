import { Fragment, createContext, createElement, useContext, type ReactNode } from "react"
import type { JsxEditorProps } from "@mdxeditor/editor"
import type { RootContent } from "mdast"
import { resolveMarkdownBenchImageSrc } from "@/lib/markdown-bench-image-src"
import { MARKDOWN_BENCH_IMAGE_SCREEN_CLASS_NAME } from "@/components/bench/markdown-bench-image"

type MarkdownBenchIntrinsicContextValue = {
  directory: string
  documentPath: string
}

type SafeMarkdownRenderContext = {
  imageContext: MarkdownBenchIntrinsicContextValue | null
  svg: boolean
}

const HTML_MARKDOWN_RENDER_CONTEXT: SafeMarkdownRenderContext = {
  imageContext: null,
  svg: false,
}

const MarkdownBenchIntrinsicContext = createContext<MarkdownBenchIntrinsicContextValue | null>(null)

export function MarkdownBenchIntrinsicScope(props: {
  value: MarkdownBenchIntrinsicContextValue
  children: ReactNode
}) {
  return (
    <MarkdownBenchIntrinsicContext.Provider value={props.value}>
      {props.children}
    </MarkdownBenchIntrinsicContext.Provider>
  )
}

function useIntrinsicImageContext(): MarkdownBenchIntrinsicContextValue | null {
  return useContext(MarkdownBenchIntrinsicContext)
}

function resolveIntrinsicImageSrc(
  src: string,
  ctx: MarkdownBenchIntrinsicContextValue | null,
): string {
  if (!ctx) return src
  return resolveMarkdownBenchImageSrc({
    directory: ctx.directory,
    documentPath: ctx.documentPath,
    src,
  })
}

const SAFE_HTML_ELEMENT_NAMES = new Set([
  "article",
  "aside",
  "b",
  "br",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "footer",
  "header",
  "hr",
  "i",
  "img",
  "li",
  "main",
  "ol",
  "p",
  "section",
  "small",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
])

const SAFE_SVG_ELEMENT_NAMES = new Set([
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "g",
  "line",
  "linearGradient",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "text",
  "title",
  "use",
])

const BLOCK_HTML_ELEMENT_NAMES = new Set([
  "article",
  "aside",
  "details",
  "div",
  "figure",
  "footer",
  "header",
  "hr",
  "main",
  "ol",
  "section",
  "table",
  "ul",
])

const VOID_HTML_ELEMENT_NAMES = new Set(["br", "hr", "img"])

const STYLE_PROPERTY_NAMES: Record<string, string> = {
  "align-items": "alignItems",
  background: "background",
  "background-color": "backgroundColor",
  border: "border",
  "border-bottom": "borderBottom",
  "border-left": "borderLeft",
  "border-radius": "borderRadius",
  "border-right": "borderRight",
  "border-top": "borderTop",
  color: "color",
  display: "display",
  flex: "flex",
  "flex-direction": "flexDirection",
  "flex-wrap": "flexWrap",
  "font-size": "fontSize",
  "font-style": "fontStyle",
  "font-weight": "fontWeight",
  gap: "gap",
  "grid-template-columns": "gridTemplateColumns",
  "justify-content": "justifyContent",
  "line-height": "lineHeight",
  margin: "margin",
  "margin-bottom": "marginBottom",
  "margin-left": "marginLeft",
  "margin-right": "marginRight",
  "margin-top": "marginTop",
  "max-height": "maxHeight",
  "max-width": "maxWidth",
  "min-height": "minHeight",
  "min-width": "minWidth",
  padding: "padding",
  "padding-bottom": "paddingBottom",
  "padding-left": "paddingLeft",
  "padding-right": "paddingRight",
  "padding-top": "paddingTop",
  "text-align": "textAlign",
}

const ATTRIBUTE_NAME_OVERRIDES: Record<string, string> = {
  class: "className",
  colspan: "colSpan",
  rowspan: "rowSpan",
  "xlink:href": "xlinkHref",
  "xml:space": "xmlSpace",
}

function reactAttributeName(name: string): string {
  const override = ATTRIBUTE_NAME_OVERRIDES[name]
  if (override) return override
  if (name.startsWith("aria-") || name.startsWith("data-")) return name
  return name.replace(/-([a-z])/gu, (_, character: string) => character.toUpperCase())
}

function safeStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":")
    if (separator < 0) continue
    const sourceName = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    const name = STYLE_PROPERTY_NAMES[sourceName]
    if (!name || !value) continue
    if (/expression\s*\(|javascript:|url\s*\(/iu.test(value)) continue
    result[name] = value
  }
  return result
}

function isSafeImageSource(value: string): boolean {
  return (
    !/^\s*(?:javascript|vbscript):/iu.test(value) &&
    (!/^\s*data:/iu.test(value) || /^\s*data:image\//iu.test(value))
  )
}

function safeProps(
  mdastNode: JsxEditorProps["mdastNode"],
  context: SafeMarkdownRenderContext,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const attribute of mdastNode.attributes) {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue
    const name = reactAttributeName(attribute.name)
    if (name.toLowerCase().startsWith("on")) continue
    if (name === "srcDoc") continue
    if (name === "style") {
      if (typeof attribute.value === "string") {
        props.style = safeStyle(attribute.value)
      }
      continue
    }
    if (name === "href" || name === "xlinkHref") {
      if (typeof attribute.value !== "string" || !attribute.value.startsWith("#")) continue
    }
    if (name === "src") {
      if (typeof attribute.value !== "string" || !isSafeImageSource(attribute.value)) {
        continue
      }
      props[name] = resolveIntrinsicImageSrc(attribute.value, context.imageContext)
      continue
    }
    if (
      typeof attribute.value === "string" &&
      /url\s*\(/iu.test(attribute.value) &&
      !/^\s*url\(\s*#[^)]+\s*\)\s*$/iu.test(attribute.value)
    ) {
      continue
    }
    if (attribute.value === null) {
      props[name] = true
    } else if (typeof attribute.value === "string") {
      props[name] = attribute.value
    }
  }
  return props
}

function isSafeIntrinsicElement(name: string | null): name is string {
  return name !== null && (SAFE_HTML_ELEMENT_NAMES.has(name) || SAFE_SVG_ELEMENT_NAMES.has(name))
}

function isSafeIntrinsicElementForContext(
  name: string | null,
  context: SafeMarkdownRenderContext,
): name is string {
  if (name === null) return false
  return context.svg
    ? SAFE_SVG_ELEMENT_NAMES.has(name)
    : SAFE_HTML_ELEMENT_NAMES.has(name) || SAFE_SVG_ELEMENT_NAMES.has(name)
}

function containsBlockIntrinsic(children: RootContent[]): boolean {
  return children.some(
    (child) =>
      (child.type === "mdxJsxFlowElement" || child.type === "mdxJsxTextElement") &&
      child.name !== null &&
      BLOCK_HTML_ELEMENT_NAMES.has(child.name),
  )
}

function renderSafeMarkdownNode(
  node: RootContent,
  key: string,
  context: SafeMarkdownRenderContext = HTML_MARKDOWN_RENDER_CONTEXT,
): ReactNode {
  switch (node.type) {
    case "text":
      return node.value
    case "break":
      return createElement("br", { key })
    case "paragraph": {
      const children = node.children.map((child, index) =>
        renderSafeMarkdownNode(child, `${key}-${index}`, context),
      )
      if (context.svg) {
        return createElement(Fragment, { key }, children)
      }
      return createElement(
        containsBlockIntrinsic(node.children) ? "div" : "p",
        { key, style: { margin: 0 } },
        children,
      )
    }
    case "strong":
      return createElement(
        "strong",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "emphasis":
      return createElement(
        "em",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "delete":
      return createElement(
        "del",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "inlineCode":
      return createElement("code", { key }, node.value)
    case "code":
      return createElement("pre", { key }, createElement("code", null, node.value))
    case "heading":
      return createElement(
        `h${node.depth}`,
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "blockquote":
      return createElement(
        "blockquote",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "list":
      return createElement(
        node.ordered ? "ol" : "ul",
        { key, ...(node.ordered && node.start !== null ? { start: node.start } : {}) },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "listItem":
      return createElement(
        "li",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "link": {
      const children = node.children.map((child, index) =>
        renderSafeMarkdownNode(child, `${key}-${index}`, context),
      )
      return /^(?:https?:|mailto:|#|\/|\.{1,2}\/)/iu.test(node.url)
        ? createElement("a", { key, href: node.url, rel: "noreferrer" }, children)
        : createElement("span", { key }, children)
    }
    case "image":
      return isSafeImageSource(node.url)
        ? createElement("img", {
            key,
            "data-component": "markdown-bench-image",
            src: resolveIntrinsicImageSrc(node.url, context.imageContext),
            alt: node.alt ?? "",
            ...(node.title ? { title: node.title } : {}),
            className: MARKDOWN_BENCH_IMAGE_SCREEN_CLASS_NAME,
          })
        : null
    case "thematicBreak":
      return createElement("hr", { key })
    case "table":
      return createElement(
        "table",
        { key },
        createElement(
          "tbody",
          null,
          node.children.map((child, index) =>
            renderSafeMarkdownNode(child, `${key}-${index}`, context),
          ),
        ),
      )
    case "tableRow":
      return createElement(
        "tr",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "tableCell":
      return createElement(
        "td",
        { key },
        node.children.map((child, index) =>
          renderSafeMarkdownNode(child, `${key}-${index}`, context),
        ),
      )
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
      return renderSafeIntrinsicNode(node, key, context)
    default:
      return null
  }
}

function renderSafeIntrinsicNode(
  mdastNode: JsxEditorProps["mdastNode"],
  key: string,
  context: SafeMarkdownRenderContext = HTML_MARKDOWN_RENDER_CONTEXT,
): ReactNode {
  const name = mdastNode.name
  if (!isSafeIntrinsicElementForContext(name, context)) return null

  const childContext = {
    imageContext: context.imageContext,
    svg: context.svg || name === "svg",
  }
  const children = mdastNode.children.map((child, index) =>
    renderSafeMarkdownNode(child, `${key}-${index}`, childContext),
  )
  const props = safeProps(mdastNode, context)
  if (name === "svg") {
    props["data-component"] = "markdown-bench-mdx-svg"
  }
  if (name === "img") {
    props["data-component"] = "markdown-bench-image"
    props.className = MARKDOWN_BENCH_IMAGE_SCREEN_CLASS_NAME
  }

  return VOID_HTML_ELEMENT_NAMES.has(name)
    ? createElement(name, { ...props, key })
    : createElement(name, { ...props, key }, children)
}

export function canRenderMdxIntrinsic(name: string | null): boolean {
  return isSafeIntrinsicElement(name)
}

export function MarkdownBenchMdxIntrinsicPreview({ mdastNode }: Pick<JsxEditorProps, "mdastNode">) {
  const imageContext = useIntrinsicImageContext()
  const renderContext = {
    imageContext,
    svg: false,
  }

  return (
    <div data-component="markdown-bench-mdx-intrinsic" className="my-2 max-w-full overflow-auto">
      {renderSafeIntrinsicNode(mdastNode, mdastNode.name ?? "intrinsic", renderContext)}
    </div>
  )
}
