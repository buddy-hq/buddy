import { loadProjectConfig } from "../../../config/store/read-config"
import { recordCheckpointMemory, recordFlashcardReviewMemory, recordQuestionSetAttemptMemory } from "./deterministic"
import { findLearnerEvidence, writeLearnerEvidenceForEvent } from "./evidence"
import { readLearnerMemorySettings } from "./settings"
import { appendLearnerEvent, appendLearnerEventOnce, createLearnerEvent } from "./storage"

async function learnerMemoryIsActive(directory: string): Promise<boolean> {
  const config = await loadProjectConfig(directory).catch(() => undefined)
  return config ? readLearnerMemorySettings(config).enabled : false
}

async function ingestQuestionSetAttempt(input: {
  directory: string
  eventID?: string
  eventCreatedAt?: string
  objectID: string
  attemptID: string
  title: string
  groupType: string
  totalQuestions: number
  correctQuestions: number
  status: string
  tags: string[]
  result: unknown
}): Promise<void> {
  if (!(await learnerMemoryIsActive(input.directory))) return
  if (input.eventID && (await findLearnerEvidence(input.directory, input.eventID))) return

  const learnerEvent = createLearnerEvent({
    ...(input.eventID ? { id: input.eventID } : {}),
    ...(input.eventCreatedAt ? { createdAt: input.eventCreatedAt } : {}),
    type: "question_set_attempt_ingested",
    sourceKind: "question_set_attempt",
    sourceId: input.attemptID,
    searchableText: `Question set attempt ${input.objectID}: ${input.correctQuestions}/${input.totalQuestions} correct, status ${input.status}.`,
    payload: {
      objectID: input.objectID,
      attemptID: input.attemptID,
      result: input.result,
    },
  })
  await appendLearnerEventOnce(input.directory, learnerEvent)
  const memory = await recordQuestionSetAttemptMemory({
    directory: input.directory,
    eventId: learnerEvent.id,
    title: input.title,
    groupType: input.groupType,
    totalQuestions: input.totalQuestions,
    correctQuestions: input.correctQuestions,
    tags: input.tags,
    projectPath: input.directory,
  })
  await writeLearnerEvidenceForEvent({
    directory: input.directory,
    event: learnerEvent,
    objectId: input.objectID,
    title: input.title,
    note: `Question-set attempt recorded with ${input.correctQuestions} of ${input.totalQuestions} correct (${input.status}).`,
    tags: input.tags,
    payload: {
      groupType: input.groupType,
      totalQuestions: input.totalQuestions,
      correctQuestions: input.correctQuestions,
      status: input.status,
    },
    memoryEffects: [
      {
        memoryId: memory.id,
        effect:
          input.correctQuestions === input.totalQuestions
            ? "noted"
            : input.correctQuestions > 0
              ? "reinforced"
              : "weakened",
        reason:
          input.correctQuestions === input.totalQuestions
            ? "Perfect assessment evidence is available for this question set."
            : input.correctQuestions > 0
              ? "Partial assessment result indicates this topic still needs reinforcement."
              : "Missed assessment result indicates this topic likely remains weak.",
      },
    ],
  })
}

async function ingestFlashcardReview(input: {
  directory: string
  eventID?: string
  eventCreatedAt?: string
  objectID: string
  cardID: string
  deckTitle: string
  tags: string[]
  rating: string
  previousState: string
  newState: string
  isLeech: boolean
  nextDue: number
}): Promise<void> {
  if (!(await learnerMemoryIsActive(input.directory))) return
  if (input.eventID && (await findLearnerEvidence(input.directory, input.eventID))) return

  const learnerEvent = createLearnerEvent({
    ...(input.eventID ? { id: input.eventID } : {}),
    ...(input.eventCreatedAt ? { createdAt: input.eventCreatedAt } : {}),
    type: "flashcard_review_ingested",
    sourceKind: "flashcard_review",
    sourceId: input.cardID,
    searchableText: `Flashcard review ${input.objectID}/${input.cardID}: rating ${input.rating}, ${input.previousState} -> ${input.newState}.`,
    payload: {
      objectID: input.objectID,
      cardID: input.cardID,
      rating: input.rating,
      previousState: input.previousState,
      newState: input.newState,
      isLeech: input.isLeech,
    },
  })
  await appendLearnerEventOnce(input.directory, learnerEvent)
  const memory = await recordFlashcardReviewMemory({
    directory: input.directory,
    eventId: learnerEvent.id,
    deckTitle: input.deckTitle,
    tags: input.tags,
    rating: input.rating,
    previousState: input.previousState,
    newState: input.newState,
    isLeech: input.isLeech,
    projectPath: input.directory,
  })
  await writeLearnerEvidenceForEvent({
    directory: input.directory,
    event: learnerEvent,
    objectId: input.objectID,
    title: input.deckTitle,
    note: `Flashcard review recorded for card ${input.cardID} with rating ${input.rating}; ${input.previousState} -> ${input.newState}.`,
    tags: input.tags,
    payload: {
      objectID: input.objectID,
      cardID: input.cardID,
      rating: input.rating,
      previousState: input.previousState,
      newState: input.newState,
      isLeech: input.isLeech,
      nextDue: input.nextDue,
    },
    memoryEffects: [
      {
        ...(memory ? { memoryId: memory.id } : {}),
        effect: input.isLeech || input.rating === "again" ? "reinforced" : "noted",
        reason:
          input.isLeech || input.rating === "again"
            ? "Repeated difficulty on this card suggests the topic remains fragile."
            : "Stable review evidence recorded for this card.",
      },
    ],
  })
}

