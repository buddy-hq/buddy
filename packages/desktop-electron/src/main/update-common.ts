import { latestReleaseVersionFromReleases } from "@buddy/script/release-version"
import { verifySignedMessage } from "@buddy/script/minisign"
import { z } from "zod"
import type { UpdateRing } from "../shared/update-state"
import { parseWithSchema } from "../shared/parse-external"
import { UPDATE_RING_PREVIEW } from "../shared/update-state"

const SIGNATURE_SUFFIX = ".sig"
const GITHUB_RELEASES_API_ACCEPT_HEADER = "application/vnd.github+json"
const GITHUB_RELEASES_API_VERSION_HEADER = "2022-11-28"
const GITHUB_RELEASES_API_USER_AGENT = "Buddy-Updater"
const LATEST_PRERELEASE_SEARCH_LIMIT = 100

export const RELEASE_REPOSITORY_OWNER = "prashantbhudwal"
export const RELEASE_REPOSITORY_NAME = "buddy-releases"
export const RELEASE_REPOSITORY = `${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`
export const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"
export const BUDDY_MINISIGN_PUBLIC_KEY = "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f"

type TGithubRelease = {
  draft: boolean
  prerelease: boolean
  publishedAt: string
  tagName: string
}

const githubReleaseSchema = z.object({
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string(),
  tag_name: z.string().min(1),
})

type VersionedReleaseAssetUrlInput = {
  legacyFilename?: string
  primaryFilename: string
  version: string
}

export class SignedUpdateFetchError extends Error {
  readonly status: number
  readonly url: string

  constructor(input: { message: string; status: number; url: string }) {
    super(input.message)
    this.name = "SignedUpdateFetchError"
    this.status = input.status
    this.url = input.url
  }
}

export function resolveLatestReleaseAssetUrl(filename: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/${filename}`
}

export function resolveReleaseDownloadBaseUrl(version: string): string {
  return resolveReleaseTagDownloadBaseUrl(`v${version}`)
}

export function resolveReleaseAssetUrl(version: string, filename: string): string {
  return resolveReleaseTagAssetUrl(`v${version}`, filename)
}

export function resolveVersionedReleaseAssetUrls(
  input: VersionedReleaseAssetUrlInput,
): readonly string[] {
  const primaryUrl = resolveReleaseAssetUrl(input.version, input.primaryFilename)
  if (!input.legacyFilename || input.legacyFilename === input.primaryFilename) {
    return [primaryUrl]
  }

  return [primaryUrl, resolveReleaseAssetUrl(input.version, input.legacyFilename)]
}

export function resolveReleaseTagDownloadBaseUrl(tag: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/`
}

export function resolveReleaseTagAssetUrl(tag: string, filename: string): string {
  if (isAbsoluteUrl(filename)) {
    return filename
  }

  return new URL(filename, resolveReleaseTagDownloadBaseUrl(tag)).toString()
}

export async function resolveLatestPrereleaseAssetUrl(filename: string): Promise<string> {
  const release = await fetchLatestGithubPrerelease()
  if (!release) {
    throw new Error("No published GitHub prerelease found")
  }

  return resolveReleaseTagAssetUrl(release.tagName, filename)
}

export async function resolveLatestPreviewAssetUrl(filename: string): Promise<string> {
  const release = await fetchLatestGithubPreviewRelease()
  if (!release) {
    return resolveLatestReleaseAssetUrl(filename)
  }

  return resolveReleaseTagAssetUrl(release.tagName, filename)
}

export async function resolveLatestRingAssetUrl(input: {
  filename: string
  ring: UpdateRing
}): Promise<string> {
  if (input.ring === UPDATE_RING_PREVIEW) {
    return await resolveLatestPreviewAssetUrl(input.filename)
  }

  return resolveLatestReleaseAssetUrl(input.filename)
}

