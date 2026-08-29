import { $ } from "bun"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { RELEASE_FREEZE_FILENAME } from "./constants"

const SHA256_DIGEST_PREFIX = "sha256:"
const ASSET_DIGEST_ATTEMPTS = 5
const ASSET_DIGEST_RETRY_DELAY_MS = 2_000
const githubAssetDigestSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().startsWith(SHA256_DIGEST_PREFIX).nullable(),
)

const githubReleaseAssetSchema = z.object({
  apiUrl: z.string().url(),
  digest: githubAssetDigestSchema,
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
})

const githubReleaseStateSchema = z.object({
  assets: z.array(githubReleaseAssetSchema),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
})

export type GithubReleaseAsset = z.infer<typeof githubReleaseAssetSchema>
export type GithubReleaseState = z.infer<typeof githubReleaseStateSchema>

export type ReleaseAssetDigest = {
  name: string
  sha256: string
  size: number
}

type ReleaseAssetUploadArguments = {
  files: string[]
  repository: string
  tag: string
}

export function normalizeSha256Digest(value: string): string {
  const normalized = value.trim().toLowerCase()
  const digest = normalized.startsWith(SHA256_DIGEST_PREFIX)
    ? normalized.slice(SHA256_DIGEST_PREFIX.length)
    : normalized
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`Invalid SHA-256 digest: ${value}`)
  }
  return digest
}

export function parseGithubReleaseAssets<TValue>(value: TValue): GithubReleaseAsset[] {
  const parsed = z.object({ assets: z.array(githubReleaseAssetSchema) }).safeParse(value)
  if (!parsed.success) {
    throw new Error("GitHub release response did not contain valid asset metadata")
  }
  return parsed.data.assets.toSorted((left, right) => left.name.localeCompare(right.name))
}

export async function readGithubReleaseAssets(
  repository: string,
  tag: string,
): Promise<GithubReleaseAsset[]> {
  return (await readGithubReleaseState(repository, tag)).assets
}

export async function readGithubReleaseState(
  repository: string,
  tag: string,
): Promise<GithubReleaseState> {
  const value =
    await $`gh release view ${tag} --repo ${repository} --json assets,isDraft,isPrerelease`
      .quiet()
      .json()
  const parsed = githubReleaseStateSchema.safeParse(value)
  if (!parsed.success) throw new Error("GitHub release response was invalid")
  return {
    ...parsed.data,
    assets: parsed.data.assets.toSorted((left, right) => left.name.localeCompare(right.name)),
  }
}

async function readGithubReleaseStateWithSettledAssetDigest(
  repository: string,
  tag: string,
  assetName: string,
): Promise<GithubReleaseState> {
  for (let attempt = 1; attempt <= ASSET_DIGEST_ATTEMPTS; attempt += 1) {
    const release = await readGithubReleaseState(repository, tag)
    const asset = release.assets.find((candidate) => candidate.name === assetName)
    if (asset?.digest || attempt === ASSET_DIGEST_ATTEMPTS) return release
    await Bun.sleep(ASSET_DIGEST_RETRY_DELAY_MS)
  }
  throw new Error("Unreachable release asset digest retry state")
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest("hex")
}

export async function localReleaseAssetDigest(filePath: string): Promise<ReleaseAssetDigest> {
  const [sha256, metadata] = await Promise.all([sha256File(filePath), stat(filePath)])
  return {
    name: path.basename(filePath),
    sha256,
    size: metadata.size,
  }
}

export function githubAssetDigest(asset: GithubReleaseAsset): ReleaseAssetDigest {
  if (!asset.digest) {
    throw new Error(`GitHub did not provide a SHA-256 digest for ${asset.name}`)
  }
  return {
    name: asset.name,
    sha256: normalizeSha256Digest(asset.digest),
    size: asset.size,
  }
}

export function releaseAssetDigestsEqual(
  left: ReleaseAssetDigest,
  right: ReleaseAssetDigest,
): boolean {
  return left.name === right.name && left.sha256 === right.sha256 && left.size === right.size
}

