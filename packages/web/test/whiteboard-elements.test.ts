import { describe, expect, test } from "bun:test"
import {
  toEditorElementConversion,
  toPersistedElements,
  viewportToAppState,
  type PersistedWhiteboardElement,
} from "../src/components/whiteboard/whiteboard-elements"

describe("whiteboard element conversion", () => {
  test("skips unsupported persisted elements instead of throwing during render", () => {
    const elements: PersistedWhiteboardElement[] = [
      { type: "cameraUpdate", id: "bad-camera", x: 0, y: 0, width: 800, height: 600 },
      { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 80 },
    ]

    const conversion = toEditorElementConversion(elements)

    expect(conversion.groups).toEqual([
      {
        kind: "skeleton",
        elements: [
          {
            type: "rectangle",
            id: "node",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            seed: expect.any(Number),
          },
        ],
      },
    ])
    expect(conversion.warning).toContain("Skipped 1 unsupported whiteboard element")
    expect(conversion.warning).toContain("cameraUpdate:bad-camera")
  })

  test("keeps editor-native elements out of shorthand conversion groups", () => {
    const elements: PersistedWhiteboardElement[] = [
      {
        type: "rectangle",
        id: "native-box",
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        angle: 0,
        version: 2,
        versionNonce: 123,
        isDeleted: false,
        groupIds: [],
      },
      {
        type: "rectangle",
        id: "skeleton-box",
        x: 180,
        y: 0,
        width: 120,
        height: 80,
        label: { text: "Convert me" },
      },
    ]

    expect(toEditorElementConversion(elements).groups.map((group) => group.kind)).toEqual([
      "native",
      "skeleton",
    ])
  })

  test("drops unsupported editor elements before learner autosave", () => {
    expect(
      toPersistedElements([
        {
          type: "rectangle",
          id: "box",
          x: 0,
          y: 0,
          width: 120,
          height: 80,
          isDeleted: false,
        },
        {
          type: "frame",
          id: "frame",
          x: 0,
          y: 0,
          width: 240,
          height: 160,
          isDeleted: false,
        },
        {
          type: "image",
          id: "pasted-image",
          x: 0,
          y: 0,
          width: 240,
          height: 160,
          isDeleted: false,
        },
        {
          type: "line",
          id: "malformed-line",
          x: 0,
          y: 0,
          isDeleted: false,
        },
        {
          type: "text",
          id: "deleted-text",
          x: 0,
          y: 0,
          text: "deleted",
          isDeleted: true,
        },
      ]).map((element) => element.id),
    ).toEqual(["box"])
  })

  test("restores persisted viewport with matching zoom and scaled scroll", () => {
    expect(
      viewportToAppState(
        { x: 100, y: 50, width: 400, height: 300 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      scrollX: -200,
      scrollY: -100,
      zoomValue: 2,
    })
  })
})
