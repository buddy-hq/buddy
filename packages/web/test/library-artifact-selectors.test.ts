import { describe, expect, test } from "bun:test"
import type { ArtifactsListResponse } from "@buddy/sdk/types"
import {
  countMediaArtifactsByDirectory,
  mediaArtifactSubtitle,
  selectMediaLibraryArtifacts,
} from "../src/components/layout/chat-left-sidebar/library-artifact-selectors"

type ArtifactIndexItem = ArtifactsListResponse["artifacts"][number]

const MEDIA_ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const FIGURE_ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW"
const QUESTION_SET_ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX"
const UNAVAILABLE_MEDIA_ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAY"

const mediaArtifact: ArtifactIndexItem = {
  artifactID: MEDIA_ARTIFACT_ID,
  kind: "media-presentation",
  title: "Worksheet",
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
  summary: {
    layout: "gallery",
    items: [
      {
        id: "media_item_1",
        inputPath: "worksheet.png",
        absolutePath: "/repo/worksheet.png",
        displayPath: "worksheet.png",
        workspacePath: "worksheet.png",
        fileName: "worksheet.png",
        mediaKind: "image",
        renderMode: "image",
        mimeType: "image/png",
        sizeBytes: 42,
        modifiedAt: null,
        rawUrl: "/api/artifacts/media-presentation/01ARZ3NDEKTSV4RRFFQ69G5FAV/raw/media_item_1",
        actionCapabilities: {
          canOpenDefaultApp: true,
          canRevealInFileManager: true,
          canOpenInWorkspacePanel: true,
        },
        availability: {
          status: "available",
          message: null,
        },
      },
    ],
  },
}

const figureArtifact: ArtifactIndexItem = {
  artifactID: FIGURE_ARTIFACT_ID,
  kind: "figure",
  title: "Triangle",
  createdAt: "2026-01-04T00:00:00.000Z",
  updatedAt: "2026-01-04T00:00:00.000Z",
  sourceHash: "a".repeat(64),
  summary: {
    mime: "image/svg+xml",
    alt: "Triangle ABC",
    caption: "Right triangle",
    repairAttempts: 0,
  },
}

const unavailableMediaArtifact: ArtifactIndexItem = {
  ...mediaArtifact,
  artifactID: UNAVAILABLE_MEDIA_ARTIFACT_ID,
  title: "Missing worksheet",
  summary: {
    ...mediaArtifact.summary,
    items: mediaArtifact.summary.items.map((item) => ({
      ...item,
      availability: {
        status: "missing",
        message: "File not found",
      },
    })),
  },
}

const questionSetArtifact: ArtifactIndexItem = {
  artifactID: QUESTION_SET_ARTIFACT_ID,
  kind: "question-set",
  title: "Practice",
  createdAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-01-05T00:00:00.000Z",
  summary: {
    groupType: "practice",
    questionCount: 3,
  },
}

describe("library artifact selectors", () => {
  test("selects and sorts media-tab artifacts from the unified index", () => {
    const selected = selectMediaLibraryArtifacts([
      {
        data: {
          artifacts: [mediaArtifact, unavailableMediaArtifact, questionSetArtifact],
        },
      },
      {
        data: {
          artifacts: [figureArtifact],
        },
      },
    ])

    expect(selected.map((artifact) => artifact.artifactID)).toEqual([
      FIGURE_ARTIFACT_ID,
      MEDIA_ARTIFACT_ID,
    ])
    expect(mediaArtifactSubtitle(selected[0])).toBe("Right triangle")
    expect(mediaArtifactSubtitle(selected[1])).toBe("1 file · gallery")
  })

  test("excludes media presentations with no available items", () => {
    const selected = selectMediaLibraryArtifacts([
      {
        data: {
          artifacts: [unavailableMediaArtifact],
        },
      },
    ])

    expect(selected).toEqual([])
  })

  test("counts media-tab artifacts per directory across kind-scoped query snapshots", () => {
    const counts = countMediaArtifactsByDirectory({
      directories: ["/repo-a", "/repo-b"],
      snapshots: [
        { data: { artifacts: [mediaArtifact, unavailableMediaArtifact] } },
        { data: { artifacts: [figureArtifact] } },
        { data: { artifacts: [questionSetArtifact] } },
        { data: { artifacts: [] } },
        { data: { artifacts: [questionSetArtifact] } },
        { data: { artifacts: [figureArtifact] } },
      ],
    })

    expect(counts.get("/repo-a")).toBe(2)
    expect(counts.get("/repo-b")).toBe(1)
  })
})
