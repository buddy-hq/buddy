import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { OPEN_CODE_GPT_SYSTEM_PROMPT } from "@buddy/opencode-adapter/system-prompt"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { BUDDY } from "../../src/learning/personas/buddy"
import { CODE } from "../../src/learning/personas/code"
import CODE_AVATAR_PROMPT from "../../src/learning/personas/prompts/code-avatar.p.md"
import SKILLS_SECTION from "../../src/learning/personas/prompts/sections/product/skills.p.md"
import type { PersonaPromptID } from "../../src/learning/personas/prompts/render-persona-prompt"
import {
  PERSONA_PROMPT_ID,
  renderBuddyPersonaPrompt,
} from "../../src/learning/personas/prompts/render-persona-prompt"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { stripConciseResponseInstructions } from "../../src/learning/personas/prompts/concise-response-control"
import { defineBuddyPersona } from "../../src/learning/personas/wiring/define-buddy-persona"
import { personaCatalogEntries } from "../../src/learning/personas/wiring/persona-metadata"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import {
  parseJsonObject,
  parsePromptString,
  requireJsonArray,
} from "../helpers/parse"
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

  test("declares response style in the persona documents", () => {
    const learningDocument = readFileSync(
      join(import.meta.dir, "../../src/learning/personas/prompts/learning-companion.p.md"),
      "utf8",
    )
    const teachingDocument = readFileSync(
      join(import.meta.dir, "../../src/learning/personas/prompts/teaching-assistant.p.md"),
      "utf8",
    )

    expect(learningDocument).toContain("{{product/concise-responses/student}}")
    expect(teachingDocument).toContain("{{product/concise-responses/teacher}}")
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

  test("a document never mixes a forked section's two variants", () => {
    const VARIANT_BY_PERSONA = {
      "learning-companion": "student",
      "teaching-assistant": "teacher",
    } satisfies Readonly<Record<PersonaPromptID, string>>

    for (const [personaPromptID, variant] of Object.entries(VARIANT_BY_PERSONA)) {
      const document = readFileSync(
        join(import.meta.dir, "../../src/learning/personas/prompts", `${personaPromptID}.p.md`),
        "utf8",
      )
      const variants = [...document.matchAll(/\{\{[^}]*\/(student|teacher)\//g)].map(
        (match) => match[1],
      )

      expect(variants.length).toBeGreaterThan(0)
      expect(new Set(variants)).toEqual(new Set([variant]))
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

  test("headings never skip a level", () => {
    const HEADING = /^(#{1,6}) /

    for (const personaPromptID of Object.values(PERSONA_PROMPT_ID)) {
      const levels = renderBuddyPersonaPrompt(personaPromptID)
        .split("\n")
        .flatMap((line) => {
          const depth = HEADING.exec(line)?.[1].length
          return depth === undefined ? [] : [{ depth, line }]
        })

      expect(levels.at(0)?.depth).toBe(1)

      for (const [index, heading] of levels.entries()) {
        const previousDepth = levels[index - 1]?.depth ?? heading.depth
        if (heading.depth > previousDepth + 1) {
          throw new Error(
            `${personaPromptID}: "${heading.line}" jumps from h${previousDepth} to h${heading.depth}`,
          )
        }
      }
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
