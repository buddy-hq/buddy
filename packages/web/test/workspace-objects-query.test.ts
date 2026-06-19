import { afterEach, describe, expect, mock, test } from "bun:test"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  loadWorkspaceObjects,
  objectMediaAvailabilityQueryOptions,
  objectMermaidPayloadQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectViewQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceObjectsQueryOptions,
} from "../src/state/workspace-objects-query"

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
    expect(queryKey).toEqual([
      "workspace-objects",
      "/repo",
      "figure",
    ])
  })

  test("uses shared query keys for object Bench view data", () => {
    const objectViewQueryKey: readonly unknown[] =
      objectViewQueryOptions({
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

    const questionSetPayloadQueryKey: readonly unknown[] =
      objectQuestionSetPayloadQueryOptions({
        directory: "/repo",
        objectID: "object_2",
      }).queryKey
    expect(questionSetPayloadQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "question-set-payload",
      "object_2",
    ])

    const mermaidPayloadQueryKey: readonly unknown[] =
      objectMermaidPayloadQueryOptions({
        directory: "/repo",
        objectID: "object_3",
      }).queryKey
    expect(mermaidPayloadQueryKey).toEqual([
      "workspace-objects",
      "/repo",
      "mermaid-payload",
      "object_3",
    ])

    const mediaAvailabilityQueryKey: readonly unknown[] =
      objectMediaAvailabilityQueryOptions({
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

  test("loads the unified object index through the generated SDK", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
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
    }), originalFetch)

    const result = await loadWorkspaceObjects("/repo", "figure")

    expect(result).toEqual({ objects: [], loadErrors: [] })
    expect(calls.length).toBe(1)
  })
})
