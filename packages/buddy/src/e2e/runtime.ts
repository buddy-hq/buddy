type E2EInteractionType = "prompt" | "command"

type E2EFaultState = {
  failNextPromptMessage?: string
  failNextCommandMessage?: string
}

type E2ECounters = {
  promptCalls: number
  commandCalls: number
}

type E2EProviderState = {
  openAIConnected: boolean
}

type E2EMcpStatus = "connected" | "disabled" | "failed" | "needs_auth"
type E2EMcpState = Record<string, Record<string, E2EMcpStatus>>

type E2EProviderPatchState = {
  openAIConnected?: boolean
}

type E2ERuntimeState = {
  faults: E2EFaultState
  counters: E2ECounters
  providers: E2EProviderState
  mcp: E2EMcpState
}

const runtimeState: E2ERuntimeState = {
  faults: {},
  counters: {
    promptCalls: 0,
    commandCalls: 0,
  },
  providers: {
    openAIConnected: false,
  },
  mcp: {},
}

function clearFault(input: E2EFaultState, key: keyof E2EFaultState) {
  if (!(key in input)) return
  delete input[key]
}

export function isE2EModeEnabled() {
  return process.env.BUDDY_E2E_MODE === "1"
}

export function resetE2ERuntimeState() {
  runtimeState.counters.promptCalls = 0
  runtimeState.counters.commandCalls = 0
  runtimeState.faults = {}
  runtimeState.providers = {
    openAIConnected: false,
  }
  runtimeState.mcp = {}
}

export function setE2EFaultState(next: E2EFaultState) {
  if ("failNextPromptMessage" in next) {
    if (next.failNextPromptMessage) {
      runtimeState.faults.failNextPromptMessage = next.failNextPromptMessage
    } else {
      clearFault(runtimeState.faults, "failNextPromptMessage")
    }
  }

  if ("failNextCommandMessage" in next) {
    if (next.failNextCommandMessage) {
      runtimeState.faults.failNextCommandMessage = next.failNextCommandMessage
    } else {
      clearFault(runtimeState.faults, "failNextCommandMessage")
    }
  }
}

export function getE2ERuntimeState() {
  return {
    faults: { ...runtimeState.faults },
    counters: { ...runtimeState.counters },
    providers: { ...runtimeState.providers },
    mcp: Object.fromEntries(
      Object.entries(runtimeState.mcp).map(([directory, statusByName]) => [
        directory,
        { ...statusByName },
      ]),
    ),
  }
}

export function setE2EProviderState(next: E2EProviderPatchState) {
  if (typeof next.openAIConnected === "boolean") {
    runtimeState.providers.openAIConnected = next.openAIConnected
  }
}

export function registerE2EInteraction(type: E2EInteractionType): string | undefined {
  if (!isE2EModeEnabled()) return undefined

  if (type === "prompt") {
    runtimeState.counters.promptCalls += 1
    const nextMessage = runtimeState.faults.failNextPromptMessage
    clearFault(runtimeState.faults, "failNextPromptMessage")
    return nextMessage
  }

  runtimeState.counters.commandCalls += 1
  const nextMessage = runtimeState.faults.failNextCommandMessage
  clearFault(runtimeState.faults, "failNextCommandMessage")
  return nextMessage
}

export function setE2EMcpStatus(directory: string, name: string, status: E2EMcpStatus) {
  runtimeState.mcp[directory] = {
    ...runtimeState.mcp[directory],
    [name]: status,
  }
}
