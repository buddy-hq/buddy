import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { computeSkillTreeSha256 } from "../../src/learning/skill-management/service/tree-hash"

async function tempSkillRoot(prefix: string): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const filepath = path.join(root, ...relativePath.split("/"))
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(filepath, content, "utf8")
}

function expectedTreeHash(records: Array<{ path: string; content: string }>): string {
  const digest = createHash("sha256")
  for (const record of records.toSorted((left, right) => (left.path < right.path ? -1 : 1))) {
    const pathBytes = Buffer.from(record.path, "utf8")
    const fileBytes = Buffer.from(record.content, "utf8")
    digest.update("file")
    digest.update("\0")
    digest.update(String(pathBytes.byteLength))
    digest.update("\0")
    digest.update(pathBytes)
    digest.update("\0")
    digest.update(String(fileBytes.byteLength))
    digest.update("\0")
    digest.update(fileBytes)
    digest.update("\0")
  }
  return digest.digest("hex")
}

describe("tree-sha256-v1", () => {
  test("hashes sorted framed records with POSIX paths", async () => {
    const root = await tempSkillRoot("buddy-tree-hash")
    await writeFile(root, "z.txt", "last")
    await writeFile(root, "nested/a.txt", "first")

    const hash = await computeSkillTreeSha256(root)

    expect(hash).toBe(
      expectedTreeHash([
        { path: "nested/a.txt", content: "first" },
        { path: "z.txt", content: "last" },
      ]),
    )
  })

  test("includes dotfiles but excludes source-control and Buddy metadata", async () => {
    const root = await tempSkillRoot("buddy-tree-hash-dotfiles")
    await writeFile(root, "SKILL.md", "skill")
    await writeFile(root, ".visible", "included")
    const beforeExcludedChanges = await computeSkillTreeSha256(root)

    await writeFile(root, ".git/config", "ignored git metadata")
    await writeFile(root, ".buddy/install.json", "ignored buddy metadata")
    await writeFile(root, ".buddy-skill-lock.json", "ignored buddy lock")
    expect(await computeSkillTreeSha256(root)).toBe(beforeExcludedChanges)

    await writeFile(root, ".buddy/custom.json", "included buddy subtree content")
    expect(await computeSkillTreeSha256(root)).not.toBe(beforeExcludedChanges)

    await writeFile(root, ".visible", "included changed")
    expect(await computeSkillTreeSha256(root)).not.toBe(beforeExcludedChanges)
  })

  test("changes when file content changes", async () => {
    const root = await tempSkillRoot("buddy-tree-hash-content")
    await writeFile(root, "SKILL.md", "before")
    const before = await computeSkillTreeSha256(root)

    await writeFile(root, "SKILL.md", "after")

    expect(await computeSkillTreeSha256(root)).not.toBe(before)
  })

  test("rejects symlinks", async () => {
    const root = await tempSkillRoot("buddy-tree-hash-symlink")
    await writeFile(root, "SKILL.md", "skill")
    await fsp.symlink(path.join(root, "SKILL.md"), path.join(root, "link.md"))

    await expect(computeSkillTreeSha256(root)).rejects.toThrow("symlink")
  })
})
