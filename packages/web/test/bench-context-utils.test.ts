import { describe, expect, test } from "bun:test"
import {
  benchContextTargetFromBenchTarget,
  buildBenchSurfaceContextSnapshot,
  workspaceFileTarget,
} from "../src/components/bench/bench-context-utils"
import { absoluteWorkspaceFilePath } from "../src/lib/workspace-file-paths"

describe("bench context utilities", () => {
  test("preserves object revision identity in published Bench context targets", () => {
    expect(
      benchContextTargetFromBenchTarget({
        directory: "/repo",
        route: "/repo/objects/resource/book-1?view=reader&revision=rev-2",
        status: "ready",
        title: "Book",
        target: {
          type: "object",
          ref: {
            kind: "resource",
            objectID: "book-1",
            revisionID: "rev-2",
            itemID: null,
          },
          viewID: "reader",
        },
      }),
    ).toMatchObject({
      type: "object",
      ref: {
        kind: "resource",
        objectID: "book-1",
        revisionID: "rev-2",
        itemID: null,
      },
      viewID: "reader",
    })
  })

  test("joins workspace file paths with the workspace's native separator", () => {
    expect(
      absoluteWorkspaceFilePath({
        directory: "/Users/me/project/",
        path: "/docs/design.md",
      }),
    ).toBe("/Users/me/project/docs/design.md")
    expect(
      absoluteWorkspaceFilePath({
        directory: "C:\\Users\\me\\project\\",
        path: "/docs/design.md",
      }),
    ).toBe("C:\\Users\\me\\project\\docs\\design.md")
  })

  test("publishes a Notes-root document target", () => {
    const publishedTarget = workspaceFileTarget({
      directory: "/Users/me/Buddy/Notes",
      path: "Research.md",
      route: "/notebook/markdown?root=notes&path=Research.md",
      status: "dirty",
      title: "Research",
    })
    const snapshot = buildBenchSurfaceContextSnapshot({
      target: {
        type: "workspace-file",
        root: "notes",
        path: "Research.md",
        viewer: "markdown",
      },
      directory: "/Users/me/Buddy/Notebook",
      route: "/notebook/markdown?root=notes&path=Research.md",
      semanticRevision: 1,
      enrichment: {
        targetStatus: "dirty",
        target: publishedTarget,
        metadata: [],
        content: "Draft",
      },
    })

    expect(snapshot.context.target).toEqual(publishedTarget)
    expect(snapshot.context.targetKey).toContain("workspace-file")
    expect(snapshot.context.targetKey).toContain("notes")
  })
})