async function fetchLatestGithubPrerelease(): Promise<TGithubRelease | undefined> {
  const releases = await fetchGithubReleases()
  let latestPrerelease: TGithubRelease | undefined
  for (const release of releases) {
    if (release.draft || !release.prerelease) continue
    if (
      !latestPrerelease ||
      releasePublishedAtTime(release) > releasePublishedAtTime(latestPrerelease)
    ) {
      latestPrerelease = release
    }
  }

  return latestPrerelease
}

async function fetchLatestGithubPreviewRelease(): Promise<TGithubRelease | undefined> {
  const releases = await fetchGithubReleases()
  const latestVersion = latestReleaseVersionFromReleases(
    releases.map((release) => ({
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      tagName: release.tagName,
    })),
  )

  if (!latestVersion) return undefined
  return releases.find(
    (release) => !release.draft && release.tagName.replace(/^v/, "") === latestVersion,
  )
}

async function fetchGithubReleases(): Promise<TGithubRelease[]> {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=${LATEST_PRERELEASE_SEARCH_LIMIT}`,
    {
      headers: {
        Accept: GITHUB_RELEASES_API_ACCEPT_HEADER,
        "Cache-Control": "no-cache",
        "User-Agent": GITHUB_RELEASES_API_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_RELEASES_API_VERSION_HEADER,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub releases: ${response.status} ${response.statusText}`)
  }

  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error("GitHub releases response was not an array")
  }

  const releases: TGithubRelease[] = []
  for (const item of body) {
    const release = parseGithubRelease(item)
    if (release) releases.push(release)
  }

  return releases
}

function releasePublishedAtTime(release: TGithubRelease): number {
  const time = Date.parse(release.publishedAt)
  return Number.isNaN(time) ? 0 : time
}

function parseGithubRelease<TValue>(value: TValue): TGithubRelease | undefined {
  const parsed = parseWithSchema(githubReleaseSchema, value)
  if (parsed === undefined) return undefined

  return {
    draft: parsed.draft,
    prerelease: parsed.prerelease,
    publishedAt: parsed.published_at,
    tagName: parsed.tag_name,
  }
}

export async function fetchSignedText(input: { publicKey?: string; url: string }): Promise<string> {
  const [contentResponse, signatureResponse] = await Promise.all([
    fetch(input.url, {
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
    fetch(`${input.url}${SIGNATURE_SUFFIX}`, {
      headers: {
        Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
  ])

  if (!contentResponse.ok) {
    throw new SignedUpdateFetchError({
      message: `Failed to fetch signed update content: ${contentResponse.status} ${contentResponse.statusText}`,
      status: contentResponse.status,
      url: input.url,
    })
  }

  if (!signatureResponse.ok) {
    throw new SignedUpdateFetchError({
      message: `Failed to fetch update signature: ${signatureResponse.status} ${signatureResponse.statusText}`,
      status: signatureResponse.status,
      url: `${input.url}${SIGNATURE_SUFFIX}`,
    })
  }

  const [contentText, signatureOuterText] = await Promise.all([
    contentResponse.text(),
    signatureResponse.text(),
  ])

  const verified = await verifySignedMessage({
    message: Buffer.from(contentText, "utf8"),
    publicKey: input.publicKey ?? BUDDY_MINISIGN_PUBLIC_KEY,
    signatureFileText: decodeTauriSignatureOuterText(signatureOuterText),
  })

  if (!verified) {
    throw new Error("Signed update content verification failed")
  }

  return contentText
}

export async function fetchSignedElectronUpdateManifest(input: {
  publicKey?: string
  url: string
}): Promise<{ content: string; version: string }> {
  const content = await fetchSignedText(input)
  const version = parseElectronUpdateManifestVersion(content)
  return {
    content,
    version,
  }
}

export function parseElectronUpdateManifestVersion(content: string): string {
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("version:")) continue

    const version = trimmed
      .slice("version:".length)
      .trim()
      .replace(/^['"]|['"]$/gu, "")
    if (version.length > 0) {
      return version
    }
  }

  throw new Error("Signed update manifest is missing version")
}

export function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://")
}

function decodeTauriSignatureOuterText(signatureOuterText: string): string {
  return Buffer.from(signatureOuterText.trim(), "base64").toString("utf8")
}
