import path from "node:path"
import { ulid } from "ulid"
import { LearnerArtifactPath } from "../path.js"
import type { WorkspaceContextArtifact } from "../types.js"
import { WorkspaceContextArtifactSchema } from "../types.js"
import { isAlreadyExistsError, readIfFound, readMarkdownFile, writeMarkdownFile } from "./io.js"
import { inferTags, normalizeList, normalizeText } from "./normalize.js"

function defaultWorkspaceContext(input: { directory: string; workspaceId: string; packageJson?: string }): WorkspaceContextArtifact {
  const now = new Date().toISOString()
  const label = path.basename(input.directory) || "Workspace"

  return {
    id: input.workspaceId,
    kind: "workspace-context",
    workspaceId: input.workspaceId,
    goalIds: [],
    label,
    tags: Array.from(new Set([...inferTags(label), ...inferTags(input.packageJson ?? "")])).slice(0, 12),
    pinnedGoalIds: [],
    projectConstraints: [],
    localToolAvailability: input.packageJson ? ["package.json"] : [],
    preferredSurfaces: [],
    motivationContext: undefined,
    opportunities: [],
    userOverride: false,
    createdAt: now,
    updatedAt: now,
  }
}

export async function readWorkspaceContext(directory: string) {
  const filepath = LearnerArtifactPath.workspaceContextFile(directory)
  const existing = await readMarkdownFile(filepath, WorkspaceContextArtifactSchema)
  return existing?.data
}

export async function writeWorkspaceContext(
  directory: string,
  context: WorkspaceContextArtifact,
  options?: {
    exclusive?: boolean
  },
) {
  const normalized = WorkspaceContextArtifactSchema.parse(context)
  await writeMarkdownFile(LearnerArtifactPath.workspaceContextFile(directory), normalized, "", options)
  return normalized
}

export async function ensureWorkspaceContext(directory: string) {
  const filepath = LearnerArtifactPath.workspaceContextFile(directory)
  const existing = await readMarkdownFile(filepath, WorkspaceContextArtifactSchema)
  if (existing) return existing.data

  const packageJson = await readIfFound(path.join(directory, "package.json"))
  const workspace = defaultWorkspaceContext({
    directory,
    workspaceId: ulid(),
    packageJson,
  })

  try {
    return await writeWorkspaceContext(directory, workspace, { exclusive: true })
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      const created = await readMarkdownFile(filepath, WorkspaceContextArtifactSchema)
      if (created) return created.data
    }
    throw error
  }
}

export async function patchWorkspaceContext(
  directory: string,
  patch: Partial<
    Pick<
      WorkspaceContextArtifact,
      | "label"
      | "tags"
      | "pinnedGoalIds"
      | "projectConstraints"
      | "localToolAvailability"
      | "preferredSurfaces"
      | "motivationContext"
      | "opportunities"
      | "userOverride"
    >
  >,
) {
  const current = await ensureWorkspaceContext(directory)
  const nextLabel = patch.label !== undefined ? normalizeText(patch.label) : undefined
  const nextMotivationContext =
    patch.motivationContext !== undefined ? normalizeText(patch.motivationContext) || undefined : undefined

  const next: WorkspaceContextArtifact = {
    ...current,
    ...(nextLabel ? { label: nextLabel } : {}),
    ...(patch.tags !== undefined ? { tags: normalizeList(patch.tags.map((tag) => tag.toLowerCase())) } : {}),
    ...(patch.pinnedGoalIds !== undefined ? { pinnedGoalIds: [...patch.pinnedGoalIds] } : {}),
    ...(patch.projectConstraints !== undefined ? { projectConstraints: normalizeList(patch.projectConstraints) } : {}),
    ...(patch.localToolAvailability !== undefined ? { localToolAvailability: normalizeList(patch.localToolAvailability) } : {}),
    ...(patch.preferredSurfaces !== undefined ? { preferredSurfaces: [...patch.preferredSurfaces] } : {}),
    ...(patch.motivationContext !== undefined ? { motivationContext: nextMotivationContext } : {}),
    ...(patch.opportunities !== undefined ? { opportunities: normalizeList(patch.opportunities) } : {}),
    ...(typeof patch.userOverride === "boolean" ? { userOverride: patch.userOverride } : {}),
    updatedAt: new Date().toISOString(),
  }

  return writeWorkspaceContext(directory, next)
}
