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
})
