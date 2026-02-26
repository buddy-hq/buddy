import fs from "node:fs/promises"
import path from "node:path"
import { Database, eq } from "../storage/db.js"
import { CurriculumTable } from "./curriculum.sql.js"
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

  function curriculumScopeID(projectId: string, directory: string) {
    if (projectId !== "global") {
      return projectId
    }

    // OpenCode uses a shared "global" project id for non-git directories.
    // Scope these by absolute directory to prevent cross-directory leakage.
    return `global:${path.resolve(directory)}`
  }

  async function openCodeProjectID(directory: string) {
    const { Instance: OpenCodeInstance } = await import("@buddy/opencode-adapter/instance")
    return OpenCodeInstance.provide({
      directory,
      fn: () => OpenCodeInstance.project.id,
    })
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
    // Try DB first
    const projectId = await openCodeProjectID(directory)
    const scopeId = curriculumScopeID(projectId, directory)
    const row = Database.use((db) =>
      db.select().from(CurriculumTable).where(eq(CurriculumTable.project_id, scopeId)).get(),
    )

    if (row) {
      return {
        path: CurriculumPath.file(directory),
        markdown: row.markdown,
      }
    }

    // Fall back to file (migration path for existing users)
    const filepath = CurriculumPath.file(directory)
    const markdown = await fs.readFile(filepath, "utf8").catch(() => undefined)
    if (markdown === undefined) return undefined

    // Migrate file content to DB
    Database.use((db) => {
      db.insert(CurriculumTable)
        .values({
          project_id: scopeId,
          markdown,
        })
        .onConflictDoUpdate({
          target: CurriculumTable.project_id,
          set: { markdown, time_updated: Date.now() },
        })
        .run()
    })

    return { path: filepath, markdown }
  }

  export async function read(directory: string): Promise<Document> {
    const existing = await peek(directory)
    if (existing) return existing
    return {
      path: CurriculumPath.file(directory),
      markdown: DEFAULT_CURRICULUM_MARKDOWN,
    }
  }

  export async function write(directory: string, markdown: string) {
    validate(markdown)

    const projectId = await openCodeProjectID(directory)
    const scopeId = curriculumScopeID(projectId, directory)
    const filepath = CurriculumPath.file(directory)

    // Write to DB
    Database.use((db) => {
      db.insert(CurriculumTable)
        .values({
          project_id: scopeId,
          markdown,
        })
        .onConflictDoUpdate({
          target: CurriculumTable.project_id,
          set: { markdown, time_updated: Date.now() },
        })
        .run()
    })

    // Also write to file for backward compatibility
    const dir = CurriculumPath.directory(directory)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filepath, markdown, "utf8")

    return { path: filepath, markdown }
  }
}
