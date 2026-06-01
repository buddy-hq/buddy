import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { reflectionTool, dynamicReflectionTool } from "./tools/reflection"
import { assessSkill } from "./skills/assess"
import { compareConceptsSkill } from "./skills/compare-concepts"
import { explainSkill } from "./skills/explain"
import { learnSkill } from "./skills/learn"
import { alignTeachingTopicsToGradeLevelAndAgeSkill } from "./skills/align-teaching-topics-to-grade-level-and-age"
import { learningDesignFrameworksSkill } from "./skills/learning-design-frameworks"
import { practiceSkill } from "./skills/practice"
import { teachingModelsSkill } from "./skills/teaching-models"
import { teachingResourceAuthoringSkill } from "./skills/teaching-resource-authoring"
import { workedExampleSkill } from "./skills/worked-example"
import { resolveConfusionSkill } from "./skills/resolve-confusion"

export const teachingGuidanceFeature = defineBuddyFeature({
  id: "teaching-guidance",
  tools: [reflectionTool, dynamicReflectionTool],
  skills: [
    learnSkill,
    practiceSkill,
    assessSkill,
    explainSkill,
    workedExampleSkill,
    compareConceptsSkill,
    resolveConfusionSkill,
    learningDesignFrameworksSkill,
    teachingModelsSkill,
    teachingResourceAuthoringSkill,
    alignTeachingTopicsToGradeLevelAndAgeSkill,
  ],
  subagents: [],
  surfaces: [],
})
