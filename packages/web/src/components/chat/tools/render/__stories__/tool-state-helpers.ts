import type { ReactNode } from "react"
import type { ToolState, ToolInfo } from "../../types"
import type { ToolPartProps } from "../../registry"
import type { MessagePart } from "@/state/chat-types"

type MakePartOverrides = {
  id?: string
}

function makePart(overrides: MakePartOverrides = {}): MessagePart {
  return {
    id: overrides.id ?? "part-1",
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool-invocation",
    toolInvocation: {
      id: "call-1",
      toolName: "bash",
      args: {},
      state: "result",
    },
  } satisfies MessagePart
}

type MakeToolStateOverrides = Partial<ToolState>

export function makeToolState(overrides: MakeToolStateOverrides = {}): ToolState {
  return {
    status: overrides.status ?? "completed",
    input: overrides.input ?? {},
    metadata: overrides.metadata ?? {},
    attachments: overrides.attachments ?? [],
    start: overrides.start,
    end: overrides.end,
    output: overrides.output,
    error: overrides.error,
    title: overrides.title,
  }
}

type MakeToolInfoOverrides = Partial<ToolInfo>

export function makeToolInfo(overrides: MakeToolInfoOverrides = {}): ToolInfo {
  return {
    title: overrides.title ?? "Tool",
    subtitle: overrides.subtitle,
    detail: overrides.detail,
    summary: overrides.summary,
    args: overrides.args,
  }
}

type MakeToolPartPropsOverrides = {
  part?: MessagePart
  state?: ToolState
  info?: ToolInfo
  tool?: string
  directory?: string
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

export function makeToolPartProps(overrides: MakeToolPartPropsOverrides = {}): ToolPartProps {
  return {
    part: overrides.part ?? makePart(),
    state: overrides.state ?? makeToolState(),
    info: overrides.info ?? makeToolInfo(),
    tool: overrides.tool ?? "bash",
    directory: overrides.directory,
    onOpenSession: overrides.onOpenSession,
    defaultOpen: overrides.defaultOpen,
  }
}

export type RenderFn = (props: ToolPartProps) => ReactNode

export type GalleryCard = {
  label: string
  render: RenderFn
  props: ToolPartProps
}

export function card(
  tool: string,
  render: RenderFn,
  label: string,
  state: Partial<ToolState>,
  info?: Partial<ToolInfo>,
  extra?: { defaultOpen?: boolean; directory?: string },
): GalleryCard {
  return {
    label,
    render,
    props: makeToolPartProps({
      tool,
      state: makeToolState(state),
      info: makeToolInfo(info ?? {}),
      ...extra,
    }),
  }
}
