import fs from "node:fs/promises"
import { CurriculumPath } from "./curriculum-path.js"

const DEFAULT_CURRICULUM_MARKDOWN = [
  "# Learning Curriculum",
  "",
  "## Getting Started",
  "- [ ] Define your learning goal for this workspace",
  "- [ ] Add the first checkpoint you want to complete",
  "",
].join("\n")

function hasChecklistMarker(markdown: string) {
  return /(^|\n)\s*[-*]\s+\[(?: |x|X)\]\s+/.test(markdown)
}

export namespace CurriculumService {
  type Document = {
    path: string
    markdown: string
  }

  // Keep the project-local file as the canonical curriculum document.
  async function readFile(directory: string): Promise<Document | undefined> {
    const filepath = CurriculumPath.file(directory)
    const markdown = await fs.readFile(filepath, "utf8").catch(() => undefined)
    if (markdown === undefined) return undefined

    return {
      path: filepath,
      markdown,
    }
  }

  async function writeFile(directory: string, markdown: string): Promise<Document> {
    const filepath = CurriculumPath.file(directory)
    await fs.mkdir(CurriculumPath.directory(directory), { recursive: true })
    await fs.writeFile(filepath, markdown, "utf8")

    return {
      path: filepath,
      markdown,
    }
  }

  export function validate(markdown: string) {
    if (!markdown.trim()) {
      throw new Error("Curriculum markdown cannot be empty")
    }
    if (!hasChecklistMarker(markdown)) {
      throw new Error("Curriculum must include at least one checklist task marker (e.g. - [ ] task)")
    }
  }

  export async function peek(directory: string): Promise<Document | undefined> {
    return readFile(directory)
  }

  export async function read(directory: string): Promise<Document> {
    const existing = await readFile(directory)
    if (existing) return existing

    return {
      path: CurriculumPath.file(directory),
      markdown: DEFAULT_CURRICULUM_MARKDOWN,
    }
  }

  export async function write(directory: string, markdown: string) {
    validate(markdown)
    return writeFile(directory, markdown)
  }

  export async function persist(directory: string, markdown: string) {
    validate(markdown)
    return writeFile(directory, markdown)
  }
}
