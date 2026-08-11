import { describe, expect, test } from "bun:test"
import type { ObjectsListResponse } from "@buddy/sdk/types"
import { notebookSearchResultFromWorkspaceObject } from "../src/state/notebook-search-results"

type ObjectIndexItem = ObjectsListResponse["objects"][number]

const HTML_WIDGET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const SOURCE_ONLY_WIDGET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"

const legacyHtmlWidgetObject: ObjectIndexItem = {
  objectID: HTML_WIDGET_OBJECT_ID,
  kind: "html-widget",
  title: "Interactive Widget",
  status: "ready",
  lifecycle: "live",
  sourceRoot: ".buddy/objects/v1/html-widget/01ARZ3NDEKTSV4RRFFQ69G5FAV/source",
  primaryViewID: "runtime",
  surfaces: ["bench", "inline", "source"],
  hasLibraryView: false,
  updatedAt: "2026-01-06T00:00:00.000Z",
}

const sourceOnlyWidgetObject: ObjectIndexItem = {
  ...legacyHtmlWidgetObject,
  objectID: SOURCE_ONLY_WIDGET_OBJECT_ID,
  title: "Source-only Widget",
  surfaces: ["source"],
}

describe("notebook search results", () => {
  test("converts legacy Bench-visible HTML widgets into creation results", () => {
    const result = notebookSearchResultFromWorkspaceObject(legacyHtmlWidgetObject)

    expect(result).toMatchObject({
      id: `creation:${HTML_WIDGET_OBJECT_ID}`,
      kind: "creation",
      title: "Interactive Widget",
      target: {
        type: "object",
        kind: "html-widget",
        objectID: HTML_WIDGET_OBJECT_ID,
      },
    })
  })

  test("does not convert source-only objects into sidebar search results", () => {
    expect(notebookSearchResultFromWorkspaceObject(sourceOnlyWidgetObject)).toBeUndefined()
  })
})
