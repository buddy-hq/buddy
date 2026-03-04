import LEGACY_LEARNING_COMPANION_PROMPT from "../../companion/prompt.md"

const LEARNING_COMPANION_TEXT = LEGACY_LEARNING_COMPANION_PROMPT.trim()

const LEARNING_COMPANION_SECTION_DELIMITERS = [
  "\n\n# Tone and style\n",
  "\n\n# Professional objectivity\n",
  "\n\n# Curriculum awareness\n",
  "\n\n# Doing tasks\n",
  "\n\n# Following conventions\n",
  "\n\n# Tool usage policy\n",
  "\n\n# Code references\n",
] as const

function splitByDelimiter(source: string, delimiter: string): [string, string] {
  const index = source.indexOf(delimiter)
  if (index < 0) {
    throw new Error(`Prompt delimiter not found: ${delimiter}`)
  }

  return [source.slice(0, index), source.slice(index + delimiter.length)]
}

const [learningCompanionIntro, afterTone] = splitByDelimiter(
  LEARNING_COMPANION_TEXT,
  LEARNING_COMPANION_SECTION_DELIMITERS[0],
)
const [learningCompanionToneAndStyle, afterObjectivity] = splitByDelimiter(
  afterTone,
  LEARNING_COMPANION_SECTION_DELIMITERS[1],
)
const [learningCompanionProfessionalObjectivity, afterCurriculum] = splitByDelimiter(
  afterObjectivity,
  LEARNING_COMPANION_SECTION_DELIMITERS[2],
)
const [learningCompanionCurriculumAwareness, afterDoingTasks] = splitByDelimiter(
  afterCurriculum,
  LEARNING_COMPANION_SECTION_DELIMITERS[3],
)
const [learningCompanionDoingTasks, afterConventions] = splitByDelimiter(
  afterDoingTasks,
  LEARNING_COMPANION_SECTION_DELIMITERS[4],
)
const [learningCompanionFollowingConventions, afterToolUsage] = splitByDelimiter(
  afterConventions,
  LEARNING_COMPANION_SECTION_DELIMITERS[5],
)
const [learningCompanionToolUsagePolicy, learningCompanionCodeReferences] = splitByDelimiter(
  afterToolUsage,
  LEARNING_COMPANION_SECTION_DELIMITERS[6],
)

export const learningCompanionSections = [
  learningCompanionIntro,
  `# Tone and style\n${learningCompanionToneAndStyle}`,
  `# Professional objectivity\n${learningCompanionProfessionalObjectivity}`,
  `# Curriculum awareness\n${learningCompanionCurriculumAwareness}`,
  `# Doing tasks\n${learningCompanionDoingTasks}`,
  `# Following conventions\n${learningCompanionFollowingConventions}`,
  `# Tool usage policy\n${learningCompanionToolUsagePolicy}`,
  `# Code references\n${learningCompanionCodeReferences}`,
]
