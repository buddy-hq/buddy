import fs from "node:fs/promises"
import { ulid } from "ulid"
import z from "zod"
import { GoalCognitiveLevelSchema, GoalScopeSchema, normalizeGoalText } from "./types.js"
import { GoalsV1Path } from "./path.js"

const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)

const GoalV1Schema = z.object({
  goalId: UlidSchema,
  statement: z.string().min(1),
  actionVerb: z.string().min(1),
  task: z.string().min(1),
  cognitiveLevel: GoalCognitiveLevelSchema,
  howToTest: z.string().min(1),
})
type GoalV1 = z.infer<typeof GoalV1Schema>

const GoalSetV1Schema = z.object({
  setId: UlidSchema,
  scope: GoalScopeSchema,
  contextLabel: z.string().min(1),
  learnerRequest: z.string().min(1),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
  rationaleSummary: z.string().min(1).optional(),
  assumptions: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  goals: z.array(GoalV1Schema),
})
type GoalSetV1 = z.infer<typeof GoalSetV1Schema>

const GoalsV1FileSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  goalSets: z.array(GoalSetV1Schema),
})
type GoalsV1File = z.infer<typeof GoalsV1FileSchema>

function timestampForFilename(value: Date): string {
  return value.toISOString().replace(/[:.]/g, "-")
}

async function renameBrokenGoalsFile(filepath: string): Promise<string | undefined> {
  const brokenPath = `${filepath}.broken-${timestampForFilename(new Date())}`
  await fs.rename(filepath, brokenPath).catch(() => undefined)
  return brokenPath
}

function createEmptyGoalsFile(nowIso: string): GoalsV1File {
  return {
    version: 1,
    updatedAt: nowIso,
    goalSets: [],
  }
}

export function listActiveGoalSets(file: GoalsV1File): GoalSetV1[] {
  return file.goalSets.filter((set) => !set.archivedAt)
}

export async function readGoalsV1File(directory: string): Promise<{ path: string; data: GoalsV1File } | undefined> {
  const filepath = GoalsV1Path.file(directory)
  const contents = await fs.readFile(filepath, "utf8").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })

  if (contents === undefined) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    await renameBrokenGoalsFile(filepath)
    return undefined
  }

  const result = GoalsV1FileSchema.safeParse(parsed)
  if (!result.success) {
    await renameBrokenGoalsFile(filepath)
    return undefined
  }

  return {
    path: filepath,
    data: result.data,
  }
}

export async function writeGoalsV1File(directory: string, data: GoalsV1File): Promise<{ path: string }> {
  const filepath = GoalsV1Path.file(directory)
  const tmpPath = GoalsV1Path.tempFile(directory)
  await fs.mkdir(GoalsV1Path.directory(directory), { recursive: true })

  const payload = `${JSON.stringify(data, null, 2)}\n`
  await fs.writeFile(tmpPath, payload, "utf8")
  await fs.rename(tmpPath, filepath)

  return { path: filepath }
}

export async function commitGoalsV1Set(input: {
  directory: string
  scope: GoalSetV1["scope"]
  contextLabel: string
  learnerRequest: string
  goals: Array<{
    statement: string
    actionVerb: string
    task: string
    cognitiveLevel: GoalV1["cognitiveLevel"]
    howToTest: string
  }>
  rationaleSummary?: string
  assumptions?: string[]
  openQuestions?: string[]
}): Promise<{
  filePath: string
  setId: string
  goalIds: string[]
  archivedSetIds: string[]
}> {
  const now = new Date()
  const nowIso = now.toISOString()
  const existing = await readGoalsV1File(input.directory)
  const file = existing?.data ?? createEmptyGoalsFile(nowIso)

  const scope = input.scope
  const contextLabel = normalizeGoalText(input.contextLabel)
  const learnerRequest = normalizeGoalText(input.learnerRequest)

  const key = `${scope}::${contextLabel.toLowerCase()}`
  const archivedSetIds: string[] = []

  for (const set of file.goalSets) {
    if (set.archivedAt) continue
    const setKey = `${set.scope}::${normalizeGoalText(set.contextLabel).toLowerCase()}`
    if (setKey !== key) continue
    set.archivedAt = nowIso
    archivedSetIds.push(set.setId)
  }

  const setId = ulid()
  const goals: GoalV1[] = input.goals.map((goal) => ({
    goalId: ulid(),
    statement: normalizeGoalText(goal.statement),
    actionVerb: normalizeGoalText(goal.actionVerb),
    task: normalizeGoalText(goal.task),
    cognitiveLevel: goal.cognitiveLevel,
    howToTest: normalizeGoalText(goal.howToTest),
  }))
  const goalIds = goals.map((goal) => goal.goalId)

  file.goalSets.push(
    GoalSetV1Schema.parse({
      setId,
      scope,
      contextLabel,
      learnerRequest,
      createdAt: nowIso,
      archivedAt: undefined,
      rationaleSummary: input.rationaleSummary ? normalizeGoalText(input.rationaleSummary) : undefined,
      assumptions: input.assumptions?.map(normalizeGoalText).filter(Boolean),
      openQuestions: input.openQuestions?.map(normalizeGoalText).filter(Boolean),
      goals,
    }),
  )

  file.updatedAt = nowIso

  const nextFile = GoalsV1FileSchema.parse(file)
  const persisted = await writeGoalsV1File(input.directory, nextFile)

  return {
    filePath: persisted.path,
    setId,
    goalIds,
    archivedSetIds,
  }
}

function formatGoalIdPrefix(goalId: string): string {
  if (goalId.length <= 4) return goalId
  return `${goalId.slice(0, 4)}…`
}

export function formatLearningGoalsForSystemPrompt(input: {
  file: GoalsV1File
  maxSets: number
  maxGoals: number
}): string {
  const activeSets = listActiveGoalSets(input.file)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.maxSets)

  if (activeSets.length === 0) return ""

  const lines = ["<learning_goals>"]
  let remaining = input.maxGoals

  for (const set of activeSets) {
    const goalLabel = set.goals.length === 1 ? "goal" : "goals"
    lines.push(`- [${set.scope}] ${set.contextLabel} (${set.goals.length} ${goalLabel})`)

    const take = Math.max(0, Math.min(remaining, set.goals.length))
    for (const goal of set.goals.slice(0, take)) {
      lines.push(`  - ${formatGoalIdPrefix(goal.goalId)}: ${goal.statement}`)
    }

    remaining -= take
    const omitted = set.goals.length - take
    if (omitted > 0) {
      lines.push(`  - …: (+${omitted} more omitted)`)
    }

    if (remaining <= 0) break
  }

  lines.push("</learning_goals>")
  return lines.join("\n")
}

export {
  GoalV1Schema,
  GoalSetV1Schema,
  GoalsV1FileSchema,
  UlidSchema,
}

export type {
  GoalV1,
  GoalSetV1,
  GoalsV1File,
}

