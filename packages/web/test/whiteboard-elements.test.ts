import { describe, expect, test } from "bun:test"
import {
  createWhiteboardRenderReport,
  resolveWhiteboardRemoteSceneViewport,
  toEditorElementConversion,
  toPersistedElements,
  viewportToAppState,
  whiteboardRenderReportSignature,
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
          id: "dimensionless-line",
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
    ).toEqual(["box", "dimensionless-line"])
  })

  test("restores persisted viewport with matching zoom and scaled scroll", () => {
    expect(
      viewportToAppState({ x: 100, y: 50, width: 400, height: 300 }, { width: 800, height: 600 }),
    ).toEqual({
      scrollX: -200,
      scrollY: -100,
      zoomValue: 2,
    })
  })

  test("restores remote viewport only when the session canvas first mounts", () => {
    const viewport = { x: 100, y: 50, width: 400, height: 300 }

    expect(
      resolveWhiteboardRemoteSceneViewport({
        phase: "initial-mount",
        viewport,
      }),
    ).toBe(viewport)
    expect(
      resolveWhiteboardRemoteSceneViewport({
        phase: "mounted-update",
        viewport,
      }),
    ).toBeUndefined()
  })

  test("builds rendered layout reports from measured scene element bounds", () => {
    const report = createWhiteboardRenderReport({
      boardID: "board_1",
      appState: {
        scrollX: -100,
        scrollY: -50,
        width: 800,
        height: 600,
        zoom: { value: 2 },
      },
      elements: [
        {
          id: "box",
          type: "rectangle",
          version: 1,
          versionNonce: 11,
          backgroundColor: "#663333",
          fillStyle: "solid",
          opacity: 100,
        },
        {
          id: "label",
          type: "text",
          version: 2,
          versionNonce: 12,
          containerId: "box",
          text: "Rendered label",
          fontSize: 13,
        },
        {
          id: "deleted",
          type: "text",
          version: 1,
          versionNonce: 13,
          isDeleted: true,
          text: "deleted",
        },
      ],
      readBounds: (elements) => {
        if (elements.length > 1) return [0, 0, 160, 90]
        if (elements[0]?.id === "label") return [10, 20, 140, 44]
        return [0, 0, 160, 90]
      },
    })

    expect(report).toMatchObject({
      boardID: "board_1",
      viewport: { x: 50, y: 25, width: 400, height: 300 },
      canvas: { width: 800, height: 600, zoom: 2 },
      contentBounds: { x: 0, y: 0, width: 160, height: 90 },
      elements: [
        {
          id: "box",
          backgroundColor: "#663333",
          fillStyle: "solid",
          opacity: 100,
          bounds: { x: 0, y: 0, width: 160, height: 90 },
        },
        {
          id: "label",
          containerId: "box",
          text: "Rendered label",
          fontSize: 13,
          bounds: { x: 10, y: 20, width: 130, height: 24 },
        },
      ],
    })
  })

  test("dedupes rendered layout reports by board, element versions, viewport, and canvas", () => {
    const base = createWhiteboardRenderReport({
      boardID: "board_1",
      appState: {
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
        zoom: { value: 1 },
      },
      elements: [{ id: "box", type: "rectangle", version: 1, versionNonce: 11 }],
      readBounds: () => [0, 0, 100, 80],
    })
    const changedViewport = createWhiteboardRenderReport({
      boardID: "board_1",
      appState: {
        scrollX: -100,
        scrollY: 0,
        width: 800,
        height: 600,
        zoom: { value: 1 },
      },
      elements: [{ id: "box", type: "rectangle", version: 1, versionNonce: 11 }],
      readBounds: () => [0, 0, 100, 80],
    })
    const changedStyle = createWhiteboardRenderReport({
      boardID: "board_1",
      appState: {
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
        zoom: { value: 1 },
      },
      elements: [
        {
          id: "box",
          type: "rectangle",
          version: 1,
          versionNonce: 11,
          backgroundColor: "#663333",
          fillStyle: "solid",
          opacity: 100,
        },
      ],
      readBounds: () => [0, 0, 100, 80],
    })
    const changedFontSize = createWhiteboardRenderReport({
      boardID: "board_1",
      appState: {
        scrollX: 0,
        scrollY: 0,
        width: 800,
        height: 600,
        zoom: { value: 1 },
      },
      elements: [{ id: "box", type: "text", version: 1, versionNonce: 11, fontSize: 13 }],
      readBounds: () => [0, 0, 100, 80],
    })

    expect(whiteboardRenderReportSignature(base)).toBe(whiteboardRenderReportSignature(base))
    expect(whiteboardRenderReportSignature(base)).not.toBe(
      whiteboardRenderReportSignature(changedViewport),
    )
    expect(whiteboardRenderReportSignature(base)).not.toBe(
      whiteboardRenderReportSignature(changedStyle),
    )
    expect(whiteboardRenderReportSignature(base)).not.toBe(
      whiteboardRenderReportSignature(changedFontSize),
    )
  })
})
