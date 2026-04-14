import BUDDY_BASE_PROMPT from '../buddy/buddy.p.md'
import READING_BUDDY_OVERLAY from './overlay.p.md'
import { createPrimaryAgent } from '../../agent-factories'
import { registerBuddyAgent } from '../../register-buddy-agent'

export const READING_BUDDY = registerBuddyAgent({
  key: 'reading-buddy',
  agent: createPrimaryAgent({
    description:
      'Reading-focused Buddy persona for building comprehension and literacy skills.',
    prompt: [BUDDY_BASE_PROMPT.trim(), READING_BUDDY_OVERLAY.trim()].join(
      '\n\n',
    ),
    availableSubagents: [
      'curriculum-orchestrator',
      'goal-writer',
      'practice-agent',
      'assessment-agent',
      'question-set-author',
    ],
    permission: {
      question: 'allow',
      plan_enter: 'allow',
      learner_snapshot_read: 'allow',
      learner_practice_record: 'allow',
      learner_assessment_record: 'allow',
      render_mermaid: 'allow',
      render_saved_question_set: 'allow',
      teaching_start_lesson: 'deny',
      teaching_checkpoint: 'deny',
      teaching_add_file: 'deny',
      teaching_set_lesson: 'deny',
      teaching_restore_checkpoint: 'deny',
      python_calculator: 'deny',
      todoread: 'deny',
      todowrite: 'deny',
    },
  }),
})
