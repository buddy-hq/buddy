import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { LearnerService } from "../../src/learning/learner-model"
import { buildLearningSystemPrompt } from "../../src/learning/prompt"
import { getBuddyPersona } from "../../src/learning/personas"
import { tmpdir } from "../helpers/tmpdir"
import { withSyncedOpenCodeConfig } from "../helpers/opencode"

function requireValue<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value
  }

  throw new Error(`Missing ${label}`)
}

const BUDDY_BASE_PROMPT = readFileSync(
  new URL("../../src/learning/personas/buddy/prompt.p.md", import.meta.url),
  "utf8",
)
const TEACHING_POLICY_PROMPT = readFileSync(
  new URL("../../src/learning/prompt/teaching-workspace-policy.p.md", import.meta.url),
  "utf8",
)
const CODE_BUDDY_OVERLAY = readFileSync(
  new URL("../../src/learning/personas/code-buddy/overlay.p.md", import.meta.url),
  "utf8",
)
const MATH_BUDDY_OVERLAY = readFileSync(
  new URL("../../src/learning/personas/math-buddy/overlay.p.md", import.meta.url),
  "utf8",
)

function assetPath(filename: string): string {
  return fileURLToPath(new URL(`../assets/prompts/${filename}`, import.meta.url))
}

function composeStaticPrompt(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
}

async function readNormalizedAsset(filepath: string) {
  const raw = await readFile(filepath, "utf8")
  return raw.replace(/\r\n/g, "\n").trimEnd()
}

async function buildRuntimePrompt(input: {
  directory: string
  persona: "buddy" | "code-buddy" | "math-buddy"
  intent?: "auto" | "learn" | "practice" | "assess"
  teachingContext?: Parameters<typeof buildLearningSystemPrompt>[0]["teachingContext"]
}) {
  const intent = input.intent ?? "auto"
  const workspaceState = input.teachingContext?.active ? "interactive" : "chat"
  const snapshot = await LearnerService.getWorkspaceSnapshot({
    directory: input.directory,
    query: {
      persona: input.persona,
      intent,
      focusGoalIds: [],
      workspaceState,
    },
  })
  const profile = resolveCapabilityProfile({
    persona: getBuddyPersona(input.persona),
    workspaceState,
    intent: intent,
  })

  const { systemContext, turnReminder } = await buildLearningSystemPrompt({
    directory: input.directory,
    persona: profile.persona,
    capabilityEnvelope: profile.capabilityEnvelope,
    intent,
    learnerSnapshot: snapshot,
    focusGoalIds: [],
    teachingContext: input.teachingContext,
  })
  return [systemContext, turnReminder].filter(Boolean).join("\n\n")
}

describe("prompt assemblies", () => {
  test("loads shared prompt assets byte-for-byte", async () => {
    const learningAsset = await readNormalizedAsset(assetPath("learning-companion.txt"))
    const teachingPolicyAsset = await readNormalizedAsset(assetPath("teaching-policy.txt"))

    expect(BUDDY_BASE_PROMPT.trimEnd()).toBe(learningAsset)
    expect(TEACHING_POLICY_PROMPT.trimEnd()).toBe(teachingPolicyAsset)
  })

  test("builds a buddy runtime prompt with teaching runtime and learner state blocks", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "buddy",
    })

    expect(system).toContain("<student_intent>")
    expect(system).toContain("The student has shown no explicit intent")
    expect(system).toContain("<buddy_runtime_context>")
    expect(system).toContain("<workspace_state>")
    expect(system).toContain("No relevant goals exist yet")
  })

  test("builds a code-buddy interactive prompt with workspace guidance and teaching policy", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "code-buddy",
      teachingContext: {
        active: true,
        sessionID: "ses_teach",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint/lesson.ts",
        language: "ts",
        revision: 3,
      },
    })

    expect(system).toContain("<buddy_runtime_context>")
    expect(system).toContain("State: interactive")
    expect(system).toContain("<teaching_workspace>")
    expect(system).not.toContain("<system-reminder>")
  })

  test("builds a math-buddy prompt with figure-capable workspace guidance", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "math-buddy",
    })

    expect(system).toContain("<buddy_runtime_context>")
    expect(system).toContain("Render a figure only when it materially improves the current explanation")
  })

  test("keeps the registered code-buddy prompt aligned with the base prompt and overlay", async () => {
    await using project = await tmpdir({ git: true })

    const codeBuddyAgent = requireValue(
      await withSyncedOpenCodeConfig(project.path, () => OpenCodeAgent.get("code-buddy")),
      "code-buddy agent",
    )

    expect(codeBuddyAgent.prompt).toContain("You are Buddy, a learning companion")
    expect(codeBuddyAgent.prompt).toContain("For coding sessions, act as Buddy")
    expect(codeBuddyAgent.prompt).toContain("teaching_start_lesson")
  })

  test("composes code-buddy from the base buddy prompt plus the code overlay", async () => {
    const prompt = composeStaticPrompt(BUDDY_BASE_PROMPT, CODE_BUDDY_OVERLAY)

    expect(prompt).toContain(
      "You are Buddy, a learning companion that helps the learner learn by doing while building real projects.",
    )
    expect(prompt).toContain("For coding sessions, act as Buddy in the `code-buddy` persona.")
    expect(prompt).toContain(
      "Treat the lesson file shown in <teaching_workspace> as the shared whiteboard for the lesson.",
    )
  })

  test("composes math-buddy from the base buddy prompt plus the math overlay", async () => {
    const prompt = composeStaticPrompt(BUDDY_BASE_PROMPT, MATH_BUDDY_OVERLAY)

    expect(prompt).toContain("Figure trigger policy:")
    expect(prompt).toContain("Figure authoring:")
    expect(prompt).toContain("Constrained figure protocol:")
    expect(prompt).toContain("Freeform figure protocol:")
    expect(prompt).toContain("Figure layout:")
    expect(prompt).toContain("Figure self-check:")
    expect(prompt).not.toContain("always draw triangles")
  })
})
