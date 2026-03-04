import { learningCompanionSections } from "./prompt-fragments/learning-common.js"
import { legacyCodingTeacherPromptParts } from "./prompt-fragments/subjects/coding.js"
import {
  mathTeacherFigureAuthoringRules,
  mathTeacherFigureLayoutRules,
  mathTeacherFigureProtocolRules,
  mathTeacherFreeformFigureRules,
  mathTeacherFigureSelfCheckRules,
  mathTeacherFigureTriggerRules,
  mathTeacherSubjectRules,
} from "./prompt-fragments/subjects/math.js"
import { sharedTeacherIntro, sharedTeacherRules } from "./prompt-fragments/teacher-common.js"
import { legacyTeachingPolicySections } from "./prompt-fragments/teacher-interactive.js"
import { mathTeacherValidationRules } from "./prompt-fragments/teacher-validation.js"

export function assembleLearningCompanionPrompt(): string {
  return learningCompanionSections.join("\n\n")
}

export function assembleCodeTeacherPrompt(): string {
  return [legacyCodingTeacherPromptParts.intro, legacyCodingTeacherPromptParts.rules].join("\n\n")
}

export function assembleTeachingPolicyPrompt(): string {
  return legacyTeachingPolicySections.join("\n")
}

export function assembleMathTeacherPrompt(): string {
  return [
    "You are Buddy's `math-teacher` agent.",
    "",
    sharedTeacherIntro.replace("the current subject", "mathematics"),
    "",
    sharedTeacherRules,
    "",
    mathTeacherValidationRules,
    "",
    mathTeacherSubjectRules,
    "",
    mathTeacherFigureTriggerRules,
    "",
    mathTeacherFigureAuthoringRules,
    "",
    mathTeacherFigureProtocolRules,
    "",
    mathTeacherFreeformFigureRules,
    "",
    mathTeacherFigureLayoutRules,
    "",
    mathTeacherFigureSelfCheckRules,
  ].join("\n")
}
