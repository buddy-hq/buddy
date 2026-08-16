import { randomUUID } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"

const TEMPORARY_FILE_EXTENSION = "tmp"
const DEFAULT_JSON_INDENT_SPACES = 2

function temporaryFilePath(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${randomUUID()}.${TEMPORARY_FILE_EXTENSION}`,
  )
}

async function writeTextFileAtomic(
  targetPath: string,
  content: string,
  beforeReplace?: () => Promise<void>,
): Promise<void> {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = temporaryFilePath(targetPath)

  try {
    await fsp.writeFile(tempPath, content, "utf8")
    await beforeReplace?.()
    await fsp.rename(tempPath, targetPath)
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function writeTextFileAtomicSync(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const tempPath = temporaryFilePath(targetPath)

  try {
    fs.writeFileSync(tempPath, content, "utf8")
    fs.renameSync(tempPath, targetPath)
  } catch (error) {
    fs.rmSync(tempPath, { force: true })
    throw error
  }
}

async function writeJsonFileAtomic<TValue>(
  targetPath: string,
  value: TValue,
  indentSpaces = DEFAULT_JSON_INDENT_SPACES,
): Promise<void> {
  await writeTextFileAtomic(targetPath, `${JSON.stringify(value, null, indentSpaces)}\n`)
}

function writeJsonFileAtomicSync<TValue>(
  targetPath: string,
  value: TValue,
  indentSpaces = DEFAULT_JSON_INDENT_SPACES,
): void {
  writeTextFileAtomicSync(targetPath, `${JSON.stringify(value, null, indentSpaces)}\n`)
}

export {
  writeJsonFileAtomic,
  writeJsonFileAtomicSync,
  writeTextFileAtomic,
  writeTextFileAtomicSync,
}
