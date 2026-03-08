import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import type z from "zod"
import { LearnerArtifactPath } from "./path.js"
import { parseMarkdownArtifact, stringifyMarkdownArtifact } from "./markdown.js"
import {
  type AssessmentArtifact,
  AssessmentArtifactSchema,
  type DecisionArtifact,
  DecisionArtifactSchema,
  type EvidenceArtifact,
  EvidenceArtifactSchema,
  type FeedbackArtifact,
  FeedbackArtifactSchema,
  type GoalArtifact,
  GoalArtifactSchema,
  type LearnerArtifactKind,
  type MessageArtifact,
  MessageArtifactSchema,
  type MisconceptionArtifact,
  MisconceptionArtifactSchema,
  type PracticeArtifact,
  PracticeArtifactSchema,
  type ProfileArtifact,
  ProfileArtifactSchema,
  type WorkspaceRecordArtifactKind,
  WorkspaceRecordArtifactKindSchema,
  type WorkspaceContextArtifact,
  WorkspaceContextArtifactSchema,
} from "./types.js"

const STOP_WORDS = new Set(["the", "and", "for", "with", "this", "that", "project", "workspace", "buddy"])

type ArtifactRecord = GoalArtifact | MessageArtifact | PracticeArtifact | AssessmentArtifact | EvidenceArtifact | FeedbackArtifact | MisconceptionArtifact | DecisionArtifact
type ArtifactRecordWithRaw = ArtifactRecord & { raw: string }

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeList(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean)))
}

function inferTags(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ).slice(0, 12)
}

function readIfFound(filepath: string) {
  return fs.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })
}

async function ensureParent(filepath: string) {
  await fs.mkdir(path.dirname(filepath), { recursive: true })
}

async function readMarkdownFile<T>(filepath: string, schema: z.ZodType<T>): Promise<{ data: T; body: string } | undefined> {
  const contents = await readIfFound(filepath)
  if (contents === undefined) return undefined

  const parsed = parseMarkdownArtifact(contents, schema)
  return {
    data: parsed.frontmatter,
    body: parsed.body,
  }
}

