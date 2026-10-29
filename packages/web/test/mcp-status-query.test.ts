import { describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import type { McpStatusMap } from "../src/state/chat-types"

const responses: McpStatusMap[] = [
  { slow: { status: "pending" }, ready: { status: "connected" } },
  { slow: { status: "pending" }, ready: { status: "connected" } },
  { slow: { status: "failed", error: "Handshake failed" }, ready: { status: "connected" } },
]
let requests = 0

mock.module("../src/state/chat-actions", () => ({
  loadMcpStatus: async () => responses[Math.min(requests++, responses.length - 1)],
  loadProjectConfig: async () => ({}),
}))

const [{ mcpStatusQueryOptions }, { STATUS_LABELS, getMcpStatusLabel, mcpIsPending }, { language }] = await Promise.all([
  import("../src/state/mcp-directory-query"),
  import("../src/components/mcp-dialog/mcp-config-schema"),
  import("../src/context/language"),
])

describe("MCP pending status", () => {
  test("labels every status including a server whose startup is still pending", () => {
    expect(getMcpStatusLabel("pending")).toBe(language.t("mcp.listPanel.connecting"))
    expect(Object.values(STATUS_LABELS).every((label) => label.length > 0)).toBe(true)
    expect(mcpIsPending({ status: "pending" })).toBe(true)
    expect(mcpIsPending({ status: "connected" })).toBe(false)
  })

  test("refetches while any server is pending and stops once startup settles without user action", async () => {
    const queryClient = new QueryClient()
    const observer = new QueryObserver(queryClient, mcpStatusQueryOptions("/workspace/mcp-pending"))
    const seen: string[] = []
    const settled = Promise.withResolvers<void>()
    const timeout = setTimeout(() => settled.reject(new Error("MCP status did not settle")), 5_000)
    const unsubscribe = observer.subscribe((result) => {
      const status = result.data?.slow?.status
      if (status && seen.at(-1) !== status) seen.push(status)
      if (status === "failed") settled.resolve()
    })
    try {
      await settled.promise
      expect(seen).toEqual(["pending", "failed"])
      expect(requests).toBe(3)
      await Bun.sleep(1_500)
      expect(requests).toBe(3)
    } finally {
      clearTimeout(timeout)
      unsubscribe()
      observer.destroy()
      queryClient.clear()
    }
  })
})
