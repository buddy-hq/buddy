import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WorkspaceMermaidPanel } from "../src/components/layout/workspace-mermaid-panel"
import { workspaceArtifactsQueryKeys } from "../src/state/workspace-artifacts-query"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("WorkspaceMermaidPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    queryClient.clear()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("shows the empty state when no persisted diagrams exist", async () => {
    const directory = "/repo"
    queryClient.setQueryData(workspaceArtifactsQueryKeys.mermaid(directory), {
      artifacts: [],
      loadErrors: [],
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceMermaidPanel directory={directory} />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("No Diagrams Yet")
  })

  test("renders Mermaid load errors instead of the empty state", async () => {
    const directory = "/repo"
    queryClient.setQueryData(workspaceArtifactsQueryKeys.mermaid(directory), {
      artifacts: [],
      loadErrors: [
        {
          artifactID: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          kind: "mermaid",
          message: "Artifact could not be loaded.",
        },
      ],
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceMermaidPanel directory={directory} />
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).not.toContain("No Diagrams Yet")
    expect(container.textContent).toContain("Artifact could not be loaded.")
  })
})
