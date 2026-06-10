import { createElement } from "react"
import { Eye } from "lucide-react"
import { cn } from "@buddy/ui"

import { FileTypeIcon } from "@/components/files/file-type-icon"

import { basename } from "../utils/path"
import { isReadImagePreview } from "./read-image-preview"
import { resolveSkillReferenceInfo } from "./skill-reference"
import { SKILL_TOOL_ICON } from "./tool-icons"
import type { ToolIconRenderer, ToolInfo, ToolState } from "./tool-registry-types"
import { isRecord, readNonEmptyString, readString } from "./types"

export const FILE_TOOL_NAMES = ["read", "edit", "write", "apply_patch"] as const

export type TFileToolName = (typeof FILE_TOOL_NAMES)[number]

const FILE_TOOL_NAME_SET = new Set<string>(FILE_TOOL_NAMES)

export function isFileToolName(tool: string): tool is TFileToolName {
  return FILE_TOOL_NAME_SET.has(tool)
}

export function getPatchFileCount(state: ToolState): number {
  const files = Array.isArray(state.metadata.files) ? state.metadata.files.filter(isRecord) : []
  return files.length
}

export function isMultiFilePatch(state: ToolState): boolean {
  return getPatchFileCount(state) > 1
}

export function resolveFileToolPath(
  tool: string,
  state: ToolState,
  info: ToolInfo,
): string | undefined {
  if (tool === "read" || tool === "edit" || tool === "write") {
    return readString(state.input.filePath) ?? info.subtitle
  }

  if (tool === "apply_patch") {
    const files = Array.isArray(state.metadata.files) ? state.metadata.files.filter(isRecord) : []
    if (files.length !== 1) return undefined
    return readNonEmptyString(files[0].relativePath) ?? readNonEmptyString(files[0].filePath)
  }

  return undefined
}

export function resolveFileToolFileName(
  tool: string,
  state: ToolState,
  info: ToolInfo,
): string | undefined {
  const filePath = resolveFileToolPath(tool, state, info)
  return filePath ? basename(filePath) : undefined
}

export function resolveSettledFileToolIcon(
  tool: string,
  state: ToolState,
  info: ToolInfo,
  fallback?: ToolIconRenderer,
): ToolIconRenderer | undefined {
  const filePath = resolveFileToolPath(tool, state, info)
  if (
    tool === "read" &&
    resolveSkillReferenceInfo({
      filePath,
      title: info.title,
      subtitle: info.subtitle,
      detail: info.detail,
    })
  ) {
    return SKILL_TOOL_ICON
  }

  return fallback
}

export function createFileToolIcon(fileName: string): ToolIconRenderer {
  return (className) => (
    <FileTypeIcon fileName={fileName} className={cn(className, "object-contain")} />
  )
}

export function resolveFileToolIcon(
  tool: string,
  state: ToolState,
  info: ToolInfo,
  fallback?: ToolIconRenderer,
): ToolIconRenderer | undefined {
  const filePath = resolveFileToolPath(tool, state, info)
  const fileName = resolveFileToolFileName(tool, state, info)
  const imagePath = filePath ?? fileName

  if (
    tool === "read" &&
    resolveSkillReferenceInfo({
      filePath,
      title: info.title,
      subtitle: info.subtitle,
      detail: info.detail,
    })
  ) {
    return SKILL_TOOL_ICON
  }

  if (tool === "read" && isReadImagePreview({ state, filePath: imagePath })) {
    return (className) => createElement(Eye, { className })
  }

  if (fileName) {
    return createFileToolIcon(fileName)
  }

  return fallback
}
