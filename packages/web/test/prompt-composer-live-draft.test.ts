import { afterEach, describe, expect, test } from "bun:test"
import { quoteMessageIntoPromptDraft } from "../src/features/notes/quote-message-into-prompt-draft"
import {
  registerPromptComposerLiveDraftReader,
  resetPromptComposerLiveDraftReadersForTests,
} from "../src/components/prompt/prompt-composer-live-draft"
import { SELECTION_CONTEXT_PART_TYPE } from "../src/components/prompt/prompt-types"
import {
  createTextPromptDraft,
  getPromptDraft,
  getPromptScopeKey,
  usePromptStore,
} from "../src/state/prompt-store"

const DIRECTORY = "/repo"
const SESSION_ID = "session-1"
const PROMPT_KEY = getPromptScopeKey(DIRECTORY, SESSION_ID)
const LIVE_DRAFT_TEXT = "typed after the last store sync"
const QUOTED_TEXT = "quoted message"

function resetPromptStore() {
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
}

afterEach(() => {
  resetPromptComposerLiveDraftReadersForTests()
  resetPromptStore()
})

describe("PromptComposer live draft quoting", () => {
  test("quotes against the live composer draft instead of a stale store snapshot", () => {
    const store = usePromptStore.getState()
    store.replaceDraft(PROMPT_KEY, createTextPromptDraft("stale store draft"))
    registerPromptComposerLiveDraftReader(PROMPT_KEY, () => createTextPromptDraft(LIVE_DRAFT_TEXT))

    quoteMessageIntoPromptDraft({
      directory: DIRECTORY,
      sessionID: SESSION_ID,
      messageID: "msg_1",
      text: QUOTED_TEXT,
      replaceDraft: store.replaceDraft,
    })

    const draft = getPromptDraft(usePromptStore.getState(), PROMPT_KEY)
    expect(draft.value).toContain(LIVE_DRAFT_TEXT)
    expect(draft.value).not.toContain("stale store draft")
    expect(draft.parts).toEqual([
      { type: "text", text: LIVE_DRAFT_TEXT },
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "message",
        text: QUOTED_TEXT,
        selectionKey: "message_msg_1",
        quotedMessageID: "msg_1",
      },
    ])
  })

  test("replaces the existing quote while preserving the current live text", () => {
    const store = usePromptStore.getState()
    registerPromptComposerLiveDraftReader(PROMPT_KEY, () => ({
      ...createTextPromptDraft(LIVE_DRAFT_TEXT),
      parts: [
        { type: "text", text: LIVE_DRAFT_TEXT },
        {
          type: SELECTION_CONTEXT_PART_TYPE,
          source: "message",
          text: "old quote",
          selectionKey: "message_old",
          quotedMessageID: "old",
        },
      ],
    }))

    quoteMessageIntoPromptDraft({
      directory: DIRECTORY,
      sessionID: SESSION_ID,
      messageID: "msg_1",
      text: QUOTED_TEXT,
      replaceDraft: store.replaceDraft,
    })

    const draft = getPromptDraft(usePromptStore.getState(), PROMPT_KEY)
    expect(draft.parts.filter((part) => part.type === SELECTION_CONTEXT_PART_TYPE)).toEqual([
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "message",
        text: QUOTED_TEXT,
        selectionKey: "message_msg_1",
        quotedMessageID: "msg_1",
      },
    ])
  })
})
