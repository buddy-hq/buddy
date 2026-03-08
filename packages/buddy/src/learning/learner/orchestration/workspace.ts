import { LearnerArtifactPath } from "../artifacts/path.js"
import { LearnerArtifactStore } from "../artifacts/store.js"
import type {
  GoalArtifact,
  ProfileArtifact,
  WorkspaceContextArtifact,
} from "../artifacts/types.js"
import { inferTags, nextId, normalizeList, normalizeText, nowIso } from "./helpers.js"

const goalSetLocks = new Map<string, Promise<void>>()

async function withGoalSetLock<T>(key: string, task: () => Promise<T>) {
  const prior = goalSetLocks.get(key) ?? Promise.resolve()
  let release: (() => void) | undefined
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  goalSetLocks.set(key, prior.then(() => next))
  await prior

  try {
    return await task()
  } finally {
    release?.()
    if (goalSetLocks.get(key) === next) {
      goalSetLocks.delete(key)
    }
  }
}

function goalSetKey(input: { scope: GoalArtifact["scope"]; contextLabel: string }) {
  return `${input.scope}::${normalizeText(input.contextLabel).toLowerCase()}`
}

function buildGoalArtifacts(input: {
  workspace: WorkspaceContextArtifact
  scope: GoalArtifact["scope"]
  contextLabel: string
  learnerRequest: string
  goals: Array<{
    statement: string
    actionVerb: string
    task: string
    cognitiveLevel: GoalArtifact["cognitiveLevel"]
    howToTest: string
  }>
  rationaleSummary?: string
  assumptions?: string[]
  openQuestions?: string[]
}) {
  const now = nowIso()
  const setId = nextId()
  const conceptTags = inferTags(
    [input.contextLabel, input.learnerRequest, ...input.goals.map((goal) => goal.statement)].join(" "),
  )

  return input.goals.map<GoalArtifact>((goal) => ({
    id: nextId(),
    kind: "goal",
    workspaceId: input.workspace.workspaceId,
    goalIds: [],
    status: "active",
    setId,
    scope: input.scope,
    contextLabel: normalizeText(input.contextLabel),
    learnerRequest: normalizeText(input.learnerRequest),
    rationaleSummary: input.rationaleSummary ? normalizeText(input.rationaleSummary) : undefined,
    assumptions: normalizeList(input.assumptions),
    openQuestions: normalizeList(input.openQuestions),
    statement: normalizeText(goal.statement),
    actionVerb: normalizeText(goal.actionVerb),
    task: normalizeText(goal.task),
    cognitiveLevel: goal.cognitiveLevel,
    howToTest: normalizeText(goal.howToTest),
    dependsOnGoalIds: [],
    buildsOnGoalIds: [],
    reinforcesGoalIds: [],
    conceptTags,
    workspaceRefs: [input.workspace.workspaceId],
    createdAt: now,
    updatedAt: now,
  }))
}

export async function ensureWorkspaceContext(directory: string) {
  return LearnerArtifactStore.ensureWorkspaceContext(directory)
}

export async function patchWorkspace(input: {
  directory: string
  workspace?: Partial<
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
  >
  profile?: Partial<
    Pick<
      ProfileArtifact,
      | "background"
      | "knownPrerequisites"
      | "availableTimePatterns"
      | "toolEnvironmentLimits"
      | "motivationAnchors"
      | "learnerPreferences"
    >
  >
}) {
  if (input.workspace) {
    await LearnerArtifactStore.patchWorkspaceContext(input.directory, {
      ...input.workspace,
      ...(input.workspace.tags ? { tags: normalizeList(input.workspace.tags.map((tag) => tag.toLowerCase())) } : {}),
    })
  }

  if (input.profile) {
    await LearnerArtifactStore.patchProfile(input.profile)
  }

  const [workspace, profile] = await Promise.all([
    LearnerArtifactStore.ensureWorkspaceContext(input.directory),
    LearnerArtifactStore.ensureProfile(),
  ])

  return {
    workspace,
    profile,
  }
}

export async function replaceGoalSet(input: {
  directory: string
  scope: GoalArtifact["scope"]
  contextLabel: string
  learnerRequest: string
  goals: Array<{
    statement: string
    actionVerb: string
    task: string
    cognitiveLevel: GoalArtifact["cognitiveLevel"]
    howToTest: string
  }>
  rationaleSummary?: string
  assumptions?: string[]
  openQuestions?: string[]
}) {
  const targetKey = goalSetKey({
    scope: input.scope,
    contextLabel: input.contextLabel,
  })
  const workspace = await ensureWorkspaceContext(input.directory)

  return withGoalSetLock(targetKey, async () => {
    const existing = (await LearnerArtifactStore.readArtifacts(input.directory, "goal"))
      .filter((artifact): artifact is GoalArtifact => artifact.kind === "goal")

    const now = nowIso()
    const archivedSetIds = new Set<string>()

    const created = buildGoalArtifacts({
      workspace,
      scope: input.scope,
      contextLabel: input.contextLabel,
      learnerRequest: input.learnerRequest,
      goals: input.goals,
      rationaleSummary: input.rationaleSummary,
      assumptions: input.assumptions,
      openQuestions: input.openQuestions,
    })

    await Promise.all(created.map((artifact) => LearnerArtifactStore.upsertArtifact(input.directory, "goal", artifact)))

    await Promise.all(
      existing
        .filter((artifact) => artifact.workspaceId === workspace.workspaceId)
        .filter((artifact) => artifact.status === "active")
        .filter((artifact) =>
          goalSetKey({
            scope: artifact.scope,
            contextLabel: artifact.contextLabel,
          }) === targetKey,
        )
        .map((artifact) => {
          if (artifact.setId) archivedSetIds.add(artifact.setId)
          return LearnerArtifactStore.upsertArtifact(input.directory, "goal", {
            ...artifact,
            status: "archived",
            updatedAt: now,
          })
        }),
    )

    const edgeIds: string[] = []

    return {
      filePath: LearnerArtifactPath.kindDirectory(input.directory, "goal"),
      setId: created[0]?.setId ?? nextId(),
      goalIds: created.map((artifact) => artifact.id),
      edgeIds,
      archivedSetIds: [...archivedSetIds],
      rationaleSummary: input.rationaleSummary ? normalizeText(input.rationaleSummary) : undefined,
      assumptions: normalizeList(input.assumptions),
      openQuestions: normalizeList(input.openQuestions),
    }
  })
}
