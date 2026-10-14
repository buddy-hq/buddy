import { describe, expect, test } from "bun:test"
import { OPEN_CODE_GPT_SYSTEM_PROMPT } from "@buddy/opencode-adapter/system-prompt"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { BUDDY } from "../../src/learning/personas/buddy"
import { CODE } from "../../src/learning/personas/code"
import CODE_AVATAR_PROMPT from "../../src/learning/personas/prompts/code-avatar.p.md"
import {
  PERSONA_PROMPT_ID,
  renderBuddyPersonaPrompt,
} from "../../src/learning/personas/prompts/render-persona-prompt"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { defineBuddyPersona } from "../../src/learning/personas/wiring/define-buddy-persona"
import { personaCatalogEntries } from "../../src/learning/personas/wiring/persona-metadata"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { parseJsonObject, parsePromptString, requireJsonArray } from "../helpers/parse"
import { tmpdir } from "../helpers/tmpdir"

function syntheticPromptText(result: Awaited<ReturnType<typeof runMessagePromptPipeline>>): string {
  return requireJsonArray(result.transformed.parts, "transformed prompt parts")
    .flatMap((part) => {
      const object = parseJsonObject(part)
      if (object?.synthetic !== true) return []
      const text = parsePromptString(object.text)
      return text === undefined ? [] : [text]
    })
    .join("\n")
}

describe("persona prompts", () => {
  test("each persona renders its own document", () => {
    const learningCompanion = renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.learningCompanion)
    const teachingAssistant = renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.teachingAssistant)

    expect(BUDDY.runtime.prompt).toBe(learningCompanion)
    expect(TEACHING_BUDDY.runtime.prompt).toBe(teachingAssistant)
    expect(learningCompanion).not.toBe(teachingAssistant)
  })

  test("defaults concise responses on for a new chat", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_default",
      },
      body: {
        content: "Explain loops.",
        persona: "buddy",
      },
      projectConfig,
    })
    expect(result.nextTeachingState?.baseConciseResponses).toBe(true)
    expect(result.nextTeachingState?.conciseResponses).toBe(true)
  })

  test("starts a new Buddy chat with concision off when configured", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_off",
      },
      body: {
        content: "Explain loops.",
        persona: "buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
    })
    expect(result.nextTeachingState?.baseConciseResponses).toBe(false)
    expect(result.nextTeachingState?.conciseResponses).toBe(false)
  })

  test("applies the toggle to Teaching Buddy", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const concise = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_teacher_concise",
      },
      body: {
        content: "Help me plan a lesson.",
        persona: "teaching-buddy",
      },
      projectConfig,
    })
    const flexible = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_teacher_flexible",
      },
      body: {
        content: "Help me plan a lesson.",
        persona: "teaching-buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
    })

    expect(concise.nextTeachingState?.baseConciseResponses).toBe(true)
    expect(concise.nextTeachingState?.conciseResponses).toBe(true)
    expect(flexible.nextTeachingState?.baseConciseResponses).toBe(false)
    expect(flexible.nextTeachingState?.conciseResponses).toBe(false)
  })

  test("adds a one-turn reminder when concise responses change in an existing chat", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const first = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_switch",
      },
      body: {
        content: "Explain loops.",
        persona: "buddy",
      },
      projectConfig,
    })
    const second = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_switch",
      },
      body: {
        content: "Go deeper.",
        persona: "buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
      previousState: first.nextTeachingState,
    })

    expect(syntheticPromptText(second).length).toBeGreaterThan(0)
    expect(second.nextTeachingState?.baseConciseResponses).toBe(true)
    expect(second.nextTeachingState?.conciseResponses).toBe(false)

    const third = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_switch",
      },
      body: {
        content: "One more detail.",
        persona: "buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
      previousState: second.nextTeachingState,
    })

    expect(syntheticPromptText(second).length).toBeGreaterThan(syntheticPromptText(third).length)
    expect(syntheticPromptText(third).length).toBeLessThan(syntheticPromptText(second).length)
    expect(third.nextTeachingState?.baseConciseResponses).toBe(true)
  })

  test("can enable concise responses without changing a flexible chat's base prompt", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const first = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_enable",
      },
      body: {
        content: "Explain loops.",
        persona: "buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
    })
    const second = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_enable",
      },
      body: {
        content: "Continue.",
        persona: "buddy",
      },
      projectConfig,
      previousState: first.nextTeachingState,
    })

    expect(syntheticPromptText(second).length).toBeGreaterThan(0)
    expect(second.nextTeachingState?.baseConciseResponses).toBe(false)
    expect(second.nextTeachingState?.conciseResponses).toBe(true)

    const third = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_concise_enable",
      },
      body: {
        content: "Continue.",
        persona: "buddy",
      },
      projectConfig,
      previousState: second.nextTeachingState,
    })
    expect(syntheticPromptText(third).length).toBeLessThan(syntheticPromptText(second).length)
    expect(third.nextTeachingState?.baseConciseResponses).toBe(false)
    expect(third.nextTeachingState?.conciseResponses).toBe(true)
  })

  test("treats pre-toggle in-memory chat state as the original concise behavior", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_legacy_concise_state",
      },
      body: {
        content: "Continue.",
        persona: "buddy",
      },
      projectConfig: {
        ...projectConfig,
        concise_responses: false,
      },
      previousState: {
        sessionId: "ses_legacy_concise_state",
        persona: "buddy",
        currentSurface: "curriculum",
        teachingWorkspaceState: "inactive",
        focusGoalIds: [],
      },
    })

    expect(syntheticPromptText(result).length).toBeGreaterThan(0)
    expect(result.nextTeachingState?.baseConciseResponses).toBe(true)
    expect(result.nextTeachingState?.conciseResponses).toBe(false)
  })

  test("renders complete persona prompts without unresolved placeholders", () => {
    for (const personaPromptID of Object.values(PERSONA_PROMPT_ID)) {
      const prompt = renderBuddyPersonaPrompt(personaPromptID)

      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).not.toContain("{{")
    }
  })

  test("the persona factory preserves a complete prompt without adding Buddy layers", () => {
    const prompt = "A complete persona prompt"
    const persona = defineBuddyPersona({
      ...BUDDY,
      id: "prompt-test",
      runtime: {
        ...BUDDY.runtime,
        prompt,
      },
    })

    expect(persona.runtime.prompt).toBe(prompt)
  })

  test("Code uses OpenCode's GPT prompt and is a valid runtime target", () => {
    const basePromptIndex = CODE.runtime.prompt.indexOf(OPEN_CODE_GPT_SYSTEM_PROMPT)
    const avatarPromptIndex = CODE.runtime.prompt.indexOf(CODE_AVATAR_PROMPT)
    expect(basePromptIndex).toBe(0)
    expect(avatarPromptIndex).toBeGreaterThan(basePromptIndex)
    expect(CODE.hidden).toBe(false)
    expect(personaCatalogEntries()).toContainEqual(
      expect.objectContaining({
        id: "code",
        hidden: false,
      }),
    )
  })

  test("accepts Code as a prompt target", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const result = await runMessagePromptPipeline({
      context: {
        directory: project.path,
        sessionID: "ses_code_persona",
      },
      body: {
        content: "Inspect this repository",
        persona: "code",
      },
      projectConfig,
    })

    expect(result.transformed.agent).toBe("code")
    expect(result.nextTeachingState?.persona).toBe("code")
  })
})
