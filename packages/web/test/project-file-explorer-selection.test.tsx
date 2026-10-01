import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ProjectFileExplorerPanel } from "../src/components/project-explorer/project-file-explorer-panel"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { withFetchPreconnect } from "../src/lib/fetch-transport"

const originalFetch = globalThis.fetch
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

describe("Project file explorer selection", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient
  let listed: string[]
  let revealed: Element[]
  let separator: "/" | "\\"

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    listed = []
    revealed = []
    separator = "/"
    HTMLElement.prototype.scrollIntoView = function () {
      revealed.push(this)
    }
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
      const path = url.searchParams.get("path") ?? ""
      listed.push(path)
      const name = path === "" ? "src" : path === `src${separator}` ? "deep" : "file.ts"
      const file = path === `src${separator}deep${separator}`
      const childPath = `${path}${name}${file ? "" : separator}`
      return Response.json([
        {
          name,
          path: childPath,
          absolute: `/fixture/${childPath}`,
          type: file ? "file" : "directory",
          ignored: false,
        },
      ])
    }, originalFetch)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
    globalThis.fetch = originalFetch
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("opens selected file ancestors and reveals the row", async () => {
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={client}>
            <ProjectFileExplorerPanel directory="/fixture" selectedPath="src/deep/file.ts" />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    for (let attempt = 0; attempt < 10 && revealed.length === 0; attempt += 1) {
      await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    }

    expect(listed).toContain("")
    expect(listed).toContain("src/")
    expect(listed).toContain("src/deep/")
    const selected = container.querySelector<HTMLButtonElement>('[aria-current="page"]')
    if (!selected) throw new Error("Selected file row was not rendered")
    expect(selected.textContent).toContain("file.ts")
    expect(revealed).toContain(selected)
  })

  test("uses the returned Windows directory paths and reveals a selected file", async () => {
    separator = "\\"
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={client}>
            <ProjectFileExplorerPanel directory="C:\\fixture" selectedPath="src/deep/file.ts" />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    for (let attempt = 0; attempt < 10 && revealed.length === 0; attempt += 1) {
      await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    }

    expect(listed).toContain("src\\")
    expect(listed).toContain("src\\deep\\")
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("file.ts")
    expect(revealed).toHaveLength(1)
  })
})
