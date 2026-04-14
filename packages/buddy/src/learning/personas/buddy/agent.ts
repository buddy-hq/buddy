import { createBuildAgent } from '../../agent-factories'
import { registerBuddyAgent } from '../../register-buddy-agent'
import BUDDY_BASE_PROMPT from './buddy.p.md'

export const BUDDY_AGENT = registerBuddyAgent({
  key: 'buddy',
  agent: createBuildAgent({
    description:
      'The default Buddy persona for learning conversations and project help.',
    prompt: BUDDY_BASE_PROMPT.trim(),
    availableSubagents: [
      'curriculum-orchestrator',
      'goal-writer',
      'practice-agent',
      'assessment-agent',
      'question-set-author',
    ],
    permission: {
      learner_snapshot_read: 'allow',
      learner_practice_record: 'allow',
      learner_assessment_record: 'allow',
      search_standards: 'allow',
      get_standard: 'allow',
      get_learning_components: 'allow',
      get_prerequisites: 'allow',
      get_next_standards: 'allow',
      get_crosswalk: 'allow',
      query_standards_sql: 'allow',
      render_saved_question_set: 'allow',
      render_mermaid: 'allow',
      python_calculator: 'deny',
      todoread: 'deny',
      todowrite: 'deny',
    },
  }),
})
