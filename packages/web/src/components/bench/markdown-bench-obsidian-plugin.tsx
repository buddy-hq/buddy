import {
  Cell,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  useCellValue,
  type LexicalExportVisitor,
  type MdastImportVisitor,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import { useQuery } from "@tanstack/react-query"
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import type { CompileContext, Extension as MdastExtension } from "mdast-util-from-markdown"
import type { Code, Construct, Effects, Extension, State, Token } from "micromark-util-types"
import type { Literal } from "mdast"
import {
  useMemo,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { cn } from "@buddy/ui"
import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
import { MarkdownBenchImage } from "@/components/bench/markdown-bench-image"
import { MarkdownHtmlSegment } from "@/components/markdown/markdown-html-segment"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import { readProjectExplorerEditableFile } from "@/state/chat-actions"
import { obsidianVaultQueryKeys, type ObsidianLinkResolution } from "@/state/obsidian-vault-query"

const LEFT_SQUARE_BRACKET_CODE = 91
const RIGHT_SQUARE_BRACKET_CODE = 93
const EXCLAMATION_MARK_CODE = 33
const VERTICAL_BAR_CODE = 124
const SPACE_CODE = 32
const HORIZONTAL_TAB_CODE = -2
const OBSIDIAN_WIKILINK_TYPE = "obsidianWikiLink"
const OBSIDIAN_WIKILINK_TARGET_TYPE = "obsidianWikiLinkTarget"
const OBSIDIAN_WIKILINK_ALIAS_TYPE = "obsidianWikiLinkAlias"
const OBSIDIAN_WIKILINK_MARKER_TYPE = "obsidianWikiLinkMarker"
const OBSIDIAN_EMBED_TYPE = "obsidianEmbed"
const OBSIDIAN_EMBED_PREVIEW_MAX_LENGTH = 12_000
const OBSIDIAN_EMBED_PREVIEW_STALE_TIME_MS = 30_000
const OBSIDIAN_LINK_PATTERN = /!?\[\[([^\]\n]+)\]\]/gu

type ObsidianWikiLinkMdastNode = Literal & {
  type: typeof OBSIDIAN_WIKILINK_TYPE
  value: string
  data: {
    alias?: string
    embed: boolean
  }
}

type SerializedObsidianWikiLinkNode = Spread<
  {
    alias?: string
    embed: boolean
    target: string
  },
  SerializedLexicalNode
>

type ObsidianWikiLinkContext = {
  directory: string
  documentPath: string
  compatible: boolean
  resolutions: ReadonlyMap<string, ObsidianLinkResolution>
  openResolution(resolution: ObsidianLinkResolution): void
}

declare module "mdast" {
  interface PhrasingContentMap {
    obsidianWikiLink: ObsidianWikiLinkMdastNode
  }

  interface RootContentMap {
    obsidianWikiLink: ObsidianWikiLinkMdastNode
  }
}

declare module "mdast-util-from-markdown" {
  interface CompileData {
    obsidianWikiLinkStack?: ObsidianWikiLinkMdastNode[]
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    obsidianEmbed: typeof OBSIDIAN_EMBED_TYPE
    obsidianWikiLink: typeof OBSIDIAN_WIKILINK_TYPE
    obsidianWikiLinkAlias: typeof OBSIDIAN_WIKILINK_ALIAS_TYPE
    obsidianWikiLinkMarker: typeof OBSIDIAN_WIKILINK_MARKER_TYPE
    obsidianWikiLinkTarget: typeof OBSIDIAN_WIKILINK_TARGET_TYPE
  }
}

const EMPTY_OBSIDIAN_WIKILINK_CONTEXT: ObsidianWikiLinkContext = {
  directory: "",
  documentPath: "",
  compatible: false,
  resolutions: new Map(),
  openResolution() {},
}

const obsidianWikiLinkContext$ = Cell<ObsidianWikiLinkContext>(EMPTY_OBSIDIAN_WIKILINK_CONTEXT)

function isMarkdownLineEnding(code: Code): boolean {
  return code !== null && code < HORIZONTAL_TAB_CODE
}

function hasNonWhitespaceData(code: Code): boolean {
  return code !== null && code > 0 && code !== SPACE_CODE
}

function createObsidianWikiLinkConstruct(embed: boolean): Construct {
  return {
    tokenize(effects: Effects, ok: State, nok: State): State {
      let startCursor = 0
      let endCursor = 0
      let hasTarget = false
      let hasAlias = false
      const startCodes = embed
        ? [EXCLAMATION_MARK_CODE, LEFT_SQUARE_BRACKET_CODE, LEFT_SQUARE_BRACKET_CODE]
        : [LEFT_SQUARE_BRACKET_CODE, LEFT_SQUARE_BRACKET_CODE]

      return start

      function start(code: Code): State | undefined {
        if (code !== startCodes[0]) return nok(code)
        effects.enter(embed ? OBSIDIAN_EMBED_TYPE : OBSIDIAN_WIKILINK_TYPE)
        effects.enter(OBSIDIAN_WIKILINK_MARKER_TYPE)
        return consumeStart(code)
      }

      function consumeStart(code: Code): State | undefined {
        if (startCursor === startCodes.length) {
          effects.exit(OBSIDIAN_WIKILINK_MARKER_TYPE)
          effects.enter(OBSIDIAN_WIKILINK_TARGET_TYPE)
          return consumeTarget(code)
        }
        if (code !== startCodes[startCursor]) return nok(code)
        effects.consume(code)
        startCursor += 1
        return consumeStart
      }

      function consumeTarget(code: Code): State | undefined {
        if (code === VERTICAL_BAR_CODE) {
          if (!hasTarget) return nok(code)
          effects.exit(OBSIDIAN_WIKILINK_TARGET_TYPE)
          effects.enter(OBSIDIAN_WIKILINK_MARKER_TYPE)
          effects.consume(code)
          effects.exit(OBSIDIAN_WIKILINK_MARKER_TYPE)
          effects.enter(OBSIDIAN_WIKILINK_ALIAS_TYPE)
          return consumeAlias
        }
        if (code === RIGHT_SQUARE_BRACKET_CODE) {
          if (!hasTarget) return nok(code)
          effects.exit(OBSIDIAN_WIKILINK_TARGET_TYPE)
          effects.enter(OBSIDIAN_WIKILINK_MARKER_TYPE)
          return consumeEnd(code)
        }
        if (code === null || isMarkdownLineEnding(code)) return nok(code)
        if (hasNonWhitespaceData(code)) hasTarget = true
        effects.consume(code)
        return consumeTarget
      }

      function consumeAlias(code: Code): State | undefined {
        if (code === RIGHT_SQUARE_BRACKET_CODE) {
          if (!hasAlias) return nok(code)
          effects.exit(OBSIDIAN_WIKILINK_ALIAS_TYPE)
          effects.enter(OBSIDIAN_WIKILINK_MARKER_TYPE)
          return consumeEnd(code)
        }
        if (code === null || isMarkdownLineEnding(code)) return nok(code)
        if (hasNonWhitespaceData(code)) hasAlias = true
        effects.consume(code)
        return consumeAlias
      }

      function consumeEnd(code: Code): State | undefined {
        if (endCursor === 2) {
          effects.exit(OBSIDIAN_WIKILINK_MARKER_TYPE)
          effects.exit(embed ? OBSIDIAN_EMBED_TYPE : OBSIDIAN_WIKILINK_TYPE)
          return ok(code)
        }
        if (code !== RIGHT_SQUARE_BRACKET_CODE) return nok(code)
        effects.consume(code)
        endCursor += 1
        return consumeEnd
      }
    },
  }
}

export function obsidianWikiLinkSyntaxExtension(): Extension {
  return {
    text: {
      [LEFT_SQUARE_BRACKET_CODE]: createObsidianWikiLinkConstruct(false),
      [EXCLAMATION_MARK_CODE]: createObsidianWikiLinkConstruct(true),
    },
  }
}

function currentObsidianMdastNode(context: CompileContext): ObsidianWikiLinkMdastNode {
  const current = context.data.obsidianWikiLinkStack?.at(-1)
  if (!current) throw new Error("Obsidian wikilink parser lost its active node")
  return current
}

function enterObsidianWikiLink(this: CompileContext, token: Token): void {
  const node: ObsidianWikiLinkMdastNode = {
    type: OBSIDIAN_WIKILINK_TYPE,
    value: "",
    data: { embed: token.type === OBSIDIAN_EMBED_TYPE },
  }
  const stack = this.data.obsidianWikiLinkStack ?? []
  stack.push(node)
  this.data.obsidianWikiLinkStack = stack
  this.enter(node, token)
}

function exitObsidianWikiLinkTarget(this: CompileContext, token: Token): void {
  currentObsidianMdastNode(this).value = this.sliceSerialize(token).trim()
}

function exitObsidianWikiLinkAlias(this: CompileContext, token: Token): void {
  currentObsidianMdastNode(this).data.alias = this.sliceSerialize(token).trim()
}

function exitObsidianWikiLink(this: CompileContext, token: Token): void {
  this.exit(token)
  this.data.obsidianWikiLinkStack?.pop()
}

export function obsidianWikiLinkMdastExtension(): MdastExtension {
  return {
    enter: {
      [OBSIDIAN_WIKILINK_TYPE]: enterObsidianWikiLink,
      [OBSIDIAN_EMBED_TYPE]: enterObsidianWikiLink,
    },
    exit: {
      [OBSIDIAN_WIKILINK_TARGET_TYPE]: exitObsidianWikiLinkTarget,
      [OBSIDIAN_WIKILINK_ALIAS_TYPE]: exitObsidianWikiLinkAlias,
      [OBSIDIAN_WIKILINK_TYPE]: exitObsidianWikiLink,
      [OBSIDIAN_EMBED_TYPE]: exitObsidianWikiLink,
    },
  }
}

function serializeObsidianWikiLink(node: ObsidianWikiLinkMdastNode): string {
  const alias = node.data.alias?.trim()
  const body = alias && alias !== node.value ? `${node.value}|${alias}` : node.value
  return `${node.data.embed ? "!" : ""}[[${body}]]`
}

export const obsidianWikiLinkToMarkdownExtension: ToMarkdownExtension = {
  unsafe: [
    { character: "[", inConstruct: ["phrasing", "label", "reference"] },
    { character: "]", inConstruct: ["label", "reference"] },
  ],
  handlers: {
    obsidianWikiLink(node) {
      return serializeObsidianWikiLink(node)
    },
  },
}

class ObsidianWikiLinkNode extends DecoratorNode<JSX.Element> {
  wikiLinkTarget: string
  wikiLinkAlias?: string
  wikiLinkEmbed: boolean

  constructor(input: { target: string; alias?: string; embed: boolean }, key?: NodeKey) {
    super(key)
    this.wikiLinkTarget = input.target
    this.wikiLinkAlias = input.alias
    this.wikiLinkEmbed = input.embed
  }

  static getType(): string {
    return OBSIDIAN_WIKILINK_TYPE
  }

  static clone(node: ObsidianWikiLinkNode): ObsidianWikiLinkNode {
    return new ObsidianWikiLinkNode(
      {
        target: node.wikiLinkTarget,
        alias: node.wikiLinkAlias,
        embed: node.wikiLinkEmbed,
      },
      node.getKey(),
    )
  }

  static importJSON(serializedNode: SerializedObsidianWikiLinkNode): ObsidianWikiLinkNode {
    return $createObsidianWikiLinkNode(serializedNode)
  }

  exportJSON(): SerializedObsidianWikiLinkNode {
    return Object.assign(
      {
        type: OBSIDIAN_WIKILINK_TYPE,
        version: 1,
        target: this.wikiLinkTarget,
        embed: this.wikiLinkEmbed,
      },
      this.wikiLinkAlias ? { alias: this.wikiLinkAlias } : undefined,
    )
  }

  createDOM(): HTMLElement {
    return document.createElement(this.wikiLinkEmbed ? "div" : "span")
  }

  updateDOM(_previousNode: this, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  isInline(): boolean {
    return !this.wikiLinkEmbed
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  decorate(): JSX.Element {
    return (
      <ObsidianWikiLinkView
        target={this.wikiLinkTarget}
        alias={this.wikiLinkAlias}
        embed={this.wikiLinkEmbed}
      />
    )
  }

  toMdast(): ObsidianWikiLinkMdastNode {
    return {
      type: OBSIDIAN_WIKILINK_TYPE,
      value: this.wikiLinkTarget,
      data: Object.assign(
        { embed: this.wikiLinkEmbed },
        this.wikiLinkAlias ? { alias: this.wikiLinkAlias } : undefined,
      ),
    }
  }
}

function $createObsidianWikiLinkNode(input: {
  target: string
  alias?: string
  embed: boolean
}): ObsidianWikiLinkNode {
  return new ObsidianWikiLinkNode(input)
}

function $isObsidianWikiLinkNode(
  node: LexicalNode | null | undefined,
): node is ObsidianWikiLinkNode {
  return node instanceof ObsidianWikiLinkNode
}

const obsidianWikiLinkImportVisitor: MdastImportVisitor<ObsidianWikiLinkMdastNode> = {
  testNode(node): node is ObsidianWikiLinkMdastNode {
    return node.type === OBSIDIAN_WIKILINK_TYPE
  },
  visitNode({ actions, mdastNode }) {
    actions.addAndStepInto(
      $createObsidianWikiLinkNode({
        target: mdastNode.value,
        alias: mdastNode.data.alias,
        embed: mdastNode.data.embed,
      }),
    )
  },
}

const obsidianWikiLinkExportVisitor: LexicalExportVisitor<
  ObsidianWikiLinkNode,
  ObsidianWikiLinkMdastNode
> = {
  testLexicalNode: $isObsidianWikiLinkNode,
  visitLexicalNode({ actions, mdastParent, lexicalNode }) {
    actions.appendToParent(mdastParent, lexicalNode.toMdast())
  },
}

function ObsidianEmbeddedNote(props: {
  context: ObsidianWikiLinkContext
  resolution: ObsidianLinkResolution
  label: string
}) {
  const path = props.resolution.path ?? ""
  const noteQuery = useQuery({
    queryKey: obsidianVaultQueryKeys.embeddedNote(props.context.directory, path),
    queryFn: () => readProjectExplorerEditableFile({ directory: props.context.directory, path }),
    enabled: path.length > 0,
    staleTime: OBSIDIAN_EMBED_PREVIEW_STALE_TIME_MS,
  })
  const preview = noteQuery.data?.content.slice(0, OBSIDIAN_EMBED_PREVIEW_MAX_LENGTH)

  return (
    <section
      data-component="markdown-bench-obsidian-note-embed"
      className="my-4 overflow-hidden rounded-lg border border-border-weak-base bg-surface-weak shadow-sm"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2 text-left text-xs font-semibold text-text-strong hover:bg-surface-base-hover"
        onClick={() => props.context.openResolution(props.resolution)}
      >
        <span className="truncate">{props.label}</span>
        <span className="shrink-0 font-normal text-text-weaker">Embedded note</span>
      </button>
      <div className="max-h-96 overflow-auto px-4 py-3">
        {preview ? (
          <MarkdownHtmlSegment
            text={preview}
            cacheKey={`${props.context.directory}:${path}`}
            directory={props.context.directory}
            className="text-sm"
          />
        ) : (
          <p className="text-sm text-text-weaker">
            {noteQuery.isPending ? "Loading note…" : "Note preview unavailable."}
          </p>
        )}
      </div>
    </section>
  )
}

function ObsidianWikiLinkView(props: { target: string; alias?: string; embed: boolean }) {
  const context = useCellValue(obsidianWikiLinkContext$)
  const resolution = context.resolutions.get(props.target)
  const resolvedResolution =
    resolution?.status === "resolved" && resolution.path ? resolution : undefined
  const resolvedPath = resolvedResolution?.path
  const resolved = resolvedResolution !== undefined
  const label = props.alias?.trim() || props.target

  if (props.embed && resolvedPath && resolvedResolution.kind === "image") {
    return (
      <MarkdownBenchImage
        src={resolveAssetUrl(
          buildProjectFileRawUrl({
            directory: context.directory,
            path: resolvedPath,
          }),
        )}
        alt={label}
        title={props.target}
      />
    )
  }

  if (props.embed && resolvedResolution?.kind === "markdown") {
    return <ObsidianEmbeddedNote context={context} resolution={resolvedResolution} label={label} />
  }

  const open = () => {
    if (resolvedResolution) context.openResolution(resolvedResolution)
  }
  const openFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !resolvedResolution) return
    event.preventDefault()
    event.stopPropagation()
    open()
  }
  const openFromKeyboard = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.detail === 0) open()
  }

  return (
    <button
      type="button"
      data-component={
        props.embed ? "markdown-bench-obsidian-embed" : "markdown-bench-obsidian-link"
      }
      data-resolved={resolved ? "true" : "false"}
      className={cn(
        props.embed
          ? "my-3 flex w-full items-center justify-between rounded-lg border border-border-weak-base bg-surface-weak px-4 py-3 text-left text-sm"
          : "inline rounded-sm underline decoration-dotted underline-offset-2",
        resolved
          ? "cursor-pointer text-text-interactive-base"
          : "cursor-default text-text-weaker decoration-border-strong-base",
      )}
      title={resolvedResolution ? resolvedPath : `Unresolved Obsidian link: ${props.target}`}
      disabled={!resolved}
      onClick={openFromKeyboard}
      onPointerDown={openFromPointer}
    >
      <span>{label}</span>
      {props.embed ? <span className="text-xs text-text-weaker">Open attachment</span> : null}
    </button>
  )
}

