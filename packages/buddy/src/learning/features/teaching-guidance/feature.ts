import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { reflectionTool, dynamicReflectionTool } from "./tools/reflection"
// import { assessSkill } from "./skills/assess"
// import { compareConceptsSkill } from "./skills/compare-concepts"
// import { explainSkill } from "./skills/explain"
// import { learnSkill } from "./skills/learn"
import { alignTeachingTopicsToGradeLevelAndAgeSkill } from "./skills/align-teaching-topics-to-grade-level-and-age"
import { findIndianEducationResourcesSkill } from "./skills/find-indian-education-resources"
import { fetchIndianCompetitionPapersSkill } from "./skills/fetch-indian-competition-papers"
import { learningDesignFrameworksSkill } from "./skills/learning-design-frameworks"
// import { practiceSkill } from "./skills/practice"
import { teachingModelsSkill } from "./skills/teaching-models"
import { teachingResourceAuthoringSkill } from "./skills/teaching-resource-authoring"
import { teachChemistrySkill } from "./skills/teach-chemistry"
// import { workedExampleSkill } from "./skills/worked-example"
import { resolveConfusionSkill } from "./skills/resolve-confusion"

export const teachingGuidanceFeature = defineBuddyFeature({
  id: "teaching-guidance",
  tools: [reflectionTool, dynamicReflectionTool],
  skills: [
    // These shallow skills remain in the codebase for future redevelopment but are intentionally
    // not packed into the feature. See docs/features/skills/known-issues.md.
    // learnSkill,
    // practiceSkill,
    // assessSkill,
    // explainSkill,
    // workedExampleSkill,
    // compareConceptsSkill,
    resolveConfusionSkill,
    learningDesignFrameworksSkill,
    teachingModelsSkill,
    teachingResourceAuthoringSkill,
    alignTeachingTopicsToGradeLevelAndAgeSkill,
    findIndianEducationResourcesSkill,
    fetchIndianCompetitionPapersSkill,
    teachChemistrySkill,
  ],
  subagents: [],
  surfaces: [],
})
