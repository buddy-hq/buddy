import { describe, expect, test } from "bun:test"

import {
  absoluteWorkspaceFilePath,
  workspaceRelativeFilePath,
} from "../src/lib/workspace-file-paths"

describe("workspaceRelativeFilePath", () => {
  test("returns the notebook-relative path of a file inside the notebook", () => {
    expect(
      workspaceRelativeFilePath({
        directory: "/notebooks/llm",
        path: "/notebooks/llm/notes/tracker.md",
      }),
    ).toBe("notes/tracker.md")
    expect(
      workspaceRelativeFilePath({ directory: "/notebooks/llm/", path: "/notebooks/llm/model.py" }),
    ).toBe("model.py")
  })

  test("rejects paths that are not inside the notebook", () => {
    const directory = "/notebooks/llm"
    expect(workspaceRelativeFilePath({ directory, path: "/notebooks/llm-old/model.py" })).toBe(
      undefined,
    )
    expect(workspaceRelativeFilePath({ directory, path: "/tmp/model.py" })).toBe(undefined)
    expect(workspaceRelativeFilePath({ directory, path: "/notebooks/llm" })).toBe(undefined)
    expect(workspaceRelativeFilePath({ directory, path: "/notebooks/llm/../secret.md" })).toBe(
      undefined,
    )
    expect(workspaceRelativeFilePath({ directory, path: "model.py" })).toBe(undefined)
  })

  test("matches Windows paths across separators and drive letter case", () => {
    expect(
      workspaceRelativeFilePath({
        directory: "C:\\Notebooks\\LLM",
        path: "c:\\notebooks\\llm\\src\\model.py",
      }),
    ).toBe("src/model.py")
  })

  test("inverts absoluteWorkspaceFilePath", () => {
    for (const directory of ["/notebooks/llm", "D:\\Notebooks\\LLM"]) {
      const path = absoluteWorkspaceFilePath({ directory, path: "src/model.py" })
      expect(workspaceRelativeFilePath({ directory, path })).toBe("src/model.py")
    }
  })
})
