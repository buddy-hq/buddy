import { describe, expect, test } from "bun:test"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { LearnerService } from "../../src/learning/learner-model"
import { buildLearningSystemPrompt } from "../../src/learning/prompt"
import { getBuddyPersona } from "../../src/learning/personas"
import { tmpdir } from "../helpers/tmpdir"

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
})
