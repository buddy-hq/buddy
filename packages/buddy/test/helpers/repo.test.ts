import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createGitRepo, runGit } from "./repo"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

describe("test Git repository", () => {
  test("creates a committed repository and removes it when its scope exits", async () => {
    let repositoryPath = ""

    {
      await using repository = await createGitRepo("buddy-disposable-repo", {
        readme: "# disposable repository\n",
      })
      repositoryPath = repository.path

      expect(await fs.readFile(path.join(repository.path, "README.md"), "utf8")).toBe(
        "# disposable repository\n",
      )
      expect(runGit(repository.path, ["diff", "--quiet", "HEAD"])).toBeUndefined()
    }

    expect(await pathExists(repositoryPath)).toBe(false)
  })
})
