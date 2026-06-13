import crypto from "node:crypto"
import path from "node:path"

const HTML_WIDGET_ARTIFACT_ROOT_NAME = "html-widget-artifacts" as const
const HTML_WIDGET_SOURCE_ROOT_NAME = "html-widget-sources" as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export class InvalidHtmlWidgetIDError extends Error {
  constructor(widgetID: string) {
    super(`Invalid HTML widget id '${widgetID}'.`)
    this.name = "InvalidHtmlWidgetIDError"
  }
}

function artifactRoot(directory: string): string {
  return path.join(directory, ".buddy", HTML_WIDGET_ARTIFACT_ROOT_NAME)
}

function sourceRoot(directory: string): string {
  return path.join(directory, ".buddy", HTML_WIDGET_SOURCE_ROOT_NAME)
}

function sanitizeWidgetID(widgetID: string): string {
  if (!UUID_PATTERN.test(widgetID)) {
    throw new InvalidHtmlWidgetIDError(widgetID)
  }
  return widgetID
}

function artifactDirectory(directory: string, widgetID: string): string {
  return path.join(artifactRoot(directory), sanitizeWidgetID(widgetID))
}

function manifestFile(directory: string, widgetID: string): string {
  return path.join(artifactDirectory(directory, widgetID), "manifest.json")
}

function sourceFile(directory: string, widgetID: string): string {
  return path.join(artifactDirectory(directory, widgetID), "index.html")
}

export function buildHtmlWidgetID(): string {
  return crypto.randomUUID()
}

export const HtmlWidgetPath = {
  artifactDirectory,
  artifactRoot,
  manifestFile,
  sanitizeWidgetID,
  sourceFile,
  sourceRoot,
}
