import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement, ReactNode } from "react"
import type { SkillPresentation } from "../src/state/skills-actions"
import { skillsCatalogQueryKeys } from "../src/state/skills-catalog-query"

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

export function seedSkillPresentations(
  queryClient: QueryClient,
  directory?: string,
  presentations: SkillPresentation[] = [],
): void {
  queryClient.setQueryData(skillsCatalogQueryKeys.presentations(directory), presentations)
}

export function TestQueryClientProvider(props: {
  queryClient: QueryClient
  children: ReactNode
}): ReactElement {
  return <QueryClientProvider client={props.queryClient}>{props.children}</QueryClientProvider>
}