async function ingestTeachingCheckpoint(input: {
  directory: string
  sessionID: string
  revision: number
  lessonFilePath: string
  checkpointFilePath: string
  changedSinceLastCheckpoint: boolean
}): Promise<void> {
  if (!(await learnerMemoryIsActive(input.directory))) return

  const learnerEvent = createLearnerEvent({
    type: "task_checkpoint_ingested",
    sessionId: input.sessionID,
    projectPath: input.directory,
    sourceKind: "teaching_checkpoint",
    sourceId: input.sessionID,
    searchableText: `Teaching checkpoint saved for ${input.sessionID}; changedSinceLastCheckpoint=${input.changedSinceLastCheckpoint}.`,
    payload: {
      sessionID: input.sessionID,
      revision: input.revision,
      lessonFilePath: input.lessonFilePath,
      checkpointFilePath: input.checkpointFilePath,
      changedSinceLastCheckpoint: input.changedSinceLastCheckpoint,
    },
  })
  await appendLearnerEvent(input.directory, learnerEvent)
  const memory = await recordCheckpointMemory({
    directory: input.directory,
    eventId: learnerEvent.id,
    sessionID: input.sessionID,
    lessonFilePath: input.lessonFilePath,
    revision: input.revision,
    changedSinceLastCheckpoint: input.changedSinceLastCheckpoint,
    projectPath: input.directory,
  })
  await writeLearnerEvidenceForEvent({
    directory: input.directory,
    event: learnerEvent,
    objectId: input.sessionID,
    title: `Teaching checkpoint ${input.sessionID}`,
    note: input.changedSinceLastCheckpoint
      ? "Checkpoint captured learner progress changes that differ from the prior checkpoint."
      : "Checkpoint captured the current learner state without new changes since the prior checkpoint.",
    tags: ["teaching-checkpoint", input.sessionID],
    payload: {
      revision: input.revision,
      lessonFilePath: input.lessonFilePath,
      checkpointFilePath: input.checkpointFilePath,
      changedSinceLastCheckpoint: input.changedSinceLastCheckpoint,
    },
    memoryEffects: [
      {
        ...(memory ? { memoryId: memory.id } : {}),
        effect: "noted",
        reason: input.changedSinceLastCheckpoint
          ? "Checkpoint evidence captured a meaningful learner workspace update."
          : "Checkpoint evidence captured a stable learner workspace state.",
      },
    ],
  })
}

async function ingestLearnerContextDelivery(input: {
  directory: string
  sessionID: string
  messageID: string
  deliveryKind: string
  fingerprint: string
  itemCount: number
}): Promise<void> {
  if (!(await learnerMemoryIsActive(input.directory))) return

  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "learner_context_delivered",
      sessionId: input.sessionID,
      projectPath: input.directory,
      sourceKind: "learner_context",
      sourceId: input.messageID,
      searchableText: `Learner context ${input.deliveryKind} delivered for session ${input.sessionID}.`,
      payload: {
        deliveryKind: input.deliveryKind,
        fingerprint: input.fingerprint,
        itemCount: input.itemCount,
      },
    }),
  )
}

export {
  ingestFlashcardReview,
  ingestLearnerContextDelivery,
  ingestQuestionSetAttempt,
  ingestTeachingCheckpoint,
}
