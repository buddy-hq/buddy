import LEARNING_COMPANION_PROMPT from "./prompt.js"

// ---------------------------------------------------------------------------
// Stable behavior prompt loaded from disk
// ---------------------------------------------------------------------------

export function loadLearningCompanionPrompt(): string {
  return LEARNING_COMPANION_PROMPT
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
