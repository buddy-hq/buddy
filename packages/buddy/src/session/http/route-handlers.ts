import {
  abortSessionRun,
} from "../orchestration/abort-actions.js"
import {
  getSessionById,
  listSessionMessages,
  patchSessionById,
  proxySessionCollection,
} from "../orchestration/core-actions.js"
import {
  postSessionCommand,
  postSessionPrompt,
} from "../orchestration/interaction-actions.js"
import {
  getRuntimeInspectorState,
  getTeachingState,
} from "../../learning/runtime/session/orchestration/state-actions.js"

const listSessionsHandler = proxySessionCollection
const createSessionHandler = proxySessionCollection
const getSessionHandler = getSessionById
const updateSessionHandler = patchSessionById
const listSessionMessagesHandler = listSessionMessages
const postSessionPromptHandler = postSessionPrompt
const postSessionCommandHandler = postSessionCommand
const getTeachingStateHandler = getTeachingState
const getRuntimeInspectorHandler = getRuntimeInspectorState
const abortSessionHandler = abortSessionRun

export {
  abortSessionHandler,
  createSessionHandler,
  getRuntimeInspectorHandler,
  getSessionHandler,
  getTeachingStateHandler,
  listSessionMessagesHandler,
  listSessionsHandler,
  postSessionCommandHandler,
  postSessionPromptHandler,
  updateSessionHandler,
}
