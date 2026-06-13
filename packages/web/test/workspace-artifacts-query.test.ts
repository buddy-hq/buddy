import { afterEach, describe, expect, mock, test } from "bun:test"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  loadWorkspaceArtifacts,
  workspaceArtifactsQueryKeys,
  workspaceArtifactsQueryOptions,
} from "../src/state/workspace-artifacts-query"

const originalFetch = globalThis.fetch

describe("workspace artifact query", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("uses kind-scoped query keys for unified artifact index queries", () => {
    expect(workspaceArtifactsQueryKeys.kind("/repo", "figure")).toEqual([
      "workspace-artifacts",
      "/repo",
      "figure",
    ])
    const queryKey: readonly unknown[] = workspaceArtifactsQueryOptions("/repo", "figure").queryKey
    expect(queryKey).toEqual([
      "workspace-artifacts",
      "/repo",
      "figure",
    ])
  })

  test("loads the unified artifact index through the generated SDK", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")
      calls.push(`${method} ${url}`)

      if (
        method === "GET" &&
        url.includes("/api/artifacts") &&
        url.includes("directory=%2Frepo") &&
        url.includes("kind=figure")
      ) {
        return Response.json({
          artifacts: [],
          loadErrors: [],
        })
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`)
    }), originalFetch)

    const result = await loadWorkspaceArtifacts("/repo", "figure")

    expect(result).toEqual({ artifacts: [], loadErrors: [] })
    expect(calls.length).toBe(1)
  })
})
