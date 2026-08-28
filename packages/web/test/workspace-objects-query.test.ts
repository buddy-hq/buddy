import { afterEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  loadWorkspaceObjects,
  objectMediaAvailabilityQueryOptions,
  objectMermaidPayloadQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectViewQueryOptions,
  refetchActiveWorkspaceObjectQueries,
  workspaceObjectsQueryKeys,
  workspaceObjectsQueryOptions,
} from "../src/state/workspace-objects-query"
import { parseRequestUrl } from "./parse-test-values"

const originalFetch = globalThis.fetch

describe("workspace object query", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("uses kind-scoped query keys for unified object index queries", () => {
    expect(workspaceObjectsQueryKeys.kind("/repo", "figure")).toEqual([
      "workspace-objects",
      "/repo",
      "figure",
    ])
    const queryKey: readonly unknown[] = workspaceObjectsQueryOptions("/repo", "figure").queryKey
    expect(queryKey).toEqual(["workspace-objects", "/repo", "figure"])
  })

  test("uses shared query keys for object Bench view data", () => {
    const objectViewQueryKey: readonly unknown[] = objectViewQueryOptions({
      directory: "/repo",
      kind: "mermaid",
      objectID: "object_1",
      viewID: "rendered",
      revisionID: "revision_1",
    }).queryKey
    expect(objectViewQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "view",
      "mermaid",
      "object_1",
      "rendered",
      "revision_1",
      null,
    ])

    const questionSetPayloadQueryKey: readonly unknown[] = objectQuestionSetPayloadQueryOptions({
      directory: "/repo",
      objectID: "object_2",
    }).queryKey
    expect(questionSetPayloadQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "question-set-payload",
      "object_2",
    ])

    const mermaidPayloadQueryKey: readonly unknown[] = objectMermaidPayloadQueryOptions({
      directory: "/repo",
      objectID: "object_3",
    }).queryKey
    expect(mermaidPayloadQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "mermaid-payload",
      "object_3",
    ])

    const mediaAvailabilityQueryKey: readonly unknown[] = objectMediaAvailabilityQueryOptions({
      directory: "/repo",
      objectID: "object_4",
      itemID: "item_1",
    }).queryKey
    expect(mediaAvailabilityQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "media-availability",
      "object_4",
      "item_1",
    ])
  })

  test("refetches only mounted workspace object queries after reconnect", async () => {
    const queryClient = new QueryClient()
    const activeKey = workspaceObjectsQueryKeys.view({
      directory: "/repo",
      kind: "figure",
      objectID: "active",
      viewID: "rendered",
    })
    const inactiveKey = workspaceObjectsQueryKeys.view({
      directory: "/repo",
      kind: "figure",
      objectID: "inactive",
      viewID: "rendered",
    })
    let activeLoads = 0
    let inactiveLoads = 0
    const activeQuery = {
      queryKey: activeKey,
      queryFn: () => Promise.resolve(++activeLoads),
      staleTime: Number.POSITIVE_INFINITY,
    }
    const inactiveQuery = {
      queryKey: inactiveKey,
      queryFn: () => Promise.resolve(++inactiveLoads),
      staleTime: Number.POSITIVE_INFINITY,
    }

    await queryClient.fetchQuery(activeQuery)
    await queryClient.fetchQuery(inactiveQuery)
    const observer = new QueryObserver(queryClient, activeQuery)
    const unsubscribe = observer.subscribe(() => undefined)

    await refetchActiveWorkspaceObjectQueries(queryClient, "/repo")

    expect(activeLoads).toBe(2)
    expect(inactiveLoads).toBe(1)
    unsubscribe()
    queryClient.clear()
  })

  test("loads the unified object index through the generated SDK", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        calls.push(`${method} ${url}`)

        if (
          method === "GET" &&
          url.includes("/api/objects") &&
          url.includes("directory=%2Frepo") &&
          url.includes("kind=figure")
        ) {
          return Response.json({
            objects: [],
            loadErrors: [],
          })
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const result = await loadWorkspaceObjects("/repo", "figure")

    expect(result).toEqual({ objects: [], loadErrors: [] })
    expect(calls.length).toBe(1)
  })
})
