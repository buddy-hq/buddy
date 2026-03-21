import { beforeEach, describe, expect, test } from 'bun:test'
import {
  createTextPromptDraft,
  getPromptDraft,
  getPromptScopeKey,
  PROMPT_STORE_STORAGE_KEY,
  usePromptStore,
} from '../src/state/prompt-store'

function resetPromptStore() {
  localStorage.removeItem(PROMPT_STORE_STORAGE_KEY)
  usePromptStore.setState({
    draftsByKey: {},
    historyByDirectory: {},
    historyNavigationByKey: {},
  })
}

describe('prompt store', () => {
  beforeEach(() => {
    resetPromptStore()
  })

  test('keeps drafts isolated per session key', () => {
    const store = usePromptStore.getState()
    const leftKey = getPromptScopeKey('/repo', 'left')
    const rightKey = getPromptScopeKey('/repo', 'right')

    store.replaceDraft(leftKey, createTextPromptDraft('left draft'))
    store.replaceDraft(rightKey, createTextPromptDraft('right draft'))

    expect(getPromptDraft(usePromptStore.getState(), leftKey).value).toBe('left draft')
    expect(getPromptDraft(usePromptStore.getState(), rightKey).value).toBe('right draft')
  })

  test('migrates the workspace draft into a new session when the target is empty', () => {
    const store = usePromptStore.getState()
    const workspaceKey = getPromptScopeKey('/repo')
    const sessionKey = getPromptScopeKey('/repo', 'session-1')

    store.replaceDraft(workspaceKey, createTextPromptDraft('workspace draft'))
    store.migrateWorkspaceDraft('/repo', 'session-1')

    expect(getPromptDraft(usePromptStore.getState(), workspaceKey).value).toBe('')
    expect(getPromptDraft(usePromptStore.getState(), sessionKey).value).toBe('workspace draft')
  })

  test('does not overwrite an existing session draft during workspace migration', () => {
    const store = usePromptStore.getState()
    const workspaceKey = getPromptScopeKey('/repo')
    const sessionKey = getPromptScopeKey('/repo', 'session-1')

    store.replaceDraft(workspaceKey, createTextPromptDraft('workspace draft'))
    store.replaceDraft(sessionKey, createTextPromptDraft('session draft'))
    store.migrateWorkspaceDraft('/repo', 'session-1')

    expect(getPromptDraft(usePromptStore.getState(), workspaceKey).value).toBe('workspace draft')
    expect(getPromptDraft(usePromptStore.getState(), sessionKey).value).toBe('session draft')
  })
})
