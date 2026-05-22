import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { reflectionTool, dynamicReflectionTool } from "./tools/reflection"
import { questionTool } from "./tools/question"
import { assessSkill } from "./skills/assess"
import { compareConceptsSkill } from "./skills/compare-concepts"
import { explainSkill } from "./skills/explain"
import { learnSkill } from "./skills/learn"
import { practiceSkill } from "./skills/practice"
import { workedExampleSkill } from "./skills/worked-example"

export const teachingGuidanceFeature = defineBuddyFeature({
  id: "teaching-guidance",
  tools: [reflectionTool, dynamicReflectionTool, questionTool],
  skills: [
    learnSkill,
    practiceSkill,
    assessSkill,
    explainSkill,
    workedExampleSkill,
    compareConceptsSkill,
  ],
  subagents: [],
  surfaces: [],
})
