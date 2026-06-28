import { $ } from "bun"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  ensureSourceTag,
  publishWithSourceTag,
  removeSourceTag,
  resolveRemoteSourceTagSha,
} from "./release-source-tag"

const TEST_ROOT_PREFIX = "buddy-release-source-tag-"
const TEST_TAG = "v1.2.3"

const testRoots: string[] = []

afterEach(() => {
  for (const root of testRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

async function createRepository(): Promise<{
  remoteDir: string
  repoDir: string
  target: string
}> {
  const root = mkdtempSync(path.join(os.tmpdir(), TEST_ROOT_PREFIX))
  testRoots.push(root)
  const remoteDir = path.join(root, "remote.git")
  const repoDir = path.join(root, "repo")

  await $`git init --bare ${remoteDir}`.quiet()
  await $`git init ${repoDir}`.quiet()
  await $`git config user.name ${"Buddy Tests"}`.cwd(repoDir)
  await $`git config user.email ${"buddy-tests@example.invalid"}`.cwd(repoDir)
  await Bun.write(path.join(repoDir, "README.md"), "release source tag test\n")
  await $`git add README.md`.cwd(repoDir)
  await $`git commit -m ${"Initial commit"}`.cwd(repoDir).quiet()
  await $`git remote add origin ${remoteDir}`.cwd(repoDir)

  const target = await $`git rev-parse HEAD`
    .cwd(repoDir)
    .text()
    .then((output) => output.trim())
  return { remoteDir, repoDir, target }
}

describe("release source tag", () => {
  test("creates a source tag only when it is absent", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }

    await expect(ensureSourceTag(input)).resolves.toBe("created")
    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
    const state = await ensureSourceTag(input)
    expect(state).toBe("existing")
  })

  test("resolves annotated source tags to their commit", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }

    await $`git tag --annotate ${TEST_TAG} --message ${"Annotated release"} ${repository.target}`
      .cwd(repository.repoDir)
      .quiet()
    await $`git push origin ${`refs/tags/${TEST_TAG}`}`.cwd(repository.repoDir).quiet()

    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
    await expect(ensureSourceTag(input)).resolves.toBe("existing")
  })

  test("does not claim a source tag created concurrently", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }
    await $`git push origin ${`HEAD:refs/heads/main`}`.cwd(repository.repoDir).quiet()
    const hookPath = path.join(repository.repoDir, ".git", "hooks", "pre-push")
    await Bun.write(
      hookPath,
      [
        "#!/bin/sh",
        `git --git-dir=${JSON.stringify(repository.remoteDir)} update-ref ${JSON.stringify(`refs/tags/${TEST_TAG}`)} ${JSON.stringify(repository.target)}`,
        "",
      ].join("\n"),
    )
    await $`chmod +x ${hookPath}`

    const state = await ensureSourceTag(input)
    expect(state).toBe("existing")
    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
  })

  test("removes a source tag created for a failed publish", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }

    const publishError = new Error("publish failed")
    await expect(
      publishWithSourceTag(input, {
        isPublished: async () => false,
        publish: async () => {
          throw publishError
        },
      }),
    ).rejects.toBe(publishError)

    await expect(resolveRemoteSourceTagSha(input)).resolves.toBeUndefined()
  })

  test("preserves an existing source tag when a publish rerun fails", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }
    await ensureSourceTag(input)
    const publishError = new Error("publish failed")

    await expect(
      publishWithSourceTag(input, {
        isPublished: async () => false,
        publish: async () => {
          throw publishError
        },
      }),
    ).rejects.toBe(publishError)

    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
  })

  test("preserves the source tag when publication succeeds despite a client error", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }
    const publishError = new Error("response lost")
    let published = false

    await expect(
      publishWithSourceTag(input, {
        isPublished: async () => published,
        publish: async () => {
          published = true
          throw publishError
        },
      }),
    ).resolves.toBeUndefined()

    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
  })

  test("preserves the source tag when publication cannot be verified", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }
    const verificationError = new Error("verification failed")

    await expect(
      publishWithSourceTag(input, {
        isPublished: async () => {
          throw verificationError
        },
        publish: async () => {
          throw new Error("publish failed")
        },
      }),
    ).rejects.toThrow("publication state is unknown")

    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
  })

  test("preserves a source tag that points at another commit", async () => {
    const repository = await createRepository()
    const input = {
      rootDir: repository.repoDir,
      tag: TEST_TAG,
      target: repository.target,
    }
    await ensureSourceTag(input)
    await Bun.write(path.join(repository.repoDir, "README.md"), "second commit\n")
    await $`git add README.md`.cwd(repository.repoDir)
    await $`git commit -m ${"Second commit"}`.cwd(repository.repoDir).quiet()
    const nextTarget = await $`git rev-parse HEAD`
      .cwd(repository.repoDir)
      .text()
      .then((output) => output.trim())
    const conflictingInput = { ...input, target: nextTarget }

    await expect(ensureSourceTag(conflictingInput)).rejects.toThrow(
      `Source tag ${TEST_TAG} already exists`,
    )
    await expect(removeSourceTag(conflictingInput)).rejects.toThrow(
      `Refusing to remove source tag ${TEST_TAG}`,
    )
    await expect(resolveRemoteSourceTagSha(input)).resolves.toBe(repository.target)
  })
})
