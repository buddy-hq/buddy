import fs from "node:fs/promises"
import path from "node:path"
import type z from "zod"
import { parseMarkdownArtifact, stringifyMarkdownArtifact } from "../markdown.js"

export function readIfFound(filepath: string) {
  return fs.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })
}

export function isAlreadyExistsError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST")
}

async function ensureParent(filepath: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
}

export async function readMarkdownFile<T>(filepath: string, schema: z.ZodType<T>): Promise<{ data: T; body: string } | undefined> {
  const contents = await readIfFound(filepath)
  if (contents === undefined) return undefined

  const parsed = parseMarkdownArtifact(contents, schema)
  return {
    data: parsed.frontmatter,
    body: parsed.body,
  }
}

export async function writeMarkdownFile(
  filepath: string,
  frontmatter: Record<string, unknown>,
  body?: string,
  options?: {
    exclusive?: boolean
  },
) {
  await ensureParent(filepath)
  const contents = stringifyMarkdownArtifact(frontmatter, body)

  if (options?.exclusive) {
    const handle = await fs.open(filepath, "wx")
    try {
      await handle.writeFile(contents, "utf8")
    } finally {
      await handle.close()
    }
    return
  }

  const tmpPath = `${filepath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(tmpPath, contents, "utf8")
  await fs.rename(tmpPath, filepath)
}

export async function listMarkdownFiles(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return []
    }
    throw error
  })

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(directory, entry.name))
}
