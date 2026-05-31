import { describe, expect, test } from "bun:test"
import { resolveWhiteboardShareRevision } from "../src/components/whiteboard/whiteboard-pane"
import type { PersistedWhiteboardElement } from "../src/components/whiteboard/whiteboard-elements"

const previewElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "preview", x: 0, y: 0, width: 120, height: 80 },
]
const latestElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "latest", x: 0, y: 0, width: 120, height: 80 },
]
const draftElements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "draft", x: 0, y: 0, width: 120, height: 80 },
]

describe("whiteboard pane state helpers", () => {
  test("shares the visible history preview over latest and live draft state", () => {
    const preview = { elements: previewElements }
    const latest = { elements: latestElements }
    const draft = {
      elements: draftElements,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
    }

    expect(
      resolveWhiteboardShareRevision({
        previewRevisionID: "rev-preview",
        displayedRevision: preview,
        liveDraftRevision: draft,
        latestRevision: latest,
      }),
    ).toBe(preview)
  })

  test("shares the editable live draft before the fetched latest revision", () => {
    const latest = { elements: latestElements }
    const draft = {
      elements: draftElements,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
    }

    expect(
      resolveWhiteboardShareRevision({
        liveDraftRevision: draft,
        latestRevision: latest,
      }),
    ).toBe(draft)
  })
})
