import { afterEach, describe, expect, test } from "bun:test"
import {
  installStandardsRuntime,
  loadStandardsRuntimeStatus,
  removeStandardsRuntime,
} from "../src/state/standards-runtime"
import { createFetchStub } from "./test-utils"

const originalFetch = globalThis.fetch

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

function matchesPath(input: string, pathname: string) {
  return input === pathname || input === `http://localhost${pathname}`
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("standards runtime state", () => {
  test("uses the standards runtime lifecycle endpoints", async () => {
    const requests: Array<{ url: string; method: string }> = []

    globalThis.fetch = createFetchStub(async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
      })

      if (matchesPath(String(input), "/api/local-runtimes/standards")) {
        return jsonResponse({
          enabled: false,
          state: "not_installed",
          ready: false,
        })
      }

      if (
        matchesPath(String(input), "/api/local-runtimes/standards/install") &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          enabled: true,
          state: "ready",
          ready: true,
          installedDatasetVersion: "v1.7.0",
        })
      }

      if (
        matchesPath(String(input), "/api/local-runtimes/standards/install") &&
        init?.method === "DELETE"
      ) {
        return jsonResponse({
          enabled: false,
          state: "not_installed",
          ready: false,
        })
      }

      throw new Error(`Unexpected request ${init?.method ?? "GET"} ${String(input)}`)
    })

    await expect(loadStandardsRuntimeStatus()).resolves.toMatchObject({
      state: "not_installed",
      ready: false,
    })
    await expect(installStandardsRuntime()).resolves.toMatchObject({
      state: "ready",
      ready: true,
    })
    await expect(removeStandardsRuntime()).resolves.toMatchObject({
      state: "not_installed",
      ready: false,
    })

    expect(requests.map((request) => request.method)).toEqual(["GET", "POST", "DELETE"])
    expect(
      requests.every(
        (request) =>
          request.url.endsWith("/api/local-runtimes/standards") ||
          request.url.endsWith("/api/local-runtimes/standards/install"),
      ),
    ).toBe(true)
  })

  test("surfaces backend error messages", async () => {
    globalThis.fetch = createFetchStub(async () =>
      jsonResponse(
        {
          error: "install failed",
        },
        500,
      ),
    )

    await expect(installStandardsRuntime()).rejects.toThrow("install failed")
  })
})
