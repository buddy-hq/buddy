import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SkillsPage } from "../src/components/skills/skills-page"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { ServerProvider } from "../src/context/server"
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

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitForAssertion(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now()
  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error
      }
      await flushEffects()
    }
  }
}

describe("SkillsPage external vendor roots toggle", () => {
  let container: HTMLDivElement
  let queryClient: QueryClient
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    queryClient.clear()
    globalThis.fetch = originalFetch
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("loads initial toggle state and forces refresh after updating settings", async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = []

    const initialCatalog = {
      directory: "/repo",
      managedRoot: "/home/test/.buddy/skills",
      externalVendorRootsEnabled: false,
      installed: [],
      library: [],
    }
    const refreshedCatalog = {
      directory: "/repo",
      managedRoot: "/home/test/.buddy/skills",
      externalVendorRootsEnabled: true,
      installed: [
        {
          name: "local-review",
          description: "Workspace-local review workflow.",
          location: "/repo/.agents/skills/local-review/SKILL.md",
          directory: "/repo/.agents/skills/local-review",
          content: "Use the local review workflow.",
          enabled: true,
          permissionAction: "ask",
          permissionSource: "default",
          source: "external",
          scope: "workspace",
          managed: false,
          removable: false,
        },
      ],
      library: [],
    }

    globalThis.fetch = createFetchStub(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      requests.push({
        url,
        method,
        ...(body !== undefined ? { body } : {}),
      })

      if (url === "/api/skills" && method === "GET") {
        return jsonResponse(initialCatalog)
      }

      if (url === "/api/skills/settings" && method === "PATCH") {
        return jsonResponse({
          ok: true,
          externalVendorRootsEnabled: true,
        })
      }

      if (url === "/api/skills?refresh=1" && method === "GET") {
        return jsonResponse(refreshedCatalog)
      }

      throw new Error(`Unexpected request ${method} ${url}`)
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PlatformProvider value={createBrowserPlatform()}>
            <ServerProvider
              value={{
                url: "",
                username: null,
                password: null,
                isSidecar: false,
              }}
            >
              <SkillsPage directory="/repo" />
            </ServerProvider>
          </PlatformProvider>
        </QueryClientProvider>,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(
        requests.some((request) => request.url === "/api/skills" && request.method === "GET"),
      ).toBe(true)
      const toggle = container.querySelector('[aria-label="Discover external vendor roots"]')
      expect(toggle).not.toBeNull()
      expect(toggle?.getAttribute("aria-checked")).toBe("false")
    })

    const toggle = container.querySelector('[aria-label="Discover external vendor roots"]')
    if (!(toggle instanceof HTMLElement)) {
      throw new Error("External vendor roots toggle is missing")
    }

    await act(async () => {
      toggle.click()
      await flushEffects()
      await flushEffects()
    })

    await waitForAssertion(() => {
      const settingsPatch = requests.find(
        (request) => request.url === "/api/skills/settings" && request.method === "PATCH",
      )
      expect(settingsPatch).toBeDefined()
      expect(settingsPatch?.body).toEqual({
        externalVendorRootsEnabled: true,
      })
      expect(
        requests.some(
          (request) => request.url === "/api/skills?refresh=1" && request.method === "GET",
        ),
      ).toBe(true)
      const nextToggle = container.querySelector('[aria-label="Discover external vendor roots"]')
      expect(nextToggle?.getAttribute("aria-checked")).toBe("true")
      expect(container.textContent?.includes("local-review")).toBe(true)
    })
  })
})
