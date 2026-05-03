import { createHash } from "node:crypto"
import type { LearnerRuntimeSnapshot } from "../features/memory/runtime/snapshot"

type LearnerContextItemSection = "map" | "profile" | "progress"

type LearnerContextItem = {
  key: string
  section: LearnerContextItemSection
  text: string
}

type LearnerContextView = {
  fingerprint: string
  items: LearnerContextItem[]
}

type LearnerContextDelivery = {
  kind: "bootstrap" | "delta"
  fingerprint: string
  items: LearnerContextItem[]
  previousFingerprint?: string
  previousItems?: LearnerContextItem[]
}

const LEARNER_CONTEXT_INSTRUCTION =
  "Use this learner context when relevant. Do not mention it unless it helps the learner."

function compactLine(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeKey(value: string): string {
  return compactLine(value).toLowerCase()
}

function markdownLines(items: readonly LearnerContextItem[]): string[] {
  if (items.length === 0) {
    return ["- None."]
  }

  return items.map((item) => `- ${item.text}`)
}

function renderLearnerContextBody(items: readonly LearnerContextItem[]): string {
  const learningMapItems = items.filter((item) => item.section === "map")
  const progressItems = items.filter((item) => item.section === "progress")
  const learnerProfileItems = items.filter((item) => item.section === "profile")

  return [
    "Current learning map:",
    ...markdownLines(learningMapItems),
    "",
    "Progress snapshot:",
    ...markdownLines(progressItems),
    "",
    "Learner profile:",
    ...markdownLines(learnerProfileItems),
  ].join("\n")
}

function fingerprintLearnerContext(items: readonly LearnerContextItem[]): string {
  return createHash("sha256").update(renderLearnerContextBody(items)).digest("hex")
}

function collectLearnerContextItems(snapshot: LearnerRuntimeSnapshot): LearnerContextItem[] {
  const workspaceItems: LearnerContextItem[] = snapshot.workspace.label
    ? [
        {
          key: "workspace",
          section: "map",
          text: `Workspace: ${compactLine(snapshot.workspace.label)}`,
        },
      ]
    : []
  const goalItems = snapshot.goals.slice(0, 6).map((goal) => ({
    key: `goal:${goal.id}`,
    section: "map" as const,
    text: `Goal: ${compactLine(goal.statement)} [test: ${compactLine(goal.howToTest)}]`,
  }))
  const projectContextItems = snapshot.projectContext.slice(0, 4).map((context) => ({
    key: `project_context:${context.id}`,
    section: "map" as const,
    text: `Project context: ${compactLine(context.summary)}`,
  }))
  const baseMemoryItems = snapshot.baseMemorySummary.slice(0, 8).map((summary) => ({
    key: `base_memory:${normalizeKey(summary)}`,
    section: "profile" as const,
    text: `Base memory: ${compactLine(summary)}`,
  }))
  const evidenceItems = snapshot.recentEvidence.slice(0, 8).map((evidence) => ({
    key: `evidence:${evidence.id}`,
    section: "map" as const,
    text: `Evidence: ${compactLine(evidence.summary)}`,
  }))
  const feedbackItems = snapshot.openFeedback.slice(0, 8).map((feedback) => ({
    key: `feedback:${feedback.id}`,
    section: "map" as const,
    text: `Feedback loop: ${compactLine(feedback.requiredAction)}`,
  }))
  const misconceptionItems = snapshot.activeMisconceptions.slice(0, 8).map((misconception) => ({
    key: `misconception:${misconception.id}`,
    section: "map" as const,
    text: `Misconception: ${compactLine(misconception.summary)}`,
  }))
  const progressItems: LearnerContextItem[] = [
    {
      key: "progress:goals",
      section: "progress",
      text: `Goals in scope: ${snapshot.goals.length}`,
    },
    {
      key: "progress:evidence",
      section: "progress",
      text: `Evidence records: ${snapshot.recentEvidence.length}`,
    },
    {
      key: "progress:feedback",
      section: "progress",
      text: `Open feedback items: ${snapshot.openFeedback.length}`,
    },
    {
      key: "progress:misconceptions",
      section: "progress",
      text: `Active misconceptions: ${snapshot.activeMisconceptions.length}`,
    },
  ]
  const profileItems = snapshot.constraintsSummary.slice(0, 8).map((summary) => ({
    key: `profile:${normalizeKey(summary)}`,
    section: "profile" as const,
    text: compactLine(summary),
  }))
  const prioritized = [
    ...workspaceItems,
    ...projectContextItems,
    ...feedbackItems,
    ...goalItems,
    ...misconceptionItems,
    ...evidenceItems,
    ...profileItems,
    ...baseMemoryItems,
    ...progressItems,
  ]

  return prioritized.slice(0, snapshot.defaultContextMemoryLimit)
}

function buildLearnerContextView(snapshot: LearnerRuntimeSnapshot): LearnerContextView {
  const items = collectLearnerContextItems(snapshot)
  return {
    fingerprint: fingerprintLearnerContext(items),
    items,
  }
}

function decideLearnerContextDelivery(input: {
  current: LearnerContextView
  previousFingerprint?: string
  previousItems?: LearnerContextItem[]
}): LearnerContextDelivery | undefined {
  if (!input.previousFingerprint || !input.previousItems) {
    return {
      kind: "bootstrap",
      fingerprint: input.current.fingerprint,
      items: input.current.items,
    }
  }

  if (input.previousFingerprint === input.current.fingerprint) {
    return undefined
  }

  return {
    kind: "delta",
    fingerprint: input.current.fingerprint,
    items: input.current.items,
    previousFingerprint: input.previousFingerprint,
    previousItems: input.previousItems,
  }
}

function renderLearnerContextBootstrap(delivery: LearnerContextDelivery): string {
  return [
    `<learner_context fingerprint="${delivery.fingerprint}">`,
    renderLearnerContextBody(delivery.items),
    "</learner_context>",
    "<instruction>",
    LEARNER_CONTEXT_INSTRUCTION,
    "</instruction>",
  ].join("\n")
}

function renderDeltaLines(label: string, items: readonly LearnerContextItem[]): string[] {
  if (items.length === 0) {
    return []
  }

  return [label, ...items.map((item) => `- ${item.text}`), ""]
}

function renderLearnerContextDelta(delivery: LearnerContextDelivery): string {
  const previousItems = delivery.previousItems ?? []
  const previousByKey = new Map(previousItems.map((item) => [item.key, item]))
  const currentByKey = new Map(delivery.items.map((item) => [item.key, item]))

  const added = delivery.items.filter((item) => !previousByKey.has(item.key))
  const updated = delivery.items.filter((item) => {
    const previous = previousByKey.get(item.key)
    return previous !== undefined && previous.text !== item.text
  })
  const removed = previousItems.filter((item) => !currentByKey.has(item.key))
  const detailLines = [
    ...renderDeltaLines("Added:", added),
    ...renderDeltaLines("Updated:", updated),
    ...renderDeltaLines("Removed from default context:", removed),
  ]
  const details =
    detailLines.length > 0
      ? detailLines.slice(0, -1).join("\n")
      : "Updated:\n- Learner context changed."

  return [
    `<learner_context_delta previous="${delivery.previousFingerprint ?? "unknown"}" current="${delivery.fingerprint}">`,
    details,
    "</learner_context_delta>",
    "<instruction>",
    LEARNER_CONTEXT_INSTRUCTION,
    "</instruction>",
  ].join("\n")
}

function renderLearnerContextDelivery(delivery: LearnerContextDelivery): string {
  return delivery.kind === "bootstrap"
    ? renderLearnerContextBootstrap(delivery)
    : renderLearnerContextDelta(delivery)
}

export { buildLearnerContextView, decideLearnerContextDelivery, renderLearnerContextDelivery }

export type {
  LearnerContextDelivery,
  LearnerContextItem,
  LearnerContextItemSection,
  LearnerContextView,
}