type ObsidianWikiLinkPluginParams = {
  context: ObsidianWikiLinkContext
}

export const buddyObsidianWikiLinkPlugin = realmPlugin<ObsidianWikiLinkPluginParams>({
  init(realm, params) {
    realm.pubIn({
      [obsidianWikiLinkContext$]: params?.context ?? EMPTY_OBSIDIAN_WIKILINK_CONTEXT,
      [addSyntaxExtension$]: obsidianWikiLinkSyntaxExtension(),
      [addMdastExtension$]: obsidianWikiLinkMdastExtension(),
      [addLexicalNode$]: ObsidianWikiLinkNode,
      [addImportVisitor$]: obsidianWikiLinkImportVisitor,
      [addExportVisitor$]: obsidianWikiLinkExportVisitor,
      [addToMarkdownExtension$]: obsidianWikiLinkToMarkdownExtension,
    })
  },
  update(realm, params) {
    realm.pub(obsidianWikiLinkContext$, params?.context ?? EMPTY_OBSIDIAN_WIKILINK_CONTEXT)
  },
})

export function collectObsidianWikiLinkTargets(markdown: string): string[] {
  const targets = new Set<string>()
  for (const match of markdown.matchAll(OBSIDIAN_LINK_PATTERN)) {
    const body = match[1]
    if (!body) continue
    const aliasStart = body.indexOf("|")
    const target = (aliasStart < 0 ? body : body.slice(0, aliasStart)).trim()
    if (target) targets.add(target)
  }
  return Array.from(targets).toSorted((left, right) => left.localeCompare(right))
}

export function useObsidianResolutionMap(
  links: readonly ObsidianLinkResolution[] | undefined,
): ReadonlyMap<string, ObsidianLinkResolution> {
  return useMemo(() => new Map(links?.map((link) => [link.target, link]) ?? []), [links])
}

export function viewerForObsidianResolution(
  resolution: ObsidianLinkResolution,
): "file" | "markdown" {
  return resolution.path && isMarkdownBenchPath(resolution.path) ? "markdown" : "file"
}

export type { ObsidianWikiLinkContext }
