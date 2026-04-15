import { describe, expect, test } from "bun:test"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { LearnerService } from "../../src/learning/learner-model"
import { buildBuddyPromptEnvelope } from "../../src/learning/prompt/buddy-prompt-compiler"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona.orchestration"
import { withInstalledMockAdvancedMathRuntime } from "../helpers/advanced-math-runtime"
import { tmpdir } from "../helpers/tmpdir"

async function buildRuntimePrompt(input: {
  directory: string
  persona: "buddy" | "code-buddy" | "math-buddy"
  intent?: "auto" | "learn" | "practice" | "assess"
  teachingContext?: Parameters<typeof buildBuddyPromptEnvelope>[0]["teachingContext"]
  resources?: Parameters<typeof buildBuddyPromptEnvelope>[0]["resources"]
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

  const promptEnvelope = await buildBuddyPromptEnvelope({
    directory: input.directory,
    persona: profile.persona,
    capabilityEnvelope: profile.capabilityEnvelope,
    intent,
    learnerSnapshot: snapshot,
    focusGoalIds: [],
    resources: input.resources ?? [],
    teachingContext: input.teachingContext,
  })
  return [
    promptEnvelope.systemContext,
    ...promptEnvelope.userPreludeParts.map((part) => part.text),
  ].join("\n\n")
}

describe("prompt assemblies", () => {
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

  test("adds calculator guidance to math-buddy only when the advanced runtime is available", async () => {
    await using project = await tmpdir()

    const withoutRuntime = await buildRuntimePrompt({
      directory: project.path,
      persona: "math-buddy",
      intent: "learn",
    })

    expect(withoutRuntime).not.toContain("<calculator_runtime>")

    await withInstalledMockAdvancedMathRuntime(async () => {
      const withRuntime = await buildRuntimePrompt({
        directory: project.path,
        persona: "math-buddy",
        intent: "learn",
      })

      expect(withRuntime).toContain("<calculator_runtime>")
      expect(withRuntime).toContain("python_calculator is available in this session.")
      expect(withRuntime).toContain("Prefer exact symbolic forms")
    })
  })

  test("includes a compact notebook resource inventory", async () => {
    await using project = await tmpdir()

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "buddy",
      resources: [
        {
          id: "res_shape_up",
          alias: "shape-up",
          sourceRelpath: "resources/shape-up/Shape Up.pdf",
          format: "pdf",
          status: "ready",
          warnings: [],
        },
        {
          id: "res_goal_rubric",
          alias: "goal-rubric",
          sourceRelpath: "resources/goal-rubric/rubric.docx",
          format: "docx",
          status: "preparing",
          warnings: ["The resource is still being prepared."],
        },
      ],
    })

    expect(system).toContain("<notebook_resources>")
    expect(system).toContain("Available resources:")
    expect(system).toContain("id=res_shape_up")
    expect(system).toContain("alias=shape-up")
    expect(system).toContain("pack=resources/shape-up/processed")
    expect(system).toContain("id=res_goal_rubric")
    expect(system).toContain("alias=goal-rubric")
    expect(system).toContain("status=preparing")
  })

  test("adds truncation guidance when resources exceed detailed budget", async () => {
    await using project = await tmpdir()

    const resources = Array.from({ length: 10 }, (_, index) => ({
      id: `res_${index + 1}`,
      alias: `resource-${index + 1}`,
      sourceRelpath: `resources/resource-${index + 1}/source-${index + 1}.pdf`,
      format: "pdf",
      status: "ready" as const,
      warnings: [],
    }))

    const system = await buildRuntimePrompt({
      directory: project.path,
      persona: "buddy",
      resources,
    })

    expect(system).toContain("alias=resource-1")
    expect(system).toContain("alias=resource-7")
    expect(system).not.toContain("alias=resource-8 |")
    expect(system).toContain(
      "Additional resources (alias only): resource-8, resource-9, resource-10",
    )
    expect(system).toContain(
      "Inventory is truncated for prompt budget. Inspect `resources/` directly when you need the full list.",
    )
  })
})
