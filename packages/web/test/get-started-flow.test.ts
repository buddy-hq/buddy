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
    expect(flow.chats.some((chat) => chat.id === "practice-set")).toBe(true)
  })

  test("becomes active in the Inbox independently of sessions or render callbacks", () => {
    const flow = resolveGetStartedFlow(ACTIVE_LEARNER_INPUT)

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
    expect(flow.isActive).toBe(true)
    expect(flow.chats).not.toHaveLength(0)
  })

  test("supports Windows Inbox paths", () => {
    const flow = resolveGetStartedFlow({
      ...ACTIVE_LEARNER_INPUT,
      currentDirectory: "C:\\Users\\Buddy\\inbox\\",
    })

    expect(flow.status).toBe(GET_STARTED_FLOW_STATUS.active)
  })

  test("distinguishes dismissal from being outside the Inbox", () => {
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        enabled: false,
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.dismissed)
    expect(
      resolveGetStartedFlow({
        ...ACTIVE_LEARNER_INPUT,
        currentDirectory: "/Users/buddy/Notebook",
      }).status,
    ).toBe(GET_STARTED_FLOW_STATUS.outOfScope)
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

  test("developer overrides supersede app visibility without changing Inbox scope", () => {
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
    const teacherOutsideInbox = resolveGetStartedFlow({
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
    expect(teacherOutsideInbox.status).toBe(GET_STARTED_FLOW_STATUS.outOfScope)
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
    const persisted = JSON.parse(raw as string) as { state: Record<string, unknown> }
    expect(persisted.state).toEqual({ enabled: true })

    useGetStartedFlowStore.setState({ enabled: false })
    localStorage.setItem(GET_STARTED_FLOW_STORAGE_KEY, raw as string)
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
