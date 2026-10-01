import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ProjectFileExplorerPanel } from "../src/components/project-explorer/project-file-explorer-panel"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { withFetchPreconnect } from "../src/lib/fetch-transport"

const originalFetch = globalThis.fetch
const REFRESH_LABEL = "Refresh files"

async function settle(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  }
}

async function until(ready: () => boolean, description: string) {
  const deadline = performance.now() + 2_000
  while (!ready()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`)
    await settle(1)
  }
}

describe("Project file explorer search", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient
  let files: string[]
  let indexRequests: number

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    files = ["alpha.md", "alphabet.md"]
    indexRequests = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
      if (url.pathname.endsWith("/find/notebook-file-index")) {
        indexRequests += 1
        return Response.json({ paths: files, partial: false })
      }
      return Response.json(
        files.map((name) => ({
          name,
          path: name,
          absolute: `/fixture/${name}`,
          type: "file",
          ignored: false,
        })),
      )
    }, originalFetch)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function render(searchValue: string) {
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={client}>
            <ProjectFileExplorerPanel directory="/fixture" searchValue={searchValue} />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
  }

  // Search rows show the file name over its path, so the last line names the row.
  function searchResultPaths() {
    return [...container.querySelectorAll("button")]
      .filter((button) => button.getAttribute("aria-label") !== REFRESH_LABEL)
      .map((button) => button.lastElementChild?.lastElementChild?.textContent)
  }

  test("drops files deleted from a loaded folder once the tree is refreshed", async () => {
    await render("")
    await until(() => container.textContent?.includes("alpha.md") === true, "the root listing")

    await render("alpha")
    await until(() => searchResultPaths().length === 2, "both matches")
    expect(searchResultPaths()).toEqual(["alpha.md", "alphabet.md"])

    files = ["alphabet.md"]
    const refresh = container.querySelector<HTMLButtonElement>(`[aria-label="${REFRESH_LABEL}"]`)
    if (!refresh) throw new Error("Refresh button was not rendered")
    await act(async () => refresh.click())
    await until(() => searchResultPaths().length === 1, "the deleted file to leave the results")
    expect(searchResultPaths()).toEqual(["alphabet.md"])
  })

  test("loads the notebook file index only once the filter has text", async () => {
    await render("")
    await until(() => container.textContent?.includes("alpha.md") === true, "the root listing")
    await settle()
    expect(indexRequests).toBe(0)

    await render("a")
    await until(() => indexRequests > 0, "the index request")
    await settle()
    expect(indexRequests).toBe(1)
  })
})
