import { describe, expect, test } from "bun:test"
import { isTestNetworkUrlAllowed } from "./test-network"

describe("test network guard", () => {
  test("allows loopback HTTP servers and non-network protocols", () => {
    expect(isTestNetworkUrlAllowed("http://localhost:3000/health")).toBe(true)
    expect(isTestNetworkUrlAllowed("https://127.0.0.1:8443/health")).toBe(true)
    expect(isTestNetworkUrlAllowed("http://[::1]:3000/health")).toBe(true)
    expect(isTestNetworkUrlAllowed("data:text/plain,test")).toBe(true)
  })

  test("blocks external HTTP fetches before they reach the network", async () => {
    const externalUrl = "https://example.invalid/should-not-run"

    expect(isTestNetworkUrlAllowed(externalUrl)).toBe(false)
    await expect(fetch(externalUrl)).rejects.toThrow("Live network fetch blocked during tests")
  })

  test("blocks redirects to hosts outside the allow-list before they receive a request", async () => {
    let requests = 0
    const serverB = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        requests += 1
        return new Response("redirect destination")
      },
    })
    const blockedUrl = new URL(serverB.url)
    blockedUrl.hostname = "0.0.0.0"
    const serverA = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response(null, { status: 302, headers: { Location: blockedUrl.href } })
      },
    })

    try {
      expect(isTestNetworkUrlAllowed(blockedUrl.href)).toBe(false)
      await expect(fetch(serverA.url)).rejects.toThrow("Live network fetch blocked during tests")
      expect(requests).toBe(0)
    } finally {
      await serverA.stop(true)
      await serverB.stop(true)
    }
  })

  test("follows redirects to allowed loopback URLs", async () => {
    const serverB = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response("allowed redirect destination")
      },
    })
    const serverA = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response(null, { status: 302, headers: { Location: serverB.url.href } })
      },
    })

    try {
      const response = await fetch(serverA.url)
      expect(await response.text()).toBe("allowed redirect destination")
    } finally {
      await serverA.stop(true)
      await serverB.stop(true)
    }
  })
})
