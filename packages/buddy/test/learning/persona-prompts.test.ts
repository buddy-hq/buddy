import { describe, expect, test } from "bun:test"
import { OPEN_CODE_GPT_SYSTEM_PROMPT } from "@buddy/opencode-adapter/system-prompt"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { BUDDY } from "../../src/learning/personas/buddy"
import { CODE } from "../../src/learning/personas/code"
import CODE_AVATAR_PROMPT from "../../src/learning/personas/prompts/code-avatar.p.md"
import { renderBuddyBasePersonaPrompt } from "../../src/learning/personas/prompts/render-base-prompt"
import { TEACHING_BUDDY } from "../../src/learning/personas/teaching-buddy"
import { defineBuddyPersona } from "../../src/learning/personas/wiring/define-buddy-persona"
import { personaCatalogEntries } from "../../src/learning/personas/wiring/persona-metadata"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

describe("persona prompts", () => {
  test("Buddy personas explicitly render the base prompt with an empty overlay", () => {
    const basePrompt = renderBuddyBasePersonaPrompt("")

    expect(BUDDY.runtime.prompt).toBe(basePrompt)
    expect(TEACHING_BUDDY.runtime.prompt).toBe(basePrompt)
    expect(basePrompt).not.toContain("{{persona_overlay}}")
  })

  test("the persona factory preserves a complete prompt without adding the Buddy base", () => {
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
    expect(CODE.runtime.prompt).toBe(
      [OPEN_CODE_GPT_SYSTEM_PROMPT, CODE_AVATAR_PROMPT].join("\n\n"),
    )
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
