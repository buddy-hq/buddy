import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { Global } from "../storage/global"

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function matchesFile(filename: string, hash: string): boolean {
  try {
    return sha256(readFileSync(filename)) === hash
  } catch {
    return false
  }
}

export function cacheLiteparseNativeFiles(input: {
  binding: Uint8Array
  pdfium: Uint8Array
  libraryName: string
}): string {
  const files = [
    { name: "liteparse.node", bytes: input.binding, hash: sha256(input.binding) },
    { name: input.libraryName, bytes: input.pdfium, hash: sha256(input.pdfium) },
  ]
  const hash = sha256(Buffer.from(JSON.stringify(files.map((file) => [file.name, file.hash]))))
  const parent = path.join(Global.Path.cache, "native", "liteparse")
  const directory = path.join(parent, hash)
  const bindingPath = path.join(directory, "liteparse.node")
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  if (process.platform !== "win32") chmodSync(parent, 0o700)
  const matches = () =>
    files.every((file) => matchesFile(path.join(directory, file.name), file.hash))
  if (matches()) {
    if (process.platform !== "win32") chmodSync(directory, 0o700)
    return bindingPath
  }
  const staged = mkdtempSync(path.join(parent, `${hash}-`))
  try {
    for (const file of files) {
      writeFileSync(path.join(staged, file.name), file.bytes, { mode: 0o600 })
    }
    try {
      renameSync(staged, directory)
    } catch (error) {
      if (!existsSync(directory)) throw error
      for (const file of files) {
        const destination = path.join(directory, file.name)
        if (matchesFile(destination, file.hash)) continue
        try {
          renameSync(path.join(staged, file.name), destination)
        } catch (error) {
          if (!matchesFile(destination, file.hash)) throw error
        }
      }
    }
    if (!matches()) throw new Error(`LiteParse native cache verification failed: ${directory}`)
    if (process.platform !== "win32") chmodSync(directory, 0o700)
    return bindingPath
  } finally {
    rmSync(staged, { recursive: true, force: true })
  }
}
