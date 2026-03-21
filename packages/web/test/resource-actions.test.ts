import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  addResource,
  loadResources,
  rebuildResource,
  removeResource,
  renameResource,
} from "../src/state/resource-actions"

const originalFetch = globalThis.fetch

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("resource actions", () => {
  test("loads the resource registry from the resource endpoint", async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe("/api/resource")
      expect(init?.method).toBe("GET")
      expect(new Headers(init?.headers).get("x-buddy-directory")).toBe("/repo")
      return new Response(
        JSON.stringify({
          resources: [
            {
              id: "resource-1",
              alias: "book",
              sourceRelpath: "resources/book/book.pdf",
              format: "pdf",
              status: "ready",
              warnings: [],
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    }) as typeof fetch

    await expect(loadResources("/repo")).resolves.toEqual([
      {
        id: "resource-1",
        alias: "book",
        sourceRelpath: "resources/book/book.pdf",
        format: "pdf",
        status: "ready",
        warnings: [],
      },
    ])
  })

  test("posts resource mutations to their dedicated endpoints", async () => {
    const requests: Array<{ url: string; method?: string; body?: string | undefined }> = []

    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined,
      })
      return new Response(
        JSON.stringify({
          id: "resource-1",
          alias: "book",
          sourceRelpath: "resources/book/book.pdf",
          format: "pdf",
          status: "ready",
          warnings: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      )
    }) as typeof fetch

    await addResource("/repo", { sourcePath: "/Users/me/Downloads/book.pdf", alias: "book" })
    await renameResource("/repo", { resourceKey: "resource-1", alias: "book-2" })
    await rebuildResource("/repo", { resourceKey: "resource-1" })
    await removeResource("/repo", { resourceKey: "resource-1" })

    expect(requests).toEqual([
      {
        url: "/api/resource",
        method: "POST",
        body: JSON.stringify({
          sourcePath: "/Users/me/Downloads/book.pdf",
          alias: "book",
        }),
      },
      {
        url: "/api/resource/resource-1",
        method: "PATCH",
        body: JSON.stringify({
          alias: "book-2",
        }),
      },
      {
        url: "/api/resource/resource-1/rebuild",
        method: "POST",
        body: "",
      },
      {
        url: "/api/resource/resource-1",
        method: "DELETE",
        body: "",
      },
    ])
  })
})
