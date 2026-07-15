import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { resolveGetStartedFlow, type GetStartedFlowSnapshot } from "@/lib/get-started-flow"
import { globalConfigQueryOptions } from "./global-config-query"
import { useGetStartedFlowDevtools } from "./get-started-flow-devtools"
import { useGetStartedFlowStore, useGetStartedFlowStoreHydrated } from "./get-started-flow-store"
import { readPersonalization } from "./project-config-readers"

export type GetStartedFlow = GetStartedFlowSnapshot & {
  dismiss: () => void
}

export function useGetStartedFlow(currentDirectory: string): GetStartedFlow {
  const primaryUseQuery = useQuery({
    ...globalConfigQueryOptions(),
    select: (globalConfig) => readPersonalization(globalConfig).primaryUse,
  })
  const enabled = useGetStartedFlowStore((state) => state.enabled)
  const dismiss = useGetStartedFlowStore((state) => state.dismiss)
  const persistedStateHydrated = useGetStartedFlowStoreHydrated()
  const developerMode = useGetStartedFlowDevtools((state) => state.mode)
  const devtoolsMode = import.meta.env.DEV ? developerMode : undefined

  return useMemo(
    () => ({
      ...resolveGetStartedFlow({
        enabled,
        persistedStateHydrated,
        personalizationResolved: !primaryUseQuery.isPending,
        primaryUse: primaryUseQuery.data,
        currentDirectory,
        devtoolsMode,
      }),
      dismiss,
    }),
    [
      currentDirectory,
      dismiss,
      enabled,
      persistedStateHydrated,
      primaryUseQuery.data,
      primaryUseQuery.isPending,
      devtoolsMode,
    ],
  )
}
