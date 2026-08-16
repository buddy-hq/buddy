import { beforeEach, describe, expect, test } from "bun:test"
import { GET_STARTED_FLOW_DEVTOOLS_MODE } from "../src/lib/get-started-chats"
import {
  GET_STARTED_FLOW_STATUS,
  resolveGetStartedFlow,
  type GetStartedFlowInput,
} from "../src/lib/get-started-flow"
import {
  GET_STARTED_FLOW_STORAGE_KEY,
  useGetStartedFlowStore,
} from "../src/state/get-started-flow-store"
import { parsePersistedStoreState } from "./parse-test-values"

const ACTIVE_LEARNER_INPUT = {
  enabled: true,
  persistedStateHydrated: true,
  personalizationResolved: true,
  primaryUse: "learn",
  currentDirectory: "/Users/buddy/Inbox",
  devtoolsMode: undefined,
} as const satisfies GetStartedFlowInput

beforeEach(() => {
  localStorage.clear()
  useGetStartedFlowStore.getState().setEnabled(true)
})

describe("get started flow rules", () => {
  test("waits for both persisted participation and personalization", () => {
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        persistedStateHydrated: false,
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.loading)
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        personalizationResolved: false,
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.loading)
  })

  test("falls back to learner prompts when onboarding has no primary use", () => {
    const flow = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      primaryUse: undefined,
    })

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(flow.isActive).toBe(true)
    expect(flow.chats.some((chat) => chat.id === "research-question")).toBe(true)
    expect(flow.chats[0]?.title).toBe("How Does an AI Agent Work?")
  })

  test("uses connected-model learner prompts when the active model has a connected provider", () => {
    const flow = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      selectedModel: "openai/gpt-5.6-sol",
    })

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(flow.chats).toHaveLength(5)
    expect(flow.chats[0]?.title).toBe("How Does Buddy Work?")
    expect(flow.chats[1]?.title).toBe("Travel Through Space")
  })

  test("becomes active independently of sessions, render callbacks, or directory", () => {
    const flow = resolveGetStartedFlow(ACTIVE_LEARNER_INPUT)

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(flow.isActive).toBe(true)
    expect(flow.chats).not.toHaveLength(0)
  })

  test("stays active in notebooks so the sidebar Get Started list can show everywhere", () => {
    const flow = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      currentDirectory: "/Users/buddy/Notebook",
    })

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(flow.isActive).toBe(true)
    expect(flow.chats).not.toHaveLength(0)
  })

  test("marks dismissal separately from directory", () => {
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        enabled: false,
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.dismissed)
  })

  test("re-enabling a dismissed flow makes it active again", () => {
    const dismissed = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      enabled: false,
    })
    const reEnabled = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      enabled: true,
    })

    expect(dismissed.status).toBe(GET_STARTED_FLOW_STATUS.dismissed)
    expect(reEnabled.status).toBe(GET_STARTED_FLOW_STATUS.active)
  })

  test("restores the onboarding prompt set after Settings re-enables a clean Buddy Dev flow", () => {
    const cleanInstalledFlow = {
      ...ACTIVE_LEARNER_INPUT,
      primaryUse: "teach",
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.appState,
    } as const satisfies GetStartedFlowInput

    const initiallyActive = resolveGetStartedFlow(cleanInstalledFlow)
    const dismissed = resolveGetStartedFlow({
      ...cleanInstalledFlow,
      enabled: false,
    })
    const reEnabled = resolveGetStartedFlow({
      ...cleanInstalledFlow,
      enabled: true,
    })

    expect(initiallyActive.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(initiallyActive.chats.some((chat) => chat.id === "standards-lesson")).toBe(true)
    expect(dismissed.status).toBe(GET_STARTED_FLOW_STATUS.dismissed)
    expect(reEnabled.status).toBe(GET_STARTED_FLOW_STATUS.active)
  })

  test("developer overrides supersede app visibility in any directory", () => {
    const appHidden = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      enabled: false,
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.appState,
    })
    const forcedHidden = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      enabled: true,
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.hidden,
    })
    const forcedTeacher = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      enabled: false,
      personalizationResolved: false,
      primaryUse: undefined,
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.teacher,
    })
    const teacherInNotebook = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      personalizationResolved: false,
      primaryUse: undefined,
      currentDirectory: "/Users/buddy/Notebook",
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.teacher,
    })
    const activeTeacher = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      personalizationResolved: false,
      primaryUse: undefined,
      devtoolsMode: GET_STARTED_FLOW_DEVTOOLS_MODE.teacher,
    })

    expect(appHidden.status).toBe(GET_STARTED_FLOW_STATUS.dismissed)
    expect(forcedHidden.status).toBe(GET_STARTED_FLOW_STATUS.overriddenHidden)
    expect(forcedTeacher.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(teacherInNotebook.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(teacherInNotebook.isActive).toBe(true)
    expect(activeTeacher.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(activeTeacher.chats.some((chat) => chat.id === "standards-lesson")).toBe(true)
  })
})

describe("get started flow participation", () => {
  test("persists Settings re-enablement across app hydration", async () => {
    const state = useGetStartedFlowStore.getState()

    state.dismiss()
    expect(useGetStartedFlowStore.getState().enabled).toBe(false)

    useGetStartedFlowStore.getState().setEnabled(true)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)

    const raw = localStorage.getItem(GET_STARTED_FLOW_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const persistedState = parsePersistedStoreState(raw)
    expect(persistedState).toEqual({ enabled: true })

    useGetStartedFlowStore.setState({ enabled: false })
    if (raw === null) throw new Error("Expected persisted get-started state.")
    localStorage.setItem(GET_STARTED_FLOW_STORAGE_KEY, raw)
    await useGetStartedFlowStore.persist.rehydrate()

    expect(useGetStartedFlowStore.getState().enabled).toBe(true)
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        enabled: useGetStartedFlowStore.getState().enabled,
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.active)
  })
})
