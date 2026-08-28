import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { computeSkillTreeSha256 } from "../../src/learning/skill-management/service/tree-hash"
import { temporaryDirectory, type TemporaryDirectory } from "../helpers/temporary-directory"

const TWO_FILE_VECTOR_TREE_SHA256 =
  "e68e3e72dce7e1b774af07ffa52df0955b06b236f4b0cad4b341e3763ebf92a8"

async function tempSkillRoot(prefix: string): Promise<TemporaryDirectory> {
  return temporaryDirectory({ prefix: `${prefix}-` })
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const filepath = path.join(root, ...relativePath.split("/"))
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(filepath, content, "utf8")
}

describe("tree-sha256-v1", () => {
  test("hashes sorted framed records with POSIX paths", async () => {
    await using root = await tempSkillRoot("buddy-tree-hash")
    await writeFile(root.path, "z.txt", "last")
    await writeFile(root.path, "nested/a.txt", "first")

    const hash = await computeSkillTreeSha256(root.path)

    expect(hash).toBe(TWO_FILE_VECTOR_TREE_SHA256)
  })

  test("includes dotfiles but excludes source-control and Buddy metadata", async () => {
    await using root = await tempSkillRoot("buddy-tree-hash-dotfiles")
    await writeFile(root.path, "SKILL.md", "skill")
    await writeFile(root.path, ".visible", "included")
    const beforeExcludedChanges = await computeSkillTreeSha256(root.path)

    await writeFile(root.path, ".git/config", "ignored git metadata")
    await writeFile(root.path, ".buddy/install.json", "ignored buddy metadata")
    await writeFile(root.path, ".buddy-skill-lock.json", "ignored buddy lock")
    expect(await computeSkillTreeSha256(root.path)).toBe(beforeExcludedChanges)

    await writeFile(root.path, ".buddy/custom.json", "included buddy subtree content")
    expect(await computeSkillTreeSha256(root.path)).not.toBe(beforeExcludedChanges)

    await writeFile(root.path, ".visible", "included changed")
    expect(await computeSkillTreeSha256(root.path)).not.toBe(beforeExcludedChanges)
  })

  test("changes when file content changes", async () => {
    await using root = await tempSkillRoot("buddy-tree-hash-content")
    await writeFile(root.path, "SKILL.md", "before")
    const before = await computeSkillTreeSha256(root.path)

    await writeFile(root.path, "SKILL.md", "after")

    expect(await computeSkillTreeSha256(root.path)).not.toBe(before)
  })

  test("rejects symlinks", async () => {
    await using root = await tempSkillRoot("buddy-tree-hash-symlink")
    await writeFile(root.path, "SKILL.md", "skill")
    await fsp.symlink(path.join(root.path, "SKILL.md"), path.join(root.path, "link.md"))

    await expect(computeSkillTreeSha256(root.path)).rejects.toThrow("symlink")
  })
})
