import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { LearnerService } from "../src/learning/learner/service.js"
import { composeLearningSystemPrompt } from "../src/learning/shared/compose-system-prompt.js"
import { readNormalizedPromptFixture } from "../src/learning/shared/prompt-fixture.js"
import { getBuddyPersona } from "../src/personas/catalog.js"
import { tmpdir } from "./fixture/fixture"
import { withSyncedOpenCodeConfig } from "./helpers/opencode.js"

const BUDDY_BASE_PROMPT = readFileSync(new URL("../src/learning/companion/buddy-base.p.md", import.meta.url), "utf8")
const TEACHING_POLICY_PROMPT = readFileSync(new URL("../src/learning/teaching/teaching-policy.p.md", import.meta.url), "utf8")
const CODE_BUDDY_OVERLAY = readFileSync(
  new URL("../src/learning/teaching/teacher/coding/code-buddy-overlay.p.md", import.meta.url),
  "utf8",
)
const MATH_BUDDY_OVERLAY = readFileSync(
  new URL("../src/learning/teaching/teacher/math/math-buddy-overlay.p.md", import.meta.url),
  "utf8",
)

function fixturePath(filename: string): string {
  return fileURLToPath(new URL(`./fixtures/prompts/${filename}`, import.meta.url))
}

function composeStaticPrompt(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n")
}

async function buildRuntimePrompt(input: {
  directory: string
  persona: "buddy" | "code-buddy" | "math-buddy"
  intent?: "learn" | "practice" | "assess"
  teachingContext?: Parameters<typeof composeLearningSystemPrompt>[0]["teachingContext"]
  userContent?: string
}) {
  const digest = await LearnerService.buildPromptContext({
    directory: input.directory,
    query: {
      persona: input.persona,
      intent: input.intent ?? "learn",
      focusGoalIds: [],
    },
  })
  const profile = compileRuntimeProfile({
    persona: getBuddyPersona(input.persona),
    workspaceState: input.teachingContext?.active ? "interactive" : "chat",
  })

  return composeLearningSystemPrompt({
    directory: input.directory,
    runtimeProfile: profile,
    learnerDigest: digest,
    focusGoalIds: [],
    teachingContext: input.teachingContext,
    userContent: input.userContent,
  })
}

describe("prompt assemblies", () => {
  test("loads shared prompt assets byte-for-byte from fixtures", async () => {
    const learningFixture = await readNormalizedPromptFixture(fixturePath("learning-companion.txt"))
    const teachingPolicyFixture = await readNormalizedPromptFixture(fixturePath("teaching-policy.txt"))

    expect(BUDDY_BASE_PROMPT.trimEnd()).toBe(learningFixture)
    expect(TEACHING_POLICY_PROMPT.trimEnd()).toBe(teachingPolicyFixture)
  })

  test("builds a buddy runtime prompt with teaching runtime and learner state blocks", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "buddy",
      userContent: "hello",
    })

    expect(system).toContain("<buddy_runtime_header>")
    expect(system).toContain("Persona: buddy")
    expect(system).toContain("Intent override: auto")
    expect(system).toContain("<workspace_state>")
    expect(system).toContain("No relevant goals exist yet")
  })

  test("builds a code-buddy interactive prompt with workspace guidance and teaching policy", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "code-buddy",
      userContent: "done",
      teachingContext: {
        active: true,
        sessionID: "ses_teach",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint/lesson.ts",
        language: "ts",
        revision: 3,
      },
    })

    expect(system).toContain("Persona: code-buddy")
    expect(system).toContain("State: interactive")
    expect(system).toContain("<teaching_workspace>")
    expect(system).toContain("sounds like a completion claim")
  })

  test("builds a math-buddy prompt with figure-capable workspace guidance", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "math-buddy",
      userContent: "teach me reflection",
    })

    expect(system).toContain("Persona: math-buddy")
    expect(system).toContain("Render a figure only when it materially improves the current explanation")
  })

  test("keeps the registered code-buddy prompt aligned with the base prompt and overlay", async () => {
    await using project = await tmpdir({ git: true })

    const agent = await withSyncedOpenCodeConfig(project.path, () => OpenCodeAgent.get("code-buddy"))

    expect(agent).toBeDefined()
    expect(agent?.prompt).toContain("You are Buddy, a learning companion")
    expect(agent?.prompt).toContain("For coding sessions, act as Buddy")
    expect(agent?.prompt).toContain("teaching_start_lesson")
  })

  test("composes code-buddy from the base buddy prompt plus the code overlay", async () => {
    const prompt = composeStaticPrompt(BUDDY_BASE_PROMPT, CODE_BUDDY_OVERLAY)

    expect(prompt).toContain("You are Buddy, a learning companion that helps the learner learn by doing while building real projects.")
    expect(prompt).toContain("For coding sessions, act as Buddy in the `code-buddy` persona.")
    expect(prompt).toContain("Treat the lesson file shown in <teaching_workspace> as the shared whiteboard for the lesson.")
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
