import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { LearnerMemoryPath } from "../paths"
import { writeJsonFile } from "../storage"
import { withLearnerMemoryMutationLock } from "../mutation-lock"

const GOALS_FILE = "goals.json"

const GoalRecordSchema = z.object({
  id: z.string().min(1),
  setId: z.string().min(1),
  scope: z.enum(["course", "topic"]),
  contextLabel: z.string().min(1),
  statement: z.string().min(1),
  actionVerb: z.string().min(1),
  task: z.string().min(1),
  cognitiveLevel: z.string().min(1),
  howToTest: z.string().min(1),
  status: z.enum(["active", "archived"]),
  createdAt: z.string().datetime(),
})
type GoalRecord = z.infer<typeof GoalRecordSchema>

const GoalStoreSchema = z.object({
  schemaVersion: z.literal(1),
  goals: z.array(GoalRecordSchema),
})
type GoalStore = z.infer<typeof GoalStoreSchema>

function goalsFile(directory: string): string {
  return path.join(LearnerMemoryPath.root(directory), GOALS_FILE)
}

async function readGoalStore(directory: string): Promise<GoalStore> {
  const filePath = goalsFile(directory)
  const raw = await fs.readFile(filePath, "utf8").catch(() => undefined)
  if (!raw) return { schemaVersion: 1, goals: [] }
  return GoalStoreSchema.parse(JSON.parse(raw) as unknown)
}

async function writeGoalStore(directory: string, store: GoalStore): Promise<void> {
  await writeJsonFile(goalsFile(directory), GoalStoreSchema.parse(store))
}

async function listActiveGoals(directory: string): Promise<GoalRecord[]> {
  const store = await readGoalStore(directory)
  return store.goals.filter((goal) => goal.status === "active")
}

async function listGoals(directory: string): Promise<GoalRecord[]> {
  const store = await readGoalStore(directory)
  return store.goals
}

async function replaceActiveGoalSet(input: {
  directory: string
  scope: GoalRecord["scope"]
  contextLabel: string
  goals: Array<{
    statement: string
    actionVerb: string
    task: string
    cognitiveLevel: string
    howToTest: string
  }>
}): Promise<{
  filePath: string
  setId: string
  goalIds: string[]
  archivedSetIds: string[]
}> {
  return withLearnerMemoryMutationLock(input.directory, async () => {
    const store = await readGoalStore(input.directory)
    const now = new Date().toISOString()
    const replacesSameContext = (goal: GoalRecord) =>
      goal.status === "active" &&
      goal.scope === input.scope &&
      goal.contextLabel === input.contextLabel
    const archivedSetIds = [
      ...new Set(store.goals.filter(replacesSameContext).map((goal) => goal.setId)),
    ]
    const setId = `goalset_${ulid()}`
    const nextGoals = input.goals.map((goal) =>
      GoalRecordSchema.parse({
        id: `goal_${ulid()}`,
        setId,
        scope: input.scope,
        contextLabel: input.contextLabel,
        statement: goal.statement,
        actionVerb: goal.actionVerb,
        task: goal.task,
        cognitiveLevel: goal.cognitiveLevel,
        howToTest: goal.howToTest,
        status: "active",
        createdAt: now,
      }),
    )
    const archivedGoals = store.goals.map((goal) =>
      replacesSameContext(goal)
        ? GoalRecordSchema.parse({ ...goal, status: "archived" })
        : goal,
    )
    await writeGoalStore(input.directory, {
      schemaVersion: 1,
      goals: [...archivedGoals, ...nextGoals],
    })

    return {
      filePath: goalsFile(input.directory),
      setId,
      goalIds: nextGoals.map((goal) => goal.id),
      archivedSetIds,
    }
  })
}

export { GoalRecordSchema, goalsFile, listActiveGoals, listGoals, replaceActiveGoalSet }
export type { GoalRecord }
