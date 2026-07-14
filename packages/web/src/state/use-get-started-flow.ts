import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { resolveGetStartedFlow, type GetStartedFlowSnapshot } from "@/lib/get-started-flow"
import { globalConfigQueryOptions } from "./global-config-query"
import { useGetStartedChatTestMode } from "./get-started-chat-test-mode"
import { useGetStartedFlowStore, useGetStartedFlowStoreHydrated } from "./get-started-flow-store"
import { readPersonalization } from "./project-config-readers"

export type GetStartedFlow = GetStartedFlowSnapshot & {
  setEnabled: (enabled: boolean) => void
  dismiss: () => void
}

export function useGetStartedFlow(currentDirectory: string): GetStartedFlow {
  const primaryUseQuery = useQuery({
    ...globalConfigQueryOptions(),
    select: (globalConfig) => readPersonalization(globalConfig).primaryUse,
  })
  const enabled = useGetStartedFlowStore((state) => state.enabled)
  const setEnabled = useGetStartedFlowStore((state) => state.setEnabled)
  const dismiss = useGetStartedFlowStore((state) => state.dismiss)
  const persistedStateHydrated = useGetStartedFlowStoreHydrated()
  const developerTestMode = useGetStartedChatTestMode((state) => state.mode)
  const testMode = import.meta.env.DEV ? developerTestMode : undefined

  return useMemo(
    () => ({
      ...resolveGetStartedFlow({
        enabled,
        persistedStateHydrated,
        personalizationResolved: !primaryUseQuery.isPending,
        primaryUse: primaryUseQuery.data,
        currentDirectory,
        testMode,
      }),
      setEnabled,
      dismiss,
    }),
    [
      currentDirectory,
      dismiss,
      enabled,
      persistedStateHydrated,
      primaryUseQuery.data,
      primaryUseQuery.isPending,
      setEnabled,
      testMode,
    ],
  )
}
