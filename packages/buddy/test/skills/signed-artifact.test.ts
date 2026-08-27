import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  createSignedArtifactEnvelope,
  createSignedArtifactStore,
} from "../../src/learning/skill-management/service/signed-artifact"
import { temporaryDirectory } from "../helpers/temporary-directory"

const testArtifactSchema = z.strictObject({
  revision: z.number().int().positive(),
  value: z.string(),
})

type TestArtifact = z.infer<typeof testArtifactSchema>

function ignoreDeferredResolution(): void {
  return undefined
}

function createDeferredResolution() {
  let resolveCompletion: () => void = ignoreDeferredResolution
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })
  return {
    completion,
    resolve: resolveCompletion,
  }
}

function payload(artifact: TestArtifact): Uint8Array {
  return Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8")
}

function envelope(artifact: TestArtifact): string {
  return `${JSON.stringify(
    createSignedArtifactEnvelope({
      payloadBytes: payload(artifact),
      tauriSignature: Buffer.from("test signature", "utf8").toString("base64"),
    }),
  )}\n`
}

function store(input: {
  cacheRoot: string
  bundled: TestArtifact
  remote: () => TestArtifact
  signatureValid?: boolean
  beforeLoadBundled?: () => Promise<void>
}) {
  return createSignedArtifactStore<TestArtifact>({
    artifactLabel: "test artifact",
    cacheRoot: () => input.cacheRoot,
    loadBundled: async () => {
      await input.beforeLoadBundled?.()
      return {
        value: input.bundled,
        payloadBytes: payload(input.bundled),
        revision: input.bundled.revision,
      }
    },
    parsePayload: (value) => testArtifactSchema.parse(value),
    publicKey: () => "test-public-key",
    remoteUrl: () => "https://example.invalid/artifact.json",
    revision: (value) => value.revision,
    fetch: async () => new Response(envelope(input.remote())),
    verifySignature: async () => input.signatureValid !== false,
  })
}

describe("signed skill artifact store", () => {
  test("rejects payloads that cannot fit the artifact delivery contract", () => {
    const oversizedPayload = new Uint8Array(32 * 1024 * 1024 + 1)

    expect(() =>
      createSignedArtifactEnvelope({
        payloadBytes: oversizedPayload,
        tauriSignature: Buffer.from("test signature", "utf8").toString("base64"),
      }),
    ).toThrow("decoded payload limit")
  })

  test("accepts, caches, and reloads a higher signed revision", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-artifact-" })
    const remote = { revision: 2, value: "remote" }
    const first = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => remote,
    })

    const refreshed = await first.refresh()
    expect(refreshed.value).toEqual(remote)
    expect(refreshed.source).toBe("remote")

    const reloaded = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => remote,
    })
    const cached = await reloaded.get()
    expect(cached.value).toEqual(remote)
    expect(cached.source).toBe("cache")
  })

  test("shares initial resolution between startup refresh and request-time reads", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-concurrent-" })
    const loadBarrier = createDeferredResolution()
    let loadCount = 0
    const artifactStore = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => ({ revision: 2, value: "remote" }),
      beforeLoadBundled: async () => {
        loadCount += 1
        await loadBarrier.completion
      },
    })

    const requestRead = artifactStore.get()
    const startupRefresh = artifactStore.refresh()
    loadBarrier.resolve()
    const [requestResolution, refreshResolution] = await Promise.all([requestRead, startupRefresh])

    expect(loadCount).toBe(1)
    expect(requestResolution.value.value).toBe("bundled")
    expect(refreshResolution.value.value).toBe("remote")
    await expect(fsp.readFile(path.join(root.path, "state.json"), "utf8")).resolves.toContain(
      '"highestAcceptedRevision": 2',
    )
  })

  test("recovers an accepted revision when its cached envelope is missing", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-recovery-" })
    const remote = { revision: 2, value: "remote" }
    const first = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => remote,
    })
    await first.refresh()
    await fsp.rm(path.join(root.path, "artifact.envelope.json"))

    const recovered = await store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => remote,
    }).refresh()

    expect(recovered.value).toEqual(remote)
    expect(recovered.source).toBe("remote")
  })

  test("ignores a remote revision lagging behind the trusted bundled revision", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-bundled-ahead-" })
    const artifactStore = store({
      cacheRoot: root.path,
      bundled: { revision: 2, value: "bundled" },
      remote: () => ({ revision: 1, value: "remote-lagging" }),
    })

    const refreshed = await artifactStore.refresh()
    expect(refreshed.value.value).toBe("bundled")
    expect(refreshed.source).toBe("bundled")
    expect(refreshed.syncError).toBeUndefined()
  })

  test("rejects rollback and same-revision replacement while retaining last-known-good", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-rollback-" })
    let remote = { revision: 2, value: "accepted" }
    const artifactStore = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => remote,
    })
    await artifactStore.refresh()

    remote = { revision: 1, value: "rollback" }
    const rollback = await artifactStore.refresh()
    expect(rollback.value.value).toBe("accepted")
    expect(rollback.syncError).toContain("older than accepted revision")

    remote = { revision: 2, value: "replacement" }
    const replacement = await artifactStore.refresh()
    expect(replacement.value.value).toBe("accepted")
    expect(replacement.syncError).toContain("changed without a revision increment")
  })

  test("retains bundled content when signature verification fails", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-signed-invalid-" })
    const artifactStore = store({
      cacheRoot: root.path,
      bundled: { revision: 1, value: "bundled" },
      remote: () => ({ revision: 2, value: "tampered" }),
      signatureValid: false,
    })

    const refreshed = await artifactStore.refresh()
    expect(refreshed.value.value).toBe("bundled")
    expect(refreshed.source).toBe("bundled")
    expect(refreshed.syncError).toContain("signature verification failed")
  })
})
