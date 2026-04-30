import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import {
  dynamicPedagogyReflectionTool,
  dynamicPedagogyStepwiseSolveTool,
} from "../tools/dynamic-learning-tools"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
  domain: "general",
  surfaces: ["curriculum", "flashcard", "question-set"],
  defaultSurface: "curriculum",
  hidden: false,
  tools: {
    static: {
      learner_memory_search: "allow",
      learner_memory_update: "allow",
      render_mermaid: "allow",
      search_standards: "allow",
      get_standard: "allow",
      get_learning_components: "allow",
      get_prerequisites: "allow",
      get_next_standards: "allow",
      get_crosswalk: "allow",
      query_standards_sql: "allow",
      pedagogy_prepare_resource: "allow",
      pedagogy_resource_ingest_full_text: "allow",
    },
    dynamic: {
      [dynamicPedagogyReflectionTool.id]: "allow",
      [dynamicPedagogyStepwiseSolveTool.id]: "allow",
    },
  },
  skills: {
    "buddy-pedagogy-learn": "allow",
    "buddy-pedagogy-practice": "allow",
    "buddy-pedagogy-assess": "allow",
    "buddy-pedagogy-explanation": "allow",
    "buddy-pedagogy-worked-example": "allow",
    "buddy-pedagogy-concept-contrast": "allow",
    "buddy-pedagogy-reading-assistant": "allow",
    "buddy-pedagogy-analogy": "allow",
  },
  subagents: {
    "curriculum-orchestrator": "prefer",
    "goal-writer": "prefer",
    "question-set-author": "prefer",
    "flashcard-author": "prefer",
  },
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: false,
  },
  runtime: {
    kind: "build",
    prompt: "",
    permission: {
      todoread: "deny",
      todowrite: "deny",
    },
  },
})
