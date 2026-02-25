import { Instance } from "../project/instance.js"
import { CurriculumService } from "../curriculum/curriculum-service.js"
import LEARNING_COMPANION from "./prompts/learning-companion.txt"
import MAX_STEPS from "./prompts/max-steps.txt"

// ---------------------------------------------------------------------------
// Layer 1: Identity + Environment (stable, rebuilt every call)
// ---------------------------------------------------------------------------

export function loadEnvironment(input: { providerID: string; modelID: string }): string {
  return [
    `You are powered by the model named ${input.modelID}. The exact model ID is ${input.providerID}/${input.modelID}.`,
    `Here is some useful information about the environment you are running in:`,
    `<env>`,
    `  Working directory: ${Instance.directory}`,
    `  Is directory a git repo: ${Instance.project.vcs === "git" ? "yes" : "no"}`,
    `  Platform: ${process.platform}`,
    `  Today's date: ${new Date().toDateString()}`,
    `</env>`,
    `<directories>`,
    `</directories>`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Layer 2: Behavioral Prompt (stable, loaded from .txt)
// ---------------------------------------------------------------------------

export function loadBehavior(): string {
  return LEARNING_COMPANION
}

// ---------------------------------------------------------------------------
// Layer 4: Dynamic Context -- Curriculum injection
// ---------------------------------------------------------------------------

/**
 * Condense a full curriculum markdown into just headings + incomplete items
 * with completion counts per section. This keeps the token cost small while
 * giving the LLM awareness of the learner's progress.
 */
export function condenseCurriculum(markdown: string): string {
  const lines = markdown.split("\n")
  const result: string[] = []
  let currentHeading = ""
  let completed = 0
  let total = 0

  function flushSection() {
    if (currentHeading && total > 0) {
      // Insert heading with stats at the position before incomplete items
      result.splice(result.length - (total - completed), 0, `${currentHeading} (${completed}/${total} complete)`)
    }
  }

  for (const line of lines) {
    if (line.match(/^#+\s/)) {
      flushSection()
      currentHeading = line
      completed = 0
      total = 0
      continue
    }

    const isIncomplete = /^\s*[-*]\s+\[ \]\s+/.test(line)
    const isComplete = /^\s*[-*]\s+\[x\]\s+/i.test(line)

    if (isIncomplete) {
      total++
      result.push(line)
    }
    if (isComplete) {
      total++
      completed++
    }
  }

  flushSection()
  return result.join("\n")
}

export async function loadCurriculumContext(): Promise<string> {
  try {
    const curriculum = await CurriculumService.peek(Instance.directory)
    if (!curriculum) {
      return ""
    }

    const condensed = condenseCurriculum(curriculum.markdown)
    if (!condensed.trim()) return ""

    return ["<curriculum>", `Path: ${curriculum.path}`, condensed, "</curriculum>"].join("\n")
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// Max-steps prompt (used as assistant message prefix, not system prompt)
// ---------------------------------------------------------------------------

export function loadMaxStepsPrompt(): string {
  return MAX_STEPS
}
