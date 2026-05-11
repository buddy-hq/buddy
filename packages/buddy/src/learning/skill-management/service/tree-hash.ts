import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { collectRegularSkillFiles, toPosixRelativePath } from "./tree-limits"

export const SKILL_TREE_HASH_ALGORITHM = "tree-sha256-v1"

const HASH_RECORD_KIND = "file"
const HASH_RECORD_SEPARATOR = "\0"

export async function computeSkillTreeSha256(root: string): Promise<string> {
  const resolvedRoot = path.resolve(root)
  const files = await collectRegularSkillFiles(resolvedRoot)
  const digest = createHash("sha256")

  for (const file of files) {
    const relativePath = toPosixRelativePath(resolvedRoot, file)
    const pathBytes = Buffer.from(relativePath, "utf8")
    const fileBytes = await fsp.readFile(file)

    digest.update(HASH_RECORD_KIND)
    digest.update(HASH_RECORD_SEPARATOR)
    digest.update(String(pathBytes.byteLength))
    digest.update(HASH_RECORD_SEPARATOR)
    digest.update(pathBytes)
    digest.update(HASH_RECORD_SEPARATOR)
    digest.update(String(fileBytes.byteLength))
    digest.update(HASH_RECORD_SEPARATOR)
    digest.update(fileBytes)
    digest.update(HASH_RECORD_SEPARATOR)
  }

  return digest.digest("hex")
}
