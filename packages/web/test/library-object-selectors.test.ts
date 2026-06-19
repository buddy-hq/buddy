import { describe, expect, test } from "bun:test"
import type { ObjectsListResponse } from "@buddy/sdk/types"
import {
  countMediaObjectsByDirectory,
  selectMediaLibraryObjects,
} from "../src/components/layout/chat-left-sidebar/library-object-selectors"

type ObjectIndexItem = ObjectsListResponse["objects"][number]

const MEDIA_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const FIGURE_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"
const QUESTION_SET_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX"
const UNAVAILABLE_MEDIA_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAY"

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

describe("library object selectors", () => {
  test("selects and sorts media-tab objects from the unified index", () => {
    const selected = selectMediaLibraryObjects({
      data: {
        objects: [
          mediaObject,
          unavailableMediaObject,
          questionSetObject,
          figureObject,
        ],
        loadErrors: [],
      },
    })

    expect(selected.map((object) => object.objectID)).toEqual([
      FIGURE_OBJECT_ID,
      MEDIA_OBJECT_ID,
    ])
  })

  test("excludes unavailable media presentations", () => {
    const selected = selectMediaLibraryObjects({
      data: {
        objects: [unavailableMediaObject],
        loadErrors: [],
      },
    })

    expect(selected).toEqual([])
  })

  test("counts media-tab objects per directory from unified query snapshots", () => {
    const counts = countMediaObjectsByDirectory({
      directories: ["/repo-a", "/repo-b"],
      snapshots: [
        {
          data: {
            objects: [mediaObject, unavailableMediaObject, figureObject],
            loadErrors: [],
          },
        },
        { data: { objects: [questionSetObject, figureObject], loadErrors: [] } },
      ],
    })

    expect(counts.get("/repo-a")).toBe(2)
    expect(counts.get("/repo-b")).toBe(1)
  })
})
