import { afterEach, describe, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { fetchRecoveryPolicy, resolveRecoveryPolicyUrl } from "../src/main/recovery-policy-source"
import { createTestFetch } from "./helpers/fetch"
import { signedUpdateFixture } from "./helpers/signed-update"

const originalFetch = globalThis.fetch
const originalUrl = process.env.BUDDY_RECOVERY_POLICY_URL
const originalKey = process.env.BUDDY_UPDATE_PUBLIC_KEY
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of [
    ["BUDDY_RECOVERY_POLICY_URL", originalUrl],
    ["BUDDY_UPDATE_PUBLIC_KEY", originalKey],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const logger = { warn: () => undefined }

describe("recovery-policy distribution", () => {
  test("keeps prod latest and ambient URL behavior", async () => {
    delete process.env.BUDDY_RECOVERY_POLICY_URL
    expect(await resolveRecoveryPolicyUrl(BUDDY_DISTRIBUTIONS.prod)).toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/recovery-policy.json",
    )
    process.env.BUDDY_RECOVERY_POLICY_URL = "https://example.invalid/policy.json"
    expect(await resolveRecoveryPolicyUrl(BUDDY_DISTRIBUTIONS.prod)).toBe(
      "https://example.invalid/policy.json",
    )
  })

  test("discovers the highest Beta release for policy metadata, including prereleases", async () => {
    process.env.BUDDY_RECOVERY_POLICY_URL = "https://example.invalid/prod-policy.json"
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return Response.json([
        { draft: false, prerelease: false, tag_name: "v1.0.0" },
        { draft: false, prerelease: true, tag_name: "v2.0.0" },
      ])
    })
    expect(await resolveRecoveryPolicyUrl(BUDDY_DISTRIBUTIONS.beta)).toBe(
      "https://github.com/prashantbhudwal/buddy-beta-releases/releases/download/v2.0.0/recovery-policy.json",
    )
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-beta-releases/releases?per_page=100",
    ])
  })

  test("ignores prod URL and key overrides and fails closed before discovery", async () => {
    process.env.BUDDY_RECOVERY_POLICY_URL =
      "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/recovery-policy.json"
    process.env.BUDDY_UPDATE_PUBLIC_KEY = BUDDY_DISTRIBUTIONS.prod.updaterPublicKey
    const requested: string[] = []
    const warnings: unknown[][] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return Response.json([{ draft: false, prerelease: true, tag_name: "v2.0.0" }])
    })
    expect(
      await fetchRecoveryPolicy({
        distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null },
        logger: {
          warn: (...args) => {
            warnings.push(args)
          },
        },
      }),
    ).toBeUndefined()
    expect(requested).toEqual([])
    expect(warnings[0]?.[1]).toBeInstanceOf(Error)
    expect(String(warnings[0]?.[1])).toContain("Buddy Beta updates are not configured")
  })

  test("keeps explicit URL/key injection and derives policy provenance from verification, never JSON", async () => {
    const payload = JSON.stringify({ schema: 1, distribution: "prod", badVersions: [] })
    const fixture = signedUpdateFixture(payload)
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return new Response(String(url).endsWith(".sig") ? fixture.signature : payload)
    })
    expect(
      await fetchRecoveryPolicy({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        policyUrl: "https://example.invalid/beta-policy.json",
        publicKey: fixture.publicKey,
        logger,
      }),
    ).toEqual({ schema: 1, distribution: "beta", badVersions: [] })
    expect(requested.toSorted()).toEqual([
      "https://example.invalid/beta-policy.json",
      "https://example.invalid/beta-policy.json.sig",
    ])
    await expect(
      fetchRecoveryPolicy({
        distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey },
        policyUrl: "https://example.invalid/beta-policy.json",
        logger,
      }),
    ).resolves.toEqual({ schema: 1, distribution: "beta", badVersions: [] })
  })
})
