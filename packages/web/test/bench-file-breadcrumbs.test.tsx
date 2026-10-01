import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchFileView } from "../src/components/bench/bench-file-view"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import type { RightWorkspaceOpenOutcome } from "../src/components/directory-chat/right-workspace-open"

const originalFetch = globalThis.fetch

function menuItem(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (entry) => entry.textContent === label,
  )
  if (!item) throw new Error(`Missing menu item: ${label}; ${document.body.textContent}`)
  return item
}

async function settle() {
  // React Query batches observer notifications onto the next task.
  await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

describe("Bench file breadcrumbs", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient
  let requests: string[]
  let opened: string[]
  let outcome: RightWorkspaceOpenOutcome
  let fail: boolean

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    requests = []
    opened = []
    outcome = "opened"
    fail = false
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
      const path = url.searchParams.get("path") ?? ""
      requests.push(path)
      if (fail) return Response.json({ message: "Folder listing unavailable" }, { status: 503 })
      const children =
        path === ""
          ? [
              { name: "src", path: "src", type: "directory" },
              { name: "README.md", path: "README.md", type: "file" },
            ]
          : [{ name: "main.ts", path: "src/main.ts", type: "file" }]
      return Response.json(
        children.map((entry) => ({
          name: entry.name,
          path: entry.path,
          type: entry.type,
          absolute: `/fixture/${entry.path}`,
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

  async function render(directory = "/fixture", path = "src/main.ts", active = true) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <BenchFileView
            directory={directory}
            path={path}
            active={active}
            drawer={null}
            initialTreeOpen={false}
            onOpenFile={async (file) => {
              opened.push(file)
              return outcome
            }}
          >
            <div>Preview</div>
          </BenchFileView>
        </QueryClientProvider>,
      )
    })
  }

  async function browse(label: string) {
    const trigger = container.querySelector<HTMLButtonElement>(
      `button[aria-label="Browse ${label}"]`,
    )
    if (!trigger) throw new Error(`Missing folder crumb: ${label}`)
    await act(async () =>
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    )
    await settle()
  }

  test("normalizes Windows notebook paths and marks only the filename current", async () => {
    await render("C:\\workspace\\notebook\\", "c:\\workspace\\notebook\\src\\main.ts")
    const nav = container.querySelector('nav[aria-label="File path"]')
    expect(nav?.textContent).toBe("notebooksrcmain.ts")
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe("main.ts")
    expect(requests).toEqual([])
  })

  test("loads folders only on opening, browses down and back, and retains blocked opens", async () => {
    await render()
    expect(requests).toEqual([])
    await browse("fixture")
    expect(menuItem("src")).toBeDefined()
    await act(async () => menuItem("src").click())
    await settle()
    expect(menuItem("main.ts").getAttribute("aria-current")).toBe("page")
    await act(async () => menuItem("Back to fixture").click())
    await settle()
    expect(menuItem("README.md")).toBeDefined()
    outcome = "blocked"
    await act(async () => menuItem("README.md").click())
    expect(opened).toEqual(["README.md"])
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    outcome = "opened"
    await act(async () => menuItem("README.md").click())
    expect(opened).toEqual(["README.md", "README.md"])
    expect(document.querySelector('[role="menu"]')).toBeNull()
  })

  test("dismisses folder menus when the mounted Files view becomes inactive", async () => {
    await render()
    await browse("fixture")
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    await render("/fixture", "src/main.ts", false)
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(container.textContent).toContain("Preview")
  })

  test("failed listing offers a retry in the same folder", async () => {
    fail = true
    await render()
    await browse("src")
    expect(menuItem("Retry loading folder")).toBeDefined()
    fail = false
    await act(async () => menuItem("Retry loading folder").click())
    await settle()
    expect(menuItem("main.ts")).toBeDefined()
    expect(requests).toEqual(["src", "src"])
  })
})
