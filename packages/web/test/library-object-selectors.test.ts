import { describe, expect, test } from "bun:test"
import type { ObjectsListResponse } from "@buddy/sdk/types"
import {
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
} from "../src/components/layout/chat-left-sidebar/library-object-selectors"

type ObjectIndexItem = ObjectsListResponse["objects"][number]

const MEDIA_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const FIGURE_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"
const QUESTION_SET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX"
const UNAVAILABLE_MEDIA_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAY"
const HTML_WIDGET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAZ"
const SOURCE_ONLY_WIDGET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0"

const mediaObject: ObjectIndexItem = {
  objectID: MEDIA_OBJECT_ID,
  kind: "media-presentation",
  title: "Worksheet",
  status: "ready",
  lifecycle: "revisioned",
  sourceRoot: null,
  primaryViewID: "gallery",
  surfaces: ["bench", "library"],
  hasLibraryView: true,
  updatedAt: "2026-01-03T00:00:00.000Z",
}

const figureObject: ObjectIndexItem = {
  objectID: FIGURE_OBJECT_ID,
  kind: "figure",
  title: "Triangle",
  status: "ready",
  lifecycle: "revisioned",
  sourceRoot: null,
  primaryViewID: "rendered",
  surfaces: ["bench", "library"],
  hasLibraryView: true,
  updatedAt: "2026-01-04T00:00:00.000Z",
}

const unavailableMediaObject: ObjectIndexItem = {
  ...mediaObject,
  objectID: UNAVAILABLE_MEDIA_OBJECT_ID,
  title: "Missing worksheet",
  status: "unavailable",
}

const questionSetObject: ObjectIndexItem = {
  objectID: QUESTION_SET_OBJECT_ID,
  kind: "question-set",
  title: "Practice",
  status: "ready",
  lifecycle: "revisioned",
  sourceRoot: null,
  primaryViewID: "practice",
  surfaces: ["bench", "library"],
  hasLibraryView: true,
  updatedAt: "2026-01-05T00:00:00.000Z",
}

const legacyHtmlWidgetObject: ObjectIndexItem = {
  objectID: HTML_WIDGET_OBJECT_ID,
  kind: "html-widget",
  title: "Interactive Widget",
  status: "ready",
  lifecycle: "live",
  sourceRoot: ".buddy/objects/v1/html-widget/01ARZ3NDEKTSV4RRFFQ69G5FAZ/source",
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

describe("library object selectors", () => {
  test("selects Bench-visible HTML widgets without a library surface", () => {
    const selected = selectHtmlWidgetObjects({
      data: {
        objects: [sourceOnlyWidgetObject, legacyHtmlWidgetObject],
        loadErrors: [],
      },
    })

    expect(selected.map((object) => object.objectID)).toEqual([HTML_WIDGET_OBJECT_ID])
  })

  test("selects and sorts media-tab objects from the unified index", () => {
    const selected = selectMediaLibraryObjects({
      data: {
        objects: [mediaObject, unavailableMediaObject, questionSetObject, figureObject],
        loadErrors: [],
      },
    })

    expect(selected.map((object) => object.objectID)).toEqual([FIGURE_OBJECT_ID, MEDIA_OBJECT_ID])
  })
})