export function releaseAssetUploadDecision(
  release: GithubReleaseState,
  local: ReleaseAssetDigest,
): "noop" | "write" {
  const existing = release.assets.find((asset) => asset.name === local.name)
  if (existing?.digest && releaseAssetDigestsEqual(githubAssetDigest(existing), local)) {
    return "noop"
  }
  if (!release.isDraft) throw new Error("Refusing to modify a published release")
  if (release.assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)) {
    throw new Error("Refusing to modify a frozen release")
  }
  return "write"
}

export function releaseAssetDigestNeedsSettlement(
  release: GithubReleaseState,
  assetName: string,
): boolean {
  const asset = release.assets.find((candidate) => candidate.name === assetName)
  return Boolean(asset && !asset.digest)
}

export async function uploadReleaseAssetSafely(input: {
  filePath: string
  repository: string
  tag: string
}): Promise<ReleaseAssetDigest> {
  const local = await localReleaseAssetDigest(input.filePath)
  let release = await readGithubReleaseState(input.repository, input.tag)
  let existing = release.assets.find((asset) => asset.name === local.name)
  if (releaseAssetDigestNeedsSettlement(release, local.name)) {
    release = await readGithubReleaseStateWithSettledAssetDigest(
      input.repository,
      input.tag,
      local.name,
    )
    existing = release.assets.find((asset) => asset.name === local.name)
  }

  if (releaseAssetUploadDecision(release, local) === "noop") {
    console.log(`Release asset already matches: ${local.name}`)
    return local
  }

  if (existing) {
    await $`gh api --method DELETE ${existing.apiUrl}`.quiet()
  }

  await $`gh release upload ${input.tag} ${input.filePath} --repo ${input.repository}`
  const uploaded = (
    await readGithubReleaseStateWithSettledAssetDigest(input.repository, input.tag, local.name)
  ).assets.find((asset) => asset.name === local.name)
  if (!uploaded || !releaseAssetDigestsEqual(githubAssetDigest(uploaded), local)) {
    throw new Error(`Uploaded release asset did not match local bytes: ${local.name}`)
  }

  return local
}

export async function downloadReleaseAsset(input: {
  directory: string
  name: string
  repository: string
  tag: string
}): Promise<string> {
  await mkdir(input.directory, { recursive: true })
  const outputPath = path.join(input.directory, input.name)
  await rm(outputPath, { force: true })
  await $`gh release download ${input.tag} --repo ${input.repository} --dir ${input.directory} --pattern ${input.name}`.quiet()
  return outputPath
}

export function assertAssetDigestSet(input: {
  actual: readonly ReleaseAssetDigest[]
  expected: readonly ReleaseAssetDigest[]
  label: string
}): void {
  const actual = input.actual.toSorted((left, right) => left.name.localeCompare(right.name))
  const expected = input.expected.toSorted((left, right) => left.name.localeCompare(right.name))
  if (actual.length !== expected.length) {
    throw new Error(
      `${input.label} asset count mismatch: expected ${expected.length}, received ${actual.length}`,
    )
  }

  for (let index = 0; index < expected.length; index += 1) {
    const expectedAsset = expected[index]
    const actualAsset = actual[index]
    if (!expectedAsset || !actualAsset || !releaseAssetDigestsEqual(expectedAsset, actualAsset)) {
      throw new Error(
        `${input.label} asset mismatch: expected ${JSON.stringify(expectedAsset)}, received ${JSON.stringify(actualAsset)}`,
      )
    }
  }
}

function parseUploadArgs(): ReleaseAssetUploadArguments {
  let repository = ""
  let tag = ""
  const files: string[] = []
  for (let index = 3; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === "--repo") {
      repository = process.argv[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument === "--tag") {
      tag = process.argv[index + 1]?.trim() ?? ""
      index += 1
      continue
    }
    if (argument) files.push(argument)
  }
  if (!repository || !tag || files.length === 0) {
    throw new Error(
      "Usage: bun ./script/release/assets.ts upload --repo owner/repo --tag vX.Y.Z <files...>",
    )
  }
  return { files, repository, tag }
}

if (import.meta.main) {
  if (process.argv[2] !== "upload") {
    throw new Error("Usage: bun ./script/release/assets.ts upload")
  }
  const input = parseUploadArgs()
  for (const filePath of input.files) {
    await uploadReleaseAssetSafely({
      filePath,
      repository: input.repository,
      tag: input.tag,
    })
  }
}
