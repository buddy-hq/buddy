import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const TEMPORARY_FILE_EXTENSION = "tmp"
const DEFAULT_JSON_INDENT_SPACES = 2

function temporaryFilePath(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${randomUUID()}.${TEMPORARY_FILE_EXTENSION}`,
  )
}

async function writeTextFileAtomic(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = temporaryFilePath(targetPath)

  try {
    await fs.writeFile(tempPath, content, "utf8")
    await fs.rename(tempPath, targetPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function writeJsonFileAtomic(
  targetPath: string,
  value: unknown,
  indentSpaces = DEFAULT_JSON_INDENT_SPACES,
): Promise<void> {
  await writeTextFileAtomic(targetPath, `${JSON.stringify(value, null, indentSpaces)}\n`)
}

export { writeJsonFileAtomic, writeTextFileAtomic }
