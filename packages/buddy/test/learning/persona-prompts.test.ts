import { describe, expect, test } from "bun:test"
import { OPEN_CODE_GPT_SYSTEM_PROMPT } from "@buddy/opencode-adapter/system-prompt"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { BUDDY } from "../../src/learning/personas/buddy"
import { CODE } from "../../src/learning/personas/code"
import CODE_AVATAR_PROMPT from "../../src/learning/personas/prompts/code-avatar.p.md"
import STUDENT_SHOW_DONT_TELL from "../../src/learning/personas/prompts/sections/constitution/student/show-dont-tell.p.md"
import STUDENT_TEACH_THROUGH_CONVERSATION from "../../src/learning/personas/prompts/sections/constitution/student/teach-through-conversation.p.md"
import TEACHER_SHOW_DONT_TELL from "../../src/learning/personas/prompts/sections/constitution/teacher/show-dont-tell.p.md"
import TEACHER_TEACH_THROUGH_CONVERSATION from "../../src/learning/personas/prompts/sections/constitution/teacher/teach-through-conversation.p.md"
import STUDENT_CONCISE_RESPONSES from "../../src/learning/personas/prompts/sections/product/concise-responses/student.p.md"
import TEACHER_CONCISE_RESPONSES from "../../src/learning/personas/prompts/sections/product/concise-responses/teacher.p.md"
import PICK_A_TEACHING_MODEL from "../../src/learning/personas/prompts/sections/teaching/student/pick-a-teaching-model.p.md"
import SKILLS_SECTION from "../../src/learning/personas/prompts/sections/product/skills.p.md"
import {
  PERSONA_PROMPT_ID,
  renderBuddyPersonaPrompt,
} from "../../src/learning/personas/prompts/render-persona-prompt"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { stripConciseResponseInstructions } from "../../src/learning/personas/prompts/concise-response-control"
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

  test("turning concise responses off removes the response-style section", async () => {
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
    const flexiblePrompt = stripConciseResponseInstructions({
      persona: "buddy",
      systemPrompt: BUDDY.runtime.prompt,
    })

    expect(flexiblePrompt).not.toBe(BUDDY.runtime.prompt)
    expect(flexiblePrompt.length).toBeLessThan(BUDDY.runtime.prompt.length)
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

    const flexiblePrompt = stripConciseResponseInstructions({
      persona: "teaching-buddy",
      systemPrompt: TEACHING_BUDDY.runtime.prompt,
    })
    expect(flexiblePrompt).not.toBe(TEACHING_BUDDY.runtime.prompt)
    expect(flexiblePrompt.length).toBeLessThan(TEACHING_BUDDY.runtime.prompt.length)
    expect(concise.nextTeachingState?.baseConciseResponses).toBe(true)
    expect(flexible.nextTeachingState?.baseConciseResponses).toBe(false)
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

  test("renders only the sections for the selected persona variant", () => {
    const learningCompanion = renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.learningCompanion)
    const teachingAssistant = renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.teachingAssistant)

    const studentAssets = [
      STUDENT_SHOW_DONT_TELL,
      STUDENT_TEACH_THROUGH_CONVERSATION,
      STUDENT_CONCISE_RESPONSES,
      PICK_A_TEACHING_MODEL,
    ]
    for (const asset of studentAssets) {
      expect(learningCompanion).toContain(asset.trim())
      expect(teachingAssistant).not.toContain(asset.trim())
    }

    const teacherAssets = [
      TEACHER_SHOW_DONT_TELL,
      TEACHER_TEACH_THROUGH_CONVERSATION,
      TEACHER_CONCISE_RESPONSES,
    ]
    for (const asset of teacherAssets) {
      expect(teachingAssistant).toContain(asset.trim())
      expect(learningCompanion).not.toContain(asset.trim())
    }
  })

  test("no section renders twice in a document", () => {
    for (const personaPromptID of Object.values(PERSONA_PROMPT_ID)) {
      const headings = renderBuddyPersonaPrompt(personaPromptID)
        .split("\n")
        .filter((line) => /^#{1,3} /.test(line))

      expect(headings).toEqual([...new Set(headings)])
    }
  })

  test("every section a document declares resolves, and no placeholder survives", () => {
    for (const personaPromptID of Object.values(PERSONA_PROMPT_ID)) {
      const prompt = renderBuddyPersonaPrompt(personaPromptID)

      expect(prompt).not.toContain("{{")
      expect(prompt).toContain(SKILLS_SECTION.trim())
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
    expect(CODE.runtime.prompt).toBe([OPEN_CODE_GPT_SYSTEM_PROMPT, CODE_AVATAR_PROMPT].join("\n\n"))
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
