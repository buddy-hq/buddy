import { InvalidHtmlWidgetIDError } from "./service/path"

export class HtmlWidgetNotFoundError extends Error {
  constructor(widgetID: string) {
    super(`HTML widget '${widgetID}' was not found.`)
    this.name = "HtmlWidgetNotFoundError"
  }
}

export class HtmlWidgetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HtmlWidgetValidationError"
  }
}

export function mapHtmlWidgetRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidHtmlWidgetIDError || error instanceof HtmlWidgetValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof HtmlWidgetNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}