async function writeMarkdownFile(filepath: string, frontmatter: Record<string, unknown>, body?: string) {
  await ensureParent(filepath)
  const tmpPath = `${filepath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(tmpPath, stringifyMarkdownArtifact(frontmatter, body), "utf8")
  await fs.rename(tmpPath, filepath)
}

async function listMarkdownFiles(directory: string) {
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

function schemaForKind(kind: Exclude<LearnerArtifactKind, "workspace-context" | "profile">) {
  if (kind === "goal") return GoalArtifactSchema
  if (kind === "message") return MessageArtifactSchema
  if (kind === "practice") return PracticeArtifactSchema
  if (kind === "assessment") return AssessmentArtifactSchema
  if (kind === "evidence") return EvidenceArtifactSchema
  if (kind === "feedback") return FeedbackArtifactSchema
  if (kind === "misconception") return MisconceptionArtifactSchema
  return DecisionArtifactSchema
}

const WORKSPACE_ARTIFACT_KINDS = WorkspaceRecordArtifactKindSchema.options

async function readKindArtifacts(
  directory: string,
  kind: Exclude<LearnerArtifactKind, "workspace-context" | "profile">,
  input?: {
    includeRaw?: boolean
  },
): Promise<Array<ArtifactRecord | ArtifactRecordWithRaw>> {
  const files = await listMarkdownFiles(LearnerArtifactPath.kindDirectory(directory, kind))
  const schema = schemaForKind(kind)
  const artifacts: Array<ArtifactRecord | ArtifactRecordWithRaw> = []

  for (const file of files) {
    const raw = await readIfFound(file)
    if (raw === undefined) continue
    const parsed = parseMarkdownArtifact(raw, schema as z.ZodType<ArtifactRecord>)
    if (!parsed) continue

    if (input?.includeRaw) {
      artifacts.push({
        ...parsed.frontmatter,
        raw,
      })
      continue
    }

    artifacts.push(parsed.frontmatter)
  }

  return artifacts.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

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

function defaultProfile(): ProfileArtifact {
  const now = new Date().toISOString()
  return {
    id: "profile",
    kind: "profile",
    goalIds: [],
    background: [],
    knownPrerequisites: [],
    availableTimePatterns: [],
    toolEnvironmentLimits: [],
    motivationAnchors: [],
    learnerPreferences: [],
    createdAt: now,
    updatedAt: now,
  }
}

export namespace LearnerArtifactStore {
  export async function readWorkspaceContext(directory: string) {
    const filepath = LearnerArtifactPath.workspaceContextFile(directory)
    const existing = await readMarkdownFile(filepath, WorkspaceContextArtifactSchema)
    return existing?.data
  }

  export async function writeWorkspaceContext(directory: string, context: WorkspaceContextArtifact) {
    const normalized = WorkspaceContextArtifactSchema.parse(context)
    await writeMarkdownFile(LearnerArtifactPath.workspaceContextFile(directory), normalized, "")
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
    return writeWorkspaceContext(directory, workspace)
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

  export async function readProfile() {
    const filepath = LearnerArtifactPath.profileFile()
    const existing = await readMarkdownFile(filepath, ProfileArtifactSchema)
    return existing?.data
  }

  export async function writeProfile(profile: ProfileArtifact) {
    const normalized = ProfileArtifactSchema.parse(profile)
    await writeMarkdownFile(LearnerArtifactPath.profileFile(), normalized, "")
    return normalized
  }

  export async function ensureProfile() {
    const filepath = LearnerArtifactPath.profileFile()
    const existing = await readMarkdownFile(filepath, ProfileArtifactSchema)
    if (existing) return existing.data

    const profile = defaultProfile()
    return writeProfile(profile)
  }

  export async function patchProfile(
    patch: Partial<
      Pick<
        ProfileArtifact,
        | "background"
        | "knownPrerequisites"
        | "availableTimePatterns"
        | "toolEnvironmentLimits"
        | "motivationAnchors"
        | "learnerPreferences"
      >
    >,
  ) {
    const current = await ensureProfile()
    const next: ProfileArtifact = {
      ...current,
      ...(patch.background !== undefined ? { background: normalizeList(patch.background) } : {}),
      ...(patch.knownPrerequisites !== undefined
        ? { knownPrerequisites: normalizeList(patch.knownPrerequisites) }
        : {}),
      ...(patch.availableTimePatterns !== undefined
        ? { availableTimePatterns: normalizeList(patch.availableTimePatterns) }
        : {}),
      ...(patch.toolEnvironmentLimits !== undefined
        ? { toolEnvironmentLimits: normalizeList(patch.toolEnvironmentLimits) }
        : {}),
      ...(patch.motivationAnchors !== undefined
        ? { motivationAnchors: normalizeList(patch.motivationAnchors) }
        : {}),
      ...(patch.learnerPreferences !== undefined
        ? { learnerPreferences: normalizeList(patch.learnerPreferences) }
        : {}),
      updatedAt: new Date().toISOString(),
    }
    return writeProfile(next)
  }

  export async function upsertArtifact(
    directory: string,
    kind: WorkspaceRecordArtifactKind,
    artifact: ArtifactRecord,
    body?: string,
  ) {
    const filepath = LearnerArtifactPath.artifactFile(directory, kind, artifact.id)
    await writeMarkdownFile(filepath, artifact, body)
    return artifact
  }

  export async function readArtifacts(
    directory: string,
    kind: WorkspaceRecordArtifactKind,
    input?: {
      includeRaw?: boolean
    },
  ) {
    return readKindArtifacts(directory, kind, input)
  }

  export async function listArtifacts(input: {
    directory: string
    kind?: WorkspaceRecordArtifactKind
    goalId?: string
    status?: string
    includeRaw?: boolean
  }) {
    const kinds: WorkspaceRecordArtifactKind[] = input.kind
      ? [input.kind]
      : [...WORKSPACE_ARTIFACT_KINDS]

    const records = (await Promise.all(
      kinds.map((kind) => readKindArtifacts(input.directory, kind, { includeRaw: input.includeRaw })),
    )).flat()
    return records
      .filter((record) => (input.goalId ? record.goalIds.includes(input.goalId) : true))
      .filter((record) => {
        if (!input.status) return true
        if ("status" in record) return String(record.status) === input.status
        return false
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
}
