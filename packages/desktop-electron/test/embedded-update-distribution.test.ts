import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"

// Compile in a fresh process so Bun's build cache cannot share test-runner module instances.
const COMPILE_AND_READ = `
const [entrypoint, channel, output] = process.argv.slice(1)
const build = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
  format: "esm",
  define: { "import.meta.env.BUDDY_CHANNEL": JSON.stringify(channel) },
})
if (!build.success || !build.outputs[0]) throw new Error(String(build.logs))
await Bun.write(output, await build.outputs[0].text())
process.env.BUDDY_CHANNEL = channel === "prod" ? "beta" : "prod"
const updater = await import(output)
const requested = []
globalThis.fetch = async (url) => { requested.push(String(url)); throw new Error("Unexpected fetch") }
let verificationError
if (channel === "beta") {
  try { await updater.fetchSignedText({ distribution: { ...updater.UPDATE_DISTRIBUTION, updaterPublicKey: null }, url: "https://example.invalid/metadata.json" }) }
  catch (error) { verificationError = error.message }
}
process.stdout.write(JSON.stringify({
  repository: updater.RELEASE_REPOSITORY,
  key: updater.UPDATE_DISTRIBUTION.updaterPublicKey,
  verificationError,
  requested,
}))
`

test.each(["prod", "beta"] as const)(
  "embedded %s updater defaults cannot be changed by the ambient channel",
  async (channel) => {
    const root = await mkdtemp(join(tmpdir(), "buddy-embedded-update-test-"))
    try {
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          COMPILE_AND_READ,
          resolve(import.meta.dir, "../src/main/update-common.ts"),
          channel,
          join(root, "updater.mjs"),
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      const [output, errors, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect({ exitCode, errors }).toEqual({ exitCode: 0, errors: "" })
      const result = JSON.parse(output)
      expect(result.repository).toBe(
        `prashantbhudwal/${channel === "beta" ? "buddy-beta-releases" : "buddy-releases"}`,
      )
      expect(result.key).toBe(BUDDY_DISTRIBUTIONS[channel].updaterPublicKey)
      if (channel === "beta") {
        expect(result.verificationError).toBe("Buddy Beta updates are not configured.")
        expect(result.requested).toEqual([])
      } else {
        expect(result.key).toBe("RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f")
      }
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  },
)
