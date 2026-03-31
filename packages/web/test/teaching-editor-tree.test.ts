import { describe, expect, test } from "bun:test"
import { buildFileTree, flattenFileTree } from "../src/components/teaching/teaching-editor-tree"

describe("teaching-editor-tree", () => {
  test("builds and flattens files in stable directory-first order", () => {
    const tree = buildFileTree([
      {
        relativePath: "src/zeta.ts",
        filePath: "/repo/src/zeta.ts",
        checkpointFilePath: "/repo/.checkpoint/src/zeta.ts",
        language: "ts",
      },
      {
        relativePath: "README.md",
        filePath: "/repo/README.md",
        checkpointFilePath: "/repo/.checkpoint/README.md",
        language: "md",
      },
      {
        relativePath: "src/a/alpha.ts",
        filePath: "/repo/src/a/alpha.ts",
        checkpointFilePath: "/repo/.checkpoint/src/a/alpha.ts",
        language: "ts",
      },
      {
        relativePath: "src/a/beta.ts",
        filePath: "/repo/src/a/beta.ts",
        checkpointFilePath: "/repo/.checkpoint/src/a/beta.ts",
        language: "ts",
      },
    ])

    const rows = flattenFileTree(tree)
    const labels = rows.map((row) =>
      row.node.type === "directory"
        ? `dir:${row.node.key}@${row.depth}`
        : `file:${row.node.key}@${row.depth}`,
    )

    expect(labels).toEqual([
      "dir:src@0",
      "dir:src/a@1",
      "file:src/a/alpha.ts@2",
      "file:src/a/beta.ts@2",
      "file:src/zeta.ts@1",
      "file:README.md@0",
    ])
  })
})
