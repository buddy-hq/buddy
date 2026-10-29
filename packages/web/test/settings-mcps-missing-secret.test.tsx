import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { McpsSettings } from "../src/components/settings/settings-mcps"
import { globalConfigQueryKeys } from "../src/state/global-config-query"
import { NotebookSettingsDialog } from "../src/components/layout/chat-left-sidebar/dialogs"
import { notebookSettingsQueryKeys } from "../src/state/notebook-settings-query"
import { experimentalFeaturesQueryKeys } from "../src/state/experimental-features-query"
import { mcpDirectoryQueryKeys } from "../src/state/mcp-directory-query"

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false } } })
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
})

afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

test("a notebook MCP with a missing secret opens its existing notebook edit form", async () => {
  const directory = "/test/notebook"
  queryClient.setQueryData(globalConfigQueryKeys.bundle(), {})
  queryClient.setQueryData(notebookSettingsQueryKeys.rawProjectConfig(directory), { mcp: { elsewhere: {
    type: "remote", url: "https://notebook.example.test/mcp", missingSecret: true,
    headers: { Authorization: "[REDACTED]" },
  } } })
  queryClient.setQueryData(experimentalFeaturesQueryKeys.all(), { features: [] })
  queryClient.setQueryData(mcpDirectoryQueryKeys.status(directory), {})
  await act(async () => root.render(<QueryClientProvider client={queryClient}><NotebookSettingsDialog
    open directory={directory} notebookName="Test notebook" onOpenChange={() => undefined} onOpenMcpSettings={() => undefined}
  /></QueryClientProvider>))

  expect(document.body.textContent).toContain("This server's secret was saved on another computer or in another Buddy edition. Enter it again.")
  const button = Array.from(document.querySelectorAll("button")).find((entry) => entry.textContent === "Enter secret")
  if (!button) throw new Error("Expected Enter secret button")
  await act(async () => button.click())
  const url = document.querySelector<HTMLInputElement>("#mcp-url")
  expect(url?.value).toBe("https://notebook.example.test/mcp")
})

test("a missing MCP secret shows the re-entry message and opens that server's edit form", async () => {
  queryClient.setQueryData(globalConfigQueryKeys.bundle(), { mcp: { elsewhere: {
    type: "remote", url: "https://example.test/mcp", missingSecret: true,
    headers: { Authorization: "[REDACTED]" },
  } } })
  await act(async () => root.render(<QueryClientProvider client={queryClient}><McpsSettings /></QueryClientProvider>))

  expect(container.textContent).toContain("This server's secret was saved on another computer or in another Buddy edition. Enter it again.")
  const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "Enter secret")
  if (!button) throw new Error("Expected Enter secret button")
  await act(async () => button.click())
  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain("elsewhere")
  expect(dialog?.querySelector<HTMLInputElement>("#mcp-url")?.value).toBe("https://example.test/mcp")
})
