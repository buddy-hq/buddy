import {
  HIDDEN_STEP_DETAIL_KIND,
  type HiddenStepDetail,
  type HiddenStepPresentation,
  type ToolPartProps,
} from "./registry"
import { readNonEmptyString } from "./types"
import { reasoningHeading } from "../utils/markdown"
import { stripAnsi } from "../utils/path"

const PREVIEW_MAX_CHARS = 320
const SUMMARY_ROW_PREVIEW_MAX_CHARS = 220
const MARKDOWN_FILE_EXTENSIONS = new Set([".md", ".mdown", ".markdown", ".mdx"])

function normalizeText(value: string): string {
  return stripAnsi(value).replace(/\r\n?/g, "\n").trim()
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars).trimEnd()}…`
}

function summarizeText(value: string | undefined, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = normalizeText(value)
  if (!normalized) {
    return undefined
  }

  return truncateText(normalized, maxChars)
}

function buildLabel(title: string, detail: string | undefined): string {
  return detail ? `${title}: ${detail}` : title
}

function uniqueDetails(details: Array<HiddenStepDetail | undefined>): HiddenStepDetail[] {
  const seen = new Set<string>()
  const values: HiddenStepDetail[] = []

  for (const detail of details) {
    if (!detail) {
      continue
    }

    const text = detail.text.trim()
    if (!text) {
      continue
    }

    const key = `${detail.kind ?? HIDDEN_STEP_DETAIL_KIND.text}:${text}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    values.push({ ...detail, text })
  }

  return values
}

function fileExtension(path: string | undefined): string | undefined {
  if (!path) {
    return undefined
  }

  const match = path.toLowerCase().match(/(\.[^./\\]+)$/u)
  return match ? match[1] : undefined
}

function isMarkdownFile(path: string | undefined): boolean {
  const extension = fileExtension(path)
  return extension ? MARKDOWN_FILE_EXTENSIONS.has(extension) : false
}

function searchInputText(props: ToolPartProps): string | undefined {
  switch (props.tool) {
    case "grep":
      return (
        readNonEmptyString(props.state.input.pattern) ??
        readNonEmptyString(props.state.input.include)
      )
    case "glob":
      return (
        readNonEmptyString(props.state.input.pattern) ?? readNonEmptyString(props.state.input.path)
      )
    case "list":
      return readNonEmptyString(props.state.input.path)
    case "codesearch":
    case "websearch":
      return readNonEmptyString(props.state.input.query)
    default:
      return undefined
  }
}

function buildSummaryOnlyPresentation(
  props: ToolPartProps,
  rowDetails: Array<HiddenStepDetail | undefined>,
  summaryLabelDetail?: string,
): HiddenStepPresentation {
  return {
    rowDetails: uniqueDetails(rowDetails),
    summaryLabel: buildLabel(props.info.title, summaryLabelDetail),
    summaryOnly: true,
    suppressErrorPreview: true,
  }
}

export function createReadHiddenStepPresentation(props: ToolPartProps): HiddenStepPresentation {
  const filePath = readNonEmptyString(props.state.input.filePath)
  const fileName = readNonEmptyString(props.info.subtitle)
  const fileDirectory = readNonEmptyString(props.info.detail)
  const snippet = summarizeText(props.state.output, SUMMARY_ROW_PREVIEW_MAX_CHARS)
  const previewText = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? fileName
  const markdown = isMarkdownFile(filePath ?? fileName)
  const previewKind =
    markdown && typeof previewText === "string"
      ? HIDDEN_STEP_DETAIL_KIND.markdown
      : HIDDEN_STEP_DETAIL_KIND.text
  const heading = markdown ? reasoningHeading(props.state.output ?? "") : undefined

  return {
    preview: previewText ? { text: previewText, kind: previewKind } : undefined,
    rowDetails: uniqueDetails([
      fileName ? { text: fileName, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
      fileDirectory ? { text: fileDirectory, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
      snippet ? { text: snippet, kind: previewKind } : undefined,
    ]),
    summaryLabel: buildLabel(props.info.title, heading ?? fileName),
    summaryOnly: true,
    suppressErrorPreview: true,
  }
}

export function createSearchHiddenStepPresentation(props: ToolPartProps): HiddenStepPresentation {
  const summaryDetail =
    readNonEmptyString(props.info.summary) ??
    searchInputText(props) ??
    readNonEmptyString(props.info.subtitle)
  const previewText =
    summarizeText(props.state.output, PREVIEW_MAX_CHARS) ??
    searchInputText(props) ??
    readNonEmptyString(props.info.subtitle)

  return {
    preview: previewText ? { text: previewText, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    summaryLabel: buildLabel(props.info.title, summaryDetail),
  }
}

export function createSummaryOnlyHiddenStepPresentation(
  props: ToolPartProps,
): HiddenStepPresentation {
  const subtitle = readNonEmptyString(props.info.subtitle)
  const summary = readNonEmptyString(props.info.summary)

  return buildSummaryOnlyPresentation(
    props,
    [
      subtitle ? { text: subtitle, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
      summary ? { text: summary, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    ],
    summary ?? subtitle,
  )
}

export function createArtifactHiddenStepPresentation(props: ToolPartProps): HiddenStepPresentation {
  const artifact = readNonEmptyString(props.state.metadata.artifact)
  const previewText = summarizeText(props.state.output, PREVIEW_MAX_CHARS)

  return buildSummaryOnlyPresentation(
    props,
    [
      artifact ? { text: artifact, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
      previewText ? { text: previewText, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    ],
    artifact ?? previewText,
  )
}

export function createWebfetchHiddenStepPresentation(props: ToolPartProps): HiddenStepPresentation {
  const url = readNonEmptyString(props.state.input.url) ?? readNonEmptyString(props.info.subtitle)
  const previewText = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? url

  return {
    preview: previewText ? { text: previewText, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    rowDetails: uniqueDetails([
      url ? { text: url, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    ]),
    summaryLabel: buildLabel(props.info.title, url),
    summaryOnly: true,
    suppressErrorPreview: true,
  }
}

export function createBashHiddenStepPresentation(props: ToolPartProps): HiddenStepPresentation {
  const command =
    readNonEmptyString(props.state.input.command) ?? readNonEmptyString(props.info.subtitle)
  const previewText = summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? command

  return {
    preview: previewText ? { text: previewText, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    rowDetails: uniqueDetails([
      command ? { text: command, kind: HIDDEN_STEP_DETAIL_KIND.text } : undefined,
    ]),
    summaryLabel: buildLabel(props.info.title, command),
    summaryOnly: true,
    suppressErrorPreview: true,
  }
}
